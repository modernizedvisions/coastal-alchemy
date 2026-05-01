import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { ProductVideoStatus, ProductVideoSummary } from '../../lib/types';
import { Loader2 } from 'lucide-react';
import {
  adminAttachProductVideo,
  adminCreateProductVideoUpload,
  adminFetchProductVideo,
  adminRemoveProductVideo,
  adminReplaceProductVideo,
  adminSendVideoDebugBeacon,
  type AdminProductVideoDetails,
  type VideoDebugStage,
} from '../../lib/adminApi';
import {
  PRODUCT_VIDEO_ACCEPTED_EXTENSIONS,
  PRODUCT_VIDEO_ACCEPTED_MIME_TYPES,
  PRODUCT_VIDEO_MAX_BYTES,
  emptyProductVideoSummary,
  normalizeProductVideoStatus,
} from '../../lib/productVideo';

type ClientUploadStage =
  | 'idle'
  | 'validating-file'
  | 'requesting-upload-url'
  | 'uploading-to-cloudflare'
  | 'attaching-to-product'
  | 'processing'
  | 'ready'
  | 'error';

type UploadErrorDiagnostics = {
  uploadAttemptId: string | null;
  stage: VideoDebugStage;
  httpStatus: number | null;
  responseSnippet: string | null;
  errorName: string | null;
};

type UploadFlowError = Error & {
  stage: VideoDebugStage;
  httpStatus: number | null;
  responseSnippet: string | null;
  errorName: string | null;
  errorStack: string | null;
};

type ErrorWithHttpDetails = Error & {
  httpStatus?: number | null;
  upstreamHttpStatus?: number | null;
  responseSnippet?: string | null;
};

type DirectUploadResult = {
  method: 'POST';
  httpStatus: number;
  responseSnippet: string | null;
  headers: Record<string, string | null>;
};

const CLIENT_LOG_PREFIX = '[video][client]';
const PROCESSING_POLL_INTERVAL_MS = 2500;
const PROCESSING_MAX_POLL_ATTEMPTS = 10;
const PROCESSING_MAX_POLL_MS = 30000;
const PROCESSING_FALLBACK_PROMPT = 'VIDEO UPLOADED! REFRESH OR SAVE TO CONTINUE';

const statusLabel = (status: ProductVideoStatus): string => {
  if (status === 'empty') return 'No Video';
  if (status === 'uploading') return 'Uploading';
  if (status === 'processing') return 'Processing';
  if (status === 'ready') return 'Ready';
  return 'Error';
};

const statusClasses = (status: ProductVideoStatus): string => {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'processing' || status === 'uploading') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'error') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-driftwood/60 bg-white text-charcoal/70';
};

const fileExtension = (filename: string): string => {
  const trimmed = (filename || '').trim().toLowerCase();
  const index = trimmed.lastIndexOf('.');
  if (index < 0) return '';
  return trimmed.slice(index);
};

const formatDuration = (value: number | null | undefined): string | null => {
  if (!Number.isFinite(value as number)) return null;
  const total = Math.max(0, Math.round(Number(value)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
};

const formatBytes = (value: number | null | undefined): string | null => {
  if (!Number.isFinite(value as number)) return null;
  const bytes = Math.max(0, Number(value));
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const truncateText = (value: unknown, maxLength = 500): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
};

const normalizeError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error || 'Video upload failed');
};

const createUploadAttemptId = (): string =>
  `uva-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const logClientInfo = (message: string, payload?: Record<string, unknown>): void => {
  console.info(`${CLIENT_LOG_PREFIX} ${message}`, payload || {});
};

const logClientWarn = (message: string, payload?: Record<string, unknown>): void => {
  console.warn(`${CLIENT_LOG_PREFIX} ${message}`, payload || {});
};

const logClientError = (message: string, payload?: Record<string, unknown>): void => {
  console.error(`${CLIENT_LOG_PREFIX} ${message}`, payload || {});
};

const logDirectUploadInfo = (message: string, payload?: Record<string, unknown>): void => {
  console.info(`[video][direct-upload] ${message}`, payload || {});
};

const logDirectUploadWarn = (message: string, payload?: Record<string, unknown>): void => {
  console.warn(`[video][direct-upload] ${message}`, payload || {});
};

const logDirectUploadError = (message: string, payload?: Record<string, unknown>): void => {
  console.error(`[video][direct-upload] ${message}`, payload || {});
};

const resolveDirectUploadError = (status: number): string => {
  if (status === 400) {
    return 'Cloudflare rejected the file upload body.';
  }
  if (status === 401 || status === 403 || status === 410) {
    return 'Cloudflare rejected the upload request before the video reached Dover.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return `The upload URL was created, but the file upload failed with HTTP ${status}.`;
  }
  if (status === 413) {
    return 'Cloudflare Stream rejected the upload because the file is too large.';
  }
  if (status === 415) {
    return 'Cloudflare Stream rejected this file type. Use MP4 or MOV.';
  }
  if (status === 429) {
    return 'Cloudflare Stream rate-limited the upload. Wait a moment and retry.';
  }
  return `The upload URL was created, but the file upload failed with HTTP ${status}.`;
};

const toUploadFlowError = (
  stage: VideoDebugStage,
  message: string,
  extras?: {
    httpStatus?: number | null;
    responseSnippet?: string | null;
    errorName?: string | null;
    errorStack?: string | null;
  }
): UploadFlowError => {
  const error = new Error(message) as UploadFlowError;
  error.stage = stage;
  error.httpStatus = extras?.httpStatus ?? null;
  error.responseSnippet = extras?.responseSnippet ?? null;
  error.errorName = extras?.errorName ?? null;
  error.errorStack = extras?.errorStack ?? null;
  return error;
};

const isUploadFlowError = (error: unknown): error is UploadFlowError =>
  error instanceof Error &&
  typeof (error as Partial<UploadFlowError>).stage === 'string' &&
  ['create-upload', 'direct-upload', 'attach', 'poll', 'status', 'replace', 'remove', 'error'].includes(
    String((error as Partial<UploadFlowError>).stage)
  );

const toErrorWithHttpDetails = (error: unknown): ErrorWithHttpDetails | null => {
  if (!(error instanceof Error)) return null;
  return error as ErrorWithHttpDetails;
};

const resolveErrorHttpStatus = (error: unknown): number | null => {
  const typed = toErrorWithHttpDetails(error);
  if (!typed) return null;
  if (Number.isFinite(Number(typed.upstreamHttpStatus))) {
    return Number(typed.upstreamHttpStatus);
  }
  if (Number.isFinite(Number(typed.httpStatus))) {
    return Number(typed.httpStatus);
  }
  return null;
};

const resolveErrorResponseSnippet = (error: unknown): string | null => {
  const typed = toErrorWithHttpDetails(error);
  if (!typed) return null;
  return truncateText(typed.responseSnippet, 600);
};

const collectResponseHeaders = (response: Response): Record<string, string | null> => ({
  contentType: response.headers.get('content-type'),
  server: response.headers.get('server'),
  cfRay: response.headers.get('cf-ray'),
});

const uploadDirectToStream = async (params: {
  uploadAttemptId: string;
  productId: string;
  uploadUrl: string;
  file: File;
}): Promise<DirectUploadResult> => {
  const { uploadAttemptId, productId, uploadUrl, file } = params;
  const formData = new FormData();
  formData.append('file', file, file.name);

  logDirectUploadInfo('start', {
    uploadAttemptId,
    productId,
    method: 'POST',
    uploadUrlPresent: !!uploadUrl,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    bodyIsFormData: formData instanceof FormData,
    hasFileField: formData.has('file'),
  });

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });
    const headers = collectResponseHeaders(response);
    let responseText = '';
    try {
      responseText = await response.text();
    } catch {
      responseText = '';
    }
    const trimmedText = responseText.trim();
    let responseJson: unknown = null;
    if (trimmedText) {
      try {
        responseJson = JSON.parse(trimmedText);
      } catch {
        responseJson = null;
      }
    }
    const responseSnippet = truncateText(
      responseJson ? JSON.stringify(responseJson) : trimmedText,
      600
    );

    logDirectUploadInfo('response', {
      uploadAttemptId,
      productId,
      method: 'POST',
      httpStatus: response.status,
      statusText: response.statusText,
      headers,
      responseText: truncateText(trimmedText, 1200),
      responseJson,
    });

    if (response.ok) {
      return {
        method: 'POST',
        httpStatus: response.status,
        responseSnippet,
        headers,
      };
    }

    logDirectUploadWarn('non-ok response', {
      uploadAttemptId,
      productId,
      method: 'POST',
      httpStatus: response.status,
      statusText: response.statusText,
      responseSnippet,
    });
    throw toUploadFlowError('direct-upload', resolveDirectUploadError(response.status), {
      httpStatus: response.status,
      responseSnippet,
      errorName: 'HttpResponseError',
    });
  } catch (error) {
    if (isUploadFlowError(error)) {
      throw error;
    }

    const fallback = normalizeError(error);
    logDirectUploadError('request threw before response', {
      uploadAttemptId,
      productId,
      method: 'POST',
      errorMessage: fallback,
    });
    throw toUploadFlowError(
      'direct-upload',
      'Cloudflare rejected the file upload body.',
      {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorStack: error instanceof Error ? truncateText(error.stack, 1200) : null,
        responseSnippet: truncateText(fallback, 600),
      }
    );
  }
};

export type ProductVideoFieldProps = {
  productId?: string | null;
  initialProductVideo?: ProductVideoSummary | null;
  mode: 'create' | 'edit';
  onVideoChanged?: (productVideo: ProductVideoSummary) => void | Promise<void>;
  onPendingFileChange?: (file: File | null) => void | Promise<void>;
  createUploadTargetProductId?: string | null;
  onCreateUploadSettled?: (result: {
    ok: boolean;
    productId: string;
    message: string;
  }) => void | Promise<void>;
};

export function ProductVideoField({
  productId,
  initialProductVideo,
  mode,
  onVideoChanged,
  onPendingFileChange,
  createUploadTargetProductId,
  onCreateUploadSettled,
}: ProductVideoFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const removeInFlightRef = useRef(false);
  const [productVideo, setProductVideo] = useState<ProductVideoSummary>(
    initialProductVideo || emptyProductVideoSummary()
  );
  const [details, setDetails] = useState<AdminProductVideoDetails | null>(null);
  const [uploadStep, setUploadStep] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDiagnostics, setErrorDiagnostics] = useState<UploadErrorDiagnostics | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [clientStage, setClientStage] = useState<ClientUploadStage>('idle');
  const [activeUploadAttemptId, setActiveUploadAttemptId] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [processingStartedAt, setProcessingStartedAt] = useState<number | null>(null);
  const [processingPollAttempts, setProcessingPollAttempts] = useState(0);
  const [showProcessingFallbackPrompt, setShowProcessingFallbackPrompt] = useState(false);
  const [pendingCreateFile, setPendingCreateFile] = useState<File | null>(null);
  const createUploadInFlightForProductIdRef = useRef<string | null>(null);

  const status = useMemo<ProductVideoStatus>(() => {
    const detailStatus = normalizeProductVideoStatus(details?.status);
    if (detailStatus !== 'empty') return detailStatus;
    return normalizeProductVideoStatus(productVideo.status);
  }, [details?.status, productVideo.status]);

  const thumbnailUrl = details?.thumbnailUrl || productVideo.thumbnailUrl || null;
  const durationLabel = formatDuration(details?.durationSeconds ?? productVideo.durationSeconds);
  const sizeLabel = formatBytes(details?.sizeBytes);

  const hasProductId = typeof productId === 'string' && productId.trim().length > 0;
  const isProcessing = status === 'uploading' || status === 'processing';
  const isCreateBeforeProductExists = mode === 'create' && !hasProductId;
  const hasQueuedCreateVideo = isCreateBeforeProductExists && !!pendingCreateFile;
  const hasExistingVideo = productVideo.hasVideo || !!details?.providerAssetId;
  const hasAnyVideo = hasExistingVideo || hasQueuedCreateVideo;
  const queuedSizeLabel = pendingCreateFile ? formatBytes(pendingCreateFile.size) : null;
  const displaySizeLabel = sizeLabel || queuedSizeLabel;
  const displayMimeType = details?.mimeType || (pendingCreateFile?.type || null);
  const statusPillLabel = hasQueuedCreateVideo ? 'Queued' : statusLabel(status);
  const statusPillClasses = hasQueuedCreateVideo
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : statusClasses(status);
  const spinnerText = isRemoving
    ? 'Removing video...'
    : isBusy && clientStage === 'uploading-to-cloudflare'
    ? 'Uploading video...'
    : isBusy && clientStage === 'attaching-to-product'
    ? 'Saving video...'
    : isBusy && clientStage === 'requesting-upload-url'
    ? 'Saving video...'
    : !isBusy && isProcessing
    ? 'Processing video...'
    : null;

  const resetProcessingTracking = () => {
    setProcessingStartedAt(null);
    setProcessingPollAttempts(0);
    setShowProcessingFallbackPrompt(false);
  };

  const startProcessingTracking = () => {
    setProcessingStartedAt((previous) => previous ?? Date.now());
    setProcessingPollAttempts(0);
    setShowProcessingFallbackPrompt(false);
  };

  const syncPendingCreateFile = async (file: File | null) => {
    setPendingCreateFile(file);
    if (onPendingFileChange) {
      await onPendingFileChange(file);
    }
  };

  const setStage = (
    stage: ClientUploadStage,
    stepText?: string | null,
    uploadAttemptId: string | null = activeUploadAttemptId
  ) => {
    setClientStage(stage);
    if (stepText !== undefined) {
      setUploadStep(stepText);
    }
    logClientInfo('stage transition', {
      uploadAttemptId,
      productId,
      stage,
      stepText: stepText ?? null,
    });
  };

  const reportDebugBeacon = async (payload: {
    uploadAttemptId: string | null;
    stage: VideoDebugStage;
    message: string;
    httpStatus?: number | null;
    responseSnippet?: string | null;
    errorName?: string | null;
    errorStack?: string | null;
    file?: File | null;
    extras?: Record<string, unknown>;
  }) => {
    try {
      await adminSendVideoDebugBeacon({
        uploadAttemptId: payload.uploadAttemptId,
        productId: productId || null,
        stage: payload.stage,
        message: payload.message,
        httpStatus: payload.httpStatus ?? null,
        responseSnippet: payload.responseSnippet ?? null,
        errorName: payload.errorName ?? null,
        errorStack: payload.errorStack ?? null,
        fileName: payload.file?.name || null,
        fileSize: payload.file?.size ?? null,
        fileType: payload.file?.type || null,
        extras: payload.extras || null,
      });
      logClientInfo('debug beacon sent', {
        uploadAttemptId: payload.uploadAttemptId,
        stage: payload.stage,
      });
    } catch (error) {
      logClientWarn('debug beacon failed', {
        uploadAttemptId: payload.uploadAttemptId,
        stage: payload.stage,
        errorMessage: normalizeError(error),
      });
    }
  };

  const setUploadError = (
    message: string,
    diagnostics: UploadErrorDiagnostics,
    options?: { keepStepText?: boolean }
  ) => {
    setClientStage('error');
    if (!options?.keepStepText) {
      setUploadStep(null);
    }
    setErrorMessage(message);
    setErrorDiagnostics(diagnostics);
    logClientError('flow error', {
      uploadAttemptId: diagnostics.uploadAttemptId,
      productId,
      stage: diagnostics.stage,
      httpStatus: diagnostics.httpStatus,
      responseSnippet: diagnostics.responseSnippet,
      errorName: diagnostics.errorName,
      message,
    });
  };

  const queueCreateModeFile = async (file: File) => {
    setErrorMessage(null);
    setErrorDiagnostics(null);
    resetProcessingTracking();

    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError, {
        uploadAttemptId: null,
        stage: 'validating-file',
        httpStatus: null,
        responseSnippet: null,
        errorName: 'FileValidationError',
      });
      setUploadStep(null);
      setClientStage('error');
      return;
    }

    await syncPendingCreateFile(file);
    setUploadStep(null);
    setClientStage('idle');
    setInfoMessage('Video selected. It will upload after the product is created.');
  };

  const fetchVideoState = async (silent = false, sourceStage: VideoDebugStage = 'status') => {
    if (!hasProductId) return;
    if (!silent) {
      setIsBusy(true);
      setUploadStep('Refreshing video status...');
    }
    logClientInfo('status request started', {
      uploadAttemptId: activeUploadAttemptId,
      productId,
      sourceStage,
      silent,
    });

    try {
      const response = await adminFetchProductVideo(productId as string, {
        uploadAttemptId: activeUploadAttemptId,
      });
      const nextVideo = response.productVideo || emptyProductVideoSummary();
      setProductVideo(nextVideo);
      setDetails(response.details || null);

      if (response.warning) {
        setInfoMessage(response.warning);
      } else if (!silent) {
        setInfoMessage(null);
      }

      const normalizedStatus = normalizeProductVideoStatus(nextVideo.status);
      if (normalizedStatus === 'ready') {
        setClientStage('ready');
        resetProcessingTracking();
        if (!response.warning) {
          setInfoMessage('Video is ready.');
        }
      } else if (normalizedStatus === 'processing' || normalizedStatus === 'uploading') {
        setClientStage('processing');
        setProcessingStartedAt((previous) => previous ?? Date.now());
      } else if (normalizedStatus === 'error') {
        setClientStage('error');
        resetProcessingTracking();
      } else {
        resetProcessingTracking();
      }

      logClientInfo('status request success', {
        uploadAttemptId: activeUploadAttemptId,
        productId,
        sourceStage,
        status: normalizedStatus,
      });
    } catch (error) {
      const message = 'Could not refresh product video status from Dover.';
      const responseSnippet = truncateText(normalizeError(error), 600);
      if (!silent) {
        setUploadError(message, {
          uploadAttemptId: activeUploadAttemptId,
          stage: 'status',
          httpStatus: null,
          responseSnippet,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      }
      logClientWarn('status request failed', {
        uploadAttemptId: activeUploadAttemptId,
        productId,
        sourceStage,
        errorMessage: normalizeError(error),
      });
      if (!silent) {
        await reportDebugBeacon({
          uploadAttemptId: activeUploadAttemptId,
          stage: sourceStage,
          message,
          responseSnippet,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorStack: error instanceof Error ? truncateText(error.stack, 1200) : null,
        });
      }
    } finally {
      if (!silent) {
        setUploadStep(null);
        setIsBusy(false);
      }
    }
  };

  useEffect(() => {
    setProductVideo(initialProductVideo || emptyProductVideoSummary());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialProductVideo?.hasVideo,
    initialProductVideo?.status,
    initialProductVideo?.providerAssetId,
    initialProductVideo?.thumbnailUrl,
    initialProductVideo?.durationSeconds,
  ]);

  useEffect(() => {
    setDetails(null);
    setErrorMessage(null);
    setErrorDiagnostics(null);
    setInfoMessage(null);
    setUploadStep(null);
    setClientStage('idle');
    setActiveUploadAttemptId(null);
    resetProcessingTracking();
    if (!hasProductId) return;
    void fetchVideoState(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  useEffect(() => {
    if (!hasProductId) return;
    if (isBusy || isRemoving) return;
    if (!isProcessing) return;
    if (showProcessingFallbackPrompt) return;

    const startedAt = processingStartedAt ?? Date.now();
    if (processingStartedAt === null) {
      setProcessingStartedAt(startedAt);
    }

    const elapsedMs = Date.now() - startedAt;
    if (
      processingPollAttempts >= PROCESSING_MAX_POLL_ATTEMPTS ||
      elapsedMs >= PROCESSING_MAX_POLL_MS
    ) {
      if (activeUploadAttemptId) {
        setShowProcessingFallbackPrompt(true);
      }
      return;
    }

    const timer = window.setTimeout(() => {
      setProcessingPollAttempts((previous) => previous + 1);
      void fetchVideoState(true, 'poll');
    }, PROCESSING_POLL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasProductId,
    isProcessing,
    isBusy,
    isRemoving,
    showProcessingFallbackPrompt,
    processingStartedAt,
    processingPollAttempts,
    productVideo.providerAssetId,
    details?.providerAssetId,
    activeUploadAttemptId,
  ]);

  const validateFile = (file: File): string | null => {
    const extension = fileExtension(file.name);
    if (!PRODUCT_VIDEO_ACCEPTED_EXTENSIONS.has(extension)) {
      return 'This file type is not supported. Upload an MP4 or MOV video.';
    }
    const normalizedMime = (file.type || '').trim().toLowerCase();
    if (!PRODUCT_VIDEO_ACCEPTED_MIME_TYPES.has(normalizedMime)) {
      return 'The selected video format is not supported. Use MP4 or MOV.';
    }
    if (file.size <= 0) {
      return 'The selected file is empty.';
    }
    if (file.size > PRODUCT_VIDEO_MAX_BYTES) {
      return 'The selected file is larger than the 50 MB video limit.';
    }
    return null;
  };

  const applyVideoResponse = async (
    response: {
      productVideo: ProductVideoSummary;
      details: AdminProductVideoDetails | null;
      warning?: string | null;
    },
    uploadAttemptId: string
  ) => {
    const nextVideo = response.productVideo || emptyProductVideoSummary();
    setProductVideo(nextVideo);
    setDetails(response.details || null);

    if (response.warning) {
      setInfoMessage(response.warning);
    } else if (nextVideo.status === 'processing' || nextVideo.status === 'uploading') {
      setInfoMessage('Video upload reached Stream. Stream is still processing the video.');
    } else if (nextVideo.status === 'ready') {
      setInfoMessage('Video is ready.');
    } else {
      setInfoMessage(null);
    }

    const normalizedStatus = normalizeProductVideoStatus(nextVideo.status);
    if (normalizedStatus === 'ready') {
      setClientStage('ready');
      resetProcessingTracking();
    } else if (normalizedStatus === 'processing' || normalizedStatus === 'uploading') {
      setClientStage('processing');
      startProcessingTracking();
    } else if (normalizedStatus === 'error') {
      setClientStage('error');
      resetProcessingTracking();
    } else {
      setClientStage('idle');
      resetProcessingTracking();
    }

    logClientInfo('attach/replace response applied', {
      uploadAttemptId,
      productId,
      status: normalizedStatus,
      providerAssetId: nextVideo.providerAssetId,
      warning: response.warning || null,
    });

    if (onVideoChanged) {
      await onVideoChanged(nextVideo);
    }
  };

  const uploadSelectedFile = async (
    file: File,
    options?: { targetProductId?: string | null }
  ): Promise<{ ok: boolean; message: string }> => {
    const explicitTargetProductId = (options?.targetProductId || '').trim();
    const resolvedProductId = explicitTargetProductId || (hasProductId ? (productId as string) : '');
    const uploadAttemptId = createUploadAttemptId();
    setActiveUploadAttemptId(uploadAttemptId);
    setErrorMessage(null);
    setErrorDiagnostics(null);
    setInfoMessage(null);
    resetProcessingTracking();

    setStage('validating-file', 'Validating video file...', uploadAttemptId);
    logClientInfo('upload attempt created', {
      uploadAttemptId,
      productId: resolvedProductId || productId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    if (!resolvedProductId) {
      const message = 'Save this product first, then upload the video.';
      setUploadError(message, {
        uploadAttemptId,
        stage: 'validating-file',
        httpStatus: null,
        responseSnippet: null,
        errorName: 'MissingProductId',
      });
      await reportDebugBeacon({
        uploadAttemptId,
        stage: 'validating-file',
        message,
        errorName: 'MissingProductId',
        file,
      });
      return { ok: false, message };
    }

    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError, {
        uploadAttemptId,
        stage: 'validating-file',
        httpStatus: null,
        responseSnippet: null,
        errorName: 'FileValidationError',
      });
      await reportDebugBeacon({
        uploadAttemptId,
        stage: 'validating-file',
        message: validationError,
        errorName: 'FileValidationError',
        file,
      });
      return { ok: false, message: validationError };
    }

    setIsBusy(true);

    try {
      const replace = hasExistingVideo && hasProductId && resolvedProductId === (productId as string);
      setStage('requesting-upload-url', 'Requesting secure upload URL...', uploadAttemptId);
      let uploadInit: Awaited<ReturnType<typeof adminCreateProductVideoUpload>>;
      try {
        uploadInit = await adminCreateProductVideoUpload(resolvedProductId, {
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          replace,
          uploadAttemptId,
        });
      } catch (error) {
        throw toUploadFlowError('create-upload', normalizeError(error), {
          httpStatus: resolveErrorHttpStatus(error),
          responseSnippet:
            resolveErrorResponseSnippet(error) || truncateText(normalizeError(error), 600),
          errorName: error instanceof Error ? error.name : 'CreateUploadError',
          errorStack: error instanceof Error ? truncateText(error.stack, 1200) : null,
        });
      }

      const uploadUrl = (uploadInit.upload?.uploadUrl || '').trim();
      const providerAssetId = (uploadInit.upload?.providerAssetId || '').trim();
      if (!uploadUrl || !providerAssetId) {
        throw toUploadFlowError(
          'create-upload',
          'Dover created an upload request, but did not receive a valid Stream upload URL.',
          {
            errorName: 'MissingUploadPayload',
            responseSnippet: truncateText(JSON.stringify(uploadInit), 600),
          }
        );
      }

      logClientInfo('create-upload success', {
        uploadAttemptId,
        productId: resolvedProductId,
        providerAssetId,
      });

      setStage('uploading-to-cloudflare', 'Uploading video to Cloudflare Stream...', uploadAttemptId);
      const directUploadResult = await uploadDirectToStream({
        uploadAttemptId,
        productId: resolvedProductId,
        uploadUrl,
        file,
      });
      const directUploadSummary = truncateText(
        JSON.stringify({
          method: directUploadResult.method,
          httpStatus: directUploadResult.httpStatus,
          headers: directUploadResult.headers,
          responseSnippet: directUploadResult.responseSnippet,
        }),
        600
      );
      logClientInfo('direct-upload completed', {
        uploadAttemptId,
        productId: resolvedProductId,
        providerAssetId,
        method: directUploadResult.method,
        httpStatus: directUploadResult.httpStatus,
      });

      setStage(
        'attaching-to-product',
        replace ? 'Replacing product video metadata...' : 'Attaching uploaded video to product...',
        uploadAttemptId
      );

      let next;
      try {
        next = replace
          ? await adminReplaceProductVideo(resolvedProductId, {
              providerAssetId,
              filename: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              uploadAttemptId,
            })
          : await adminAttachProductVideo(resolvedProductId, {
              providerAssetId,
              filename: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              uploadAttemptId,
            });
      } catch (error) {
        throw toUploadFlowError(
          'attach',
          'The video upload finished, but saving it to the product failed afterward.',
          {
            errorName: error instanceof Error ? error.name : 'AttachError',
            errorStack: error instanceof Error ? truncateText(error.stack, 1200) : null,
            responseSnippet: truncateText(
              JSON.stringify({
                attachError: normalizeError(error),
                directUpload: directUploadSummary,
                providerAssetId,
              }),
              600
            ),
          }
        );
      }

      await applyVideoResponse(next, uploadAttemptId);
      return { ok: true, message: 'Video uploaded successfully.' };
    } catch (error) {
      const flowError = isUploadFlowError(error)
        ? error
        : toUploadFlowError('error', normalizeError(error), {
            errorName: error instanceof Error ? error.name : 'UnknownError',
            errorStack: error instanceof Error ? truncateText(error.stack, 1200) : null,
          });

      setUploadError(flowError.message, {
        uploadAttemptId,
        stage: flowError.stage,
        httpStatus: flowError.httpStatus,
        responseSnippet: flowError.responseSnippet,
        errorName: flowError.errorName,
      });

      await reportDebugBeacon({
        uploadAttemptId,
        stage: flowError.stage,
        message: flowError.message,
        httpStatus: flowError.httpStatus,
        responseSnippet: flowError.responseSnippet,
        errorName: flowError.errorName,
        errorStack: flowError.errorStack,
        file,
      });

      if (hasProductId) {
        void fetchVideoState(true, 'status');
      }
      return { ok: false, message: flowError.message };
    } finally {
      setUploadStep(null);
      setIsBusy(false);
    }
  };

  const onSelectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (isCreateBeforeProductExists) {
      await queueCreateModeFile(file);
    } else {
      await uploadSelectedFile(file);
    }
    event.target.value = '';
  };

  const handleRemove = async () => {
    if (isCreateBeforeProductExists) {
      if (!pendingCreateFile || isBusy || isRemoving) return;
      await syncPendingCreateFile(null);
      setErrorMessage(null);
      setErrorDiagnostics(null);
      setUploadStep(null);
      setInfoMessage(null);
      setClientStage('idle');
      return;
    }

    if (!hasProductId || !hasExistingVideo || isBusy || isRemoving || removeInFlightRef.current) return;
    removeInFlightRef.current = true;
    const uploadAttemptId = createUploadAttemptId();
    setActiveUploadAttemptId(uploadAttemptId);
    setErrorMessage(null);
    setErrorDiagnostics(null);
    setIsBusy(true);
    setIsRemoving(true);
    resetProcessingTracking();
    setStage('attaching-to-product', 'Removing product video...', uploadAttemptId);
    try {
      await adminRemoveProductVideo(productId as string, { uploadAttemptId });
      const next = emptyProductVideoSummary();
      setProductVideo(next);
      setDetails(null);
      setInfoMessage('Video removed.');
      setClientStage('idle');
      if (onVideoChanged) {
        await onVideoChanged(next);
      }
      logClientInfo('remove success', { uploadAttemptId, productId });
    } catch (error) {
      const message = 'Failed to remove product video.';
      const snippet = truncateText(normalizeError(error), 600);
      setUploadError(message, {
        uploadAttemptId,
        stage: 'remove',
        httpStatus: null,
        responseSnippet: snippet,
        errorName: error instanceof Error ? error.name : 'RemoveError',
      });
      await reportDebugBeacon({
        uploadAttemptId,
        stage: 'remove',
        message,
        responseSnippet: snippet,
        errorName: error instanceof Error ? error.name : 'RemoveError',
        errorStack: error instanceof Error ? truncateText(error.stack, 1200) : null,
      });
    } finally {
      setUploadStep(null);
      setIsBusy(false);
      setIsRemoving(false);
      removeInFlightRef.current = false;
    }
  };

  useEffect(() => {
    const targetProductId = (createUploadTargetProductId || '').trim();
    if (!isCreateBeforeProductExists) return;
    if (!targetProductId) return;
    if (!pendingCreateFile) return;
    if (isBusy || isRemoving) return;
    if (createUploadInFlightForProductIdRef.current === targetProductId) return;

    createUploadInFlightForProductIdRef.current = targetProductId;
    void (async () => {
      const file = pendingCreateFile;
      const result = await uploadSelectedFile(file, { targetProductId });
      await syncPendingCreateFile(null);

      if (result.ok) {
        setProductVideo(emptyProductVideoSummary());
        setDetails(null);
        setClientStage('idle');
        setUploadStep(null);
        setActiveUploadAttemptId(null);
        resetProcessingTracking();
      }

      if (!result.ok) {
        setInfoMessage('Product created, but the video upload failed. Open Edit Product to retry.');
      }

      if (onCreateUploadSettled) {
        await onCreateUploadSettled({
          ok: result.ok,
          productId: targetProductId,
          message: result.ok
            ? 'Product created and video upload started successfully.'
            : 'Product created, but the video upload failed. Open Edit Product to retry.',
        });
      }

      createUploadInFlightForProductIdRef.current = null;
    })();
  }, [
    createUploadTargetProductId,
    isBusy,
    isCreateBeforeProductExists,
    isRemoving,
    onCreateUploadSettled,
    pendingCreateFile,
  ]);

  return (
    <div className="rounded-shell-lg border border-driftwood/60 bg-white/80 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <label className="lux-label block">Product Video</label>
          <p className="text-xs text-charcoal/60">MP4 recommended, 15 second max, 50 MB max.</p>
          {(spinnerText || activeUploadAttemptId) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.16em] text-charcoal/55">
              {spinnerText && (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-charcoal/65" />
                  <span>{spinnerText}</span>
                </>
              )}
              {activeUploadAttemptId && <span>Attempt {activeUploadAttemptId}</span>}
            </div>
          )}
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] font-semibold ${statusPillClasses}`}
        >
          {statusPillLabel}
        </span>
      </div>

      {thumbnailUrl ? (
        <div className="overflow-hidden rounded-shell border border-driftwood/60 bg-linen/70">
          <div className="aspect-video w-full">
            <img
              src={thumbnailUrl}
              alt="Product video thumbnail"
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-shell border border-dashed border-driftwood/70 bg-linen/70 text-xs text-charcoal/45">
          No video thumbnail yet
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-charcoal/60">
        {durationLabel && <span>Duration {durationLabel}</span>}
        {displaySizeLabel && <span>Size {displaySizeLabel}</span>}
        {displayMimeType && <span>{displayMimeType}</span>}
      </div>
      {hasQueuedCreateVideo && pendingCreateFile?.name && (
        <p className="text-xs text-charcoal/70 break-all">Selected file: {pendingCreateFile.name}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={(!hasProductId && !isCreateBeforeProductExists) || isBusy || isRemoving}
          className="lux-button--ghost px-3 py-1 text-[10px] disabled:opacity-50"
        >
          {isCreateBeforeProductExists
            ? hasQueuedCreateVideo
              ? 'Replace Video'
              : 'Select Video'
            : hasAnyVideo
            ? 'Replace Video'
            : 'Upload Video'}
        </button>
        <button
          type="button"
          onClick={handleRemove}
          disabled={(!hasProductId && !isCreateBeforeProductExists) || !hasAnyVideo || isBusy || isRemoving}
          className="lux-button--ghost px-3 py-1 text-[10px] !text-rose-700 disabled:opacity-50"
        >
          Remove
        </button>
        {hasProductId && (
          <button
            type="button"
            onClick={() => void fetchVideoState(false, 'status')}
            disabled={!hasProductId || isBusy || isRemoving}
            className="lux-button--ghost px-3 py-1 text-[10px] disabled:opacity-50"
          >
            Refresh
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,.mov,video/mp4,video/quicktime"
        className="hidden"
        onChange={(event) => {
          void onSelectFile(event);
        }}
      />

      {!hasProductId && mode === 'create' && (
        <p className="text-xs text-charcoal/60">
          Choose a video now. It will upload after the product is created.
        </p>
      )}

      {!spinnerText && uploadStep && <p className="text-xs text-charcoal/70">{uploadStep}</p>}
      {showProcessingFallbackPrompt && !errorMessage && (
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700">
          {PROCESSING_FALLBACK_PROMPT}
        </p>
      )}
      {infoMessage && <p className="text-xs text-emerald-700">{infoMessage}</p>}

      {errorMessage && (
        <div className="rounded-shell border border-rose-300 bg-rose-50/70 p-3 space-y-2">
          <p className="text-xs text-rose-700">{errorMessage}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy || (!hasProductId && !isCreateBeforeProductExists)}
              className="lux-button--ghost px-3 py-1 text-[10px] !text-rose-700 disabled:opacity-50"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setErrorDiagnostics(null);
              }}
              className="lux-button--ghost px-3 py-1 text-[10px] !text-charcoal/70"
            >
              Dismiss
            </button>
          </div>

          {errorDiagnostics && (
            <details className="rounded-shell border border-driftwood/50 bg-white/80 px-2 py-1">
              <summary className="cursor-pointer text-[10px] uppercase tracking-[0.16em] text-charcoal/70">
                Technical details
              </summary>
              <div className="mt-2 space-y-1 text-[11px] text-charcoal/75">
                <p>uploadAttemptId: {errorDiagnostics.uploadAttemptId || 'n/a'}</p>
                <p>stage: {errorDiagnostics.stage}</p>
                <p>httpStatus: {errorDiagnostics.httpStatus ?? 'n/a'}</p>
                {errorDiagnostics.errorName && <p>errorName: {errorDiagnostics.errorName}</p>}
                {errorDiagnostics.responseSnippet && (
                  <p className="break-words">responseSnippet: {errorDiagnostics.responseSnippet}</p>
                )}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
