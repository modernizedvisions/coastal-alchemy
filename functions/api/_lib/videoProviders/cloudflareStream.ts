import { logVideoInfo, logVideoWarn } from '../videoDebug';

export type CloudflareStreamEnv = {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_STREAM_API_TOKEN?: string;
  CLOUDFLARE_STREAM_ALLOWED_ORIGINS?: string;
  CLOUDFLARE_STREAM_MAX_DURATION_SECONDS?: string;
  CLOUDFLARE_STREAM_MAX_FILE_SIZE_MB?: string;
  CLOUDFLARE_STREAM_UPLOAD_EXPIRY_MINUTES?: string;
  CLOUDFLARE_STREAM_REQUIRE_SIGNED_URLS?: string;
};

export type AppVideoUploadStatus = 'uploading' | 'processing' | 'ready' | 'error';

export type CloudflareStreamConfig = {
  accountId: string;
  apiToken: string;
  allowedOrigins: string[];
  maxDurationSeconds: number;
  maxFileSizeMb: number;
  uploadExpiryMinutes: number;
  requireSignedUrls: boolean;
};

export type CloudflareStreamDirectUpload = {
  uid: string;
  uploadUrl: string;
  expiryAt: string;
  allowedOrigins: string[];
  maxDurationSeconds: number;
};

export type CloudflareStreamVideoDetails = {
  uid: string;
  status: AppVideoUploadStatus;
  durationSeconds: number | null;
  rawDurationValue?: number | string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
  readyAt: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  meta: Record<string, unknown> | null;
};

type CloudflareApiResponse<T> = {
  success: boolean;
  errors?: Array<{ message?: string; code?: number }>;
  result?: T;
};

type StreamStatusPayload = {
  state?: string | null;
  errorReasonCode?: string | null;
  errorReasonText?: string | null;
};

type StreamVideoPayload = {
  uid?: string | null;
  readyToStream?: boolean | null;
  status?: StreamStatusPayload | null;
  duration?: number | string | null;
  size?: number | string | null;
  uploaded?: string | null;
  meta?: Record<string, unknown> | null;
};

const STREAM_PROVIDER_BASE_URL = 'https://api.cloudflare.com/client/v4';

export class CloudflareStreamApiError extends Error {
  status: number;
  statusText: string | null;
  detail: string | null;
  method: 'GET' | 'POST' | 'DELETE' | null;
  path: string | null;
  url: string | null;
  responseText: string | null;
  responseJson: unknown;
  responseErrors: unknown[] | null;
  responseMessages: unknown[] | null;

  constructor(
    message: string,
    status: number,
    detail: string | null = null,
    extras?: {
      statusText?: string | null;
      method?: 'GET' | 'POST' | 'DELETE' | null;
      path?: string | null;
      url?: string | null;
      responseText?: string | null;
      responseJson?: unknown;
      responseErrors?: unknown[] | null;
      responseMessages?: unknown[] | null;
    }
  ) {
    super(message);
    this.name = 'CloudflareStreamApiError';
    this.status = status;
    this.statusText = extras?.statusText ?? null;
    this.detail = detail;
    this.method = extras?.method ?? null;
    this.path = extras?.path ?? null;
    this.url = extras?.url ?? null;
    this.responseText = extras?.responseText ?? null;
    this.responseJson = extras?.responseJson ?? null;
    this.responseErrors = extras?.responseErrors ?? null;
    this.responseMessages = extras?.responseMessages ?? null;
  }
}

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.floor(numeric);
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

export const parseAllowedOrigins = (raw: string | undefined): string[] => {
  return String(raw || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
};

export const getCloudflareStreamConfig = (env: CloudflareStreamEnv): CloudflareStreamConfig => {
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = (env.CLOUDFLARE_STREAM_API_TOKEN || '').trim();
  if (!accountId) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID');
  }
  if (!apiToken) {
    throw new Error('Missing CLOUDFLARE_STREAM_API_TOKEN');
  }

  return {
    accountId,
    apiToken,
    allowedOrigins: parseAllowedOrigins(env.CLOUDFLARE_STREAM_ALLOWED_ORIGINS),
    maxDurationSeconds: parsePositiveInt(env.CLOUDFLARE_STREAM_MAX_DURATION_SECONDS, 15),
    maxFileSizeMb: parsePositiveInt(env.CLOUDFLARE_STREAM_MAX_FILE_SIZE_MB, 50),
    uploadExpiryMinutes: parsePositiveInt(env.CLOUDFLARE_STREAM_UPLOAD_EXPIRY_MINUTES, 30),
    requireSignedUrls: parseBoolean(env.CLOUDFLARE_STREAM_REQUIRE_SIGNED_URLS, false),
  };
};

const firstErrorMessage = (response: CloudflareApiResponse<unknown>): string | null => {
  const first = response.errors?.[0];
  if (!first) return null;
  return first.message || null;
};

const firstMessageString = (messages: unknown[] | null): string | null => {
  if (!messages || messages.length === 0) return null;
  const first = messages[0];
  if (typeof first === 'string') {
    const trimmed = first.trim();
    return trimmed || null;
  }
  if (first && typeof first === 'object' && typeof (first as { message?: unknown }).message === 'string') {
    const trimmed = ((first as { message?: string }).message || '').trim();
    return trimmed || null;
  }
  return null;
};

const buildStreamEndpointUrl = (accountId: string, path: string): string =>
  `${STREAM_PROVIDER_BASE_URL}/accounts/${encodeURIComponent(accountId)}/stream${path}`;

const extractErrorPointers = (errors: unknown[] | null): string[] => {
  if (!errors || errors.length === 0) return [];
  const pointers: string[] = [];
  for (const entry of errors) {
    if (!entry || typeof entry !== 'object') continue;
    const source = (entry as { source?: unknown }).source;
    if (!source || typeof source !== 'object') continue;
    const pointer = (source as { pointer?: unknown }).pointer;
    if (typeof pointer !== 'string') continue;
    const trimmed = pointer.trim();
    if (!trimmed) continue;
    pointers.push(trimmed);
  }
  return pointers;
};

const streamRequest = async <T>(
  env: CloudflareStreamEnv,
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
    allow404?: boolean;
  }
): Promise<T | null> => {
  const config = getCloudflareStreamConfig(env);
  const url = buildStreamEndpointUrl(config.accountId, path);
  const method = options?.method || 'GET';
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let responseText = '';
  try {
    responseText = await response.text();
  } catch {
    responseText = '';
  }

  if (response.status === 404 && options?.allow404) {
    return null;
  }

  const trimmedText = responseText.trim();
  let parsedJson: unknown = null;
  if (trimmedText) {
    try {
      parsedJson = JSON.parse(trimmedText);
    } catch {
      parsedJson = null;
    }
  }

  const responsePayload =
    parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)
      ? (parsedJson as CloudflareApiResponse<T> & { messages?: unknown[] })
      : null;
  const responseErrors = Array.isArray(responsePayload?.errors) ? responsePayload.errors : null;
  const responseMessages = Array.isArray(responsePayload?.messages) ? responsePayload.messages : null;

  if (!response.ok) {
    const detail =
      (responsePayload ? firstErrorMessage(responsePayload as CloudflareApiResponse<unknown>) : null) ||
      firstMessageString(responseMessages) ||
      response.statusText ||
      (trimmedText || null);
    throw new CloudflareStreamApiError(
      `Cloudflare Stream request failed (${method} ${path})`,
      response.status,
      detail,
      {
        statusText: response.statusText || null,
        method,
        path,
        url,
        responseText: trimmedText || null,
        responseJson: parsedJson,
        responseErrors: responseErrors as unknown[] | null,
        responseMessages,
      }
    );
  }

  if (!responsePayload) {
    throw new CloudflareStreamApiError(
      `Cloudflare Stream response was not valid JSON (${method} ${path})`,
      response.status,
      trimmedText || null,
      {
        statusText: response.statusText || null,
        method,
        path,
        url,
        responseText: trimmedText || null,
        responseJson: parsedJson,
        responseErrors: null,
        responseMessages: null,
      }
    );
  }

  if (!responsePayload.success) {
    throw new CloudflareStreamApiError(
      `Cloudflare Stream request was unsuccessful (${method} ${path})`,
      response.status,
      firstErrorMessage(responsePayload) ||
        firstMessageString(responseMessages) ||
        trimmedText ||
        null,
      {
        statusText: response.statusText || null,
        method,
        path,
        url,
        responseText: trimmedText || null,
        responseJson: parsedJson,
        responseErrors: responseErrors as unknown[] | null,
        responseMessages,
      }
    );
  }

  return responsePayload.result ?? null;
};

const toNonNegativeNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed >= 0 ? parsed : null;
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const toRecordOrNull = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

export const normalizeCloudflareStreamStatus = (payload: {
  readyToStream?: boolean | null;
  state?: string | null;
}): AppVideoUploadStatus => {
  // Keep provider-specific status values collapsed into the app lifecycle states.
  if (payload.readyToStream === true) return 'ready';
  const state = (payload.state || '').trim().toLowerCase();
  if (!state) return 'processing';
  if (state === 'ready') return 'ready';
  if (state.includes('error') || state === 'failed') return 'error';
  if (state.includes('upload') || state.includes('pendingupload') || state.includes('queued')) {
    return 'uploading';
  }
  return 'processing';
};

export const deriveCloudflareStreamThumbnailUrl = (uid: string): string =>
  `https://videodelivery.net/${encodeURIComponent(uid)}/thumbnails/thumbnail.jpg`;

export const createCloudflareStreamDirectUpload = async (
  env: CloudflareStreamEnv,
  options?: {
    meta?: Record<string, unknown>;
  }
): Promise<CloudflareStreamDirectUpload> => {
  const config = getCloudflareStreamConfig(env);
  const expiryAt = new Date(Date.now() + config.uploadExpiryMinutes * 60 * 1000).toISOString();
  const directUploadPath = '/direct_upload';
  const endpointUrl = buildStreamEndpointUrl(config.accountId, directUploadPath);
  // Direct uploads go browser -> Stream; the app only brokers one-time credentials.
  const payload: Record<string, unknown> = {
    maxDurationSeconds: config.maxDurationSeconds,
    allowedOrigins: config.allowedOrigins,
    expiry: expiryAt,
    meta: options?.meta && Object.keys(options.meta).length ? options.meta : {},
    requireSignedURLs: config.requireSignedUrls,
  };

  logVideoInfo('create-upload', 'request-payload', {
    accountIdPresent: Boolean(config.accountId),
    endpointUrl,
    payload,
    payloadTypes: {
      maxDurationSeconds: typeof payload.maxDurationSeconds,
      allowedOriginsIsArray: Array.isArray(payload.allowedOrigins),
      expiry: typeof payload.expiry,
      requireSignedURLs: typeof payload.requireSignedURLs,
      meta: typeof payload.meta,
    },
  });

  let result: { uid?: string; uploadURL?: string } | null = null;
  try {
    result = await streamRequest<{ uid?: string; uploadURL?: string }>(env, directUploadPath, {
      method: 'POST',
      body: payload,
    });
  } catch (error) {
    if (error instanceof CloudflareStreamApiError) {
      logVideoWarn('create-upload', 'cloudflare-error-text', {
        endpointUrl,
        method: error.method || 'POST',
        streamHttpStatus: error.status,
        streamStatusText: error.statusText,
        detail: error.detail,
        responseText: error.responseText,
      });
      logVideoWarn('create-upload', 'cloudflare-error-json', {
        endpointUrl,
        method: error.method || 'POST',
        streamHttpStatus: error.status,
        parsedJson: error.responseJson,
        errors: error.responseErrors,
        messages: error.responseMessages,
        sourcePointers: extractErrorPointers(error.responseErrors),
      });
    }
    throw error;
  }

  const uid = toStringOrNull(result?.uid);
  const uploadUrl = toStringOrNull(result?.uploadURL);
  if (!uid || !uploadUrl) {
    throw new Error('Cloudflare Stream direct upload response missing uid/uploadURL');
  }

  return {
    uid,
    uploadUrl,
    expiryAt,
    allowedOrigins: config.allowedOrigins,
    maxDurationSeconds: config.maxDurationSeconds,
  };
};

export const getCloudflareStreamVideoDetails = async (
  env: CloudflareStreamEnv,
  uid: string
): Promise<CloudflareStreamVideoDetails | null> => {
  const cleanUid = (uid || '').trim();
  if (!cleanUid) return null;

  const result = await streamRequest<StreamVideoPayload>(env, `/${encodeURIComponent(cleanUid)}`, {
    method: 'GET',
    allow404: true,
  });

  if (!result) return null;

  const meta = toRecordOrNull(result.meta);
  const status = normalizeCloudflareStreamStatus({
    readyToStream: result.readyToStream,
    state: result.status?.state || null,
  });
  const uploadedAt = toStringOrNull(result.uploaded);
  const readyAt = status === 'ready' ? uploadedAt || new Date().toISOString() : null;
  const errorMessage =
    toStringOrNull(result.status?.errorReasonText) || toStringOrNull(result.status?.errorReasonCode);

  return {
    uid: cleanUid,
    status,
    durationSeconds: toNonNegativeNumberOrNull(result.duration),
    rawDurationValue: result.duration ?? null,
    sizeBytes: toNonNegativeNumberOrNull(result.size),
    uploadedAt,
    readyAt,
    thumbnailUrl: status === 'ready' ? deriveCloudflareStreamThumbnailUrl(cleanUid) : null,
    errorMessage: status === 'error' ? errorMessage : null,
    originalFilename: toStringOrNull(meta?.originalFilename),
    mimeType: toStringOrNull(meta?.mimeType),
    meta,
  };
};

export const deleteCloudflareStreamVideo = async (
  env: CloudflareStreamEnv,
  uid: string
): Promise<{ deleted: boolean; notFound: boolean }> => {
  const isAlreadyMissingDeleteError = (error: CloudflareStreamApiError): boolean => {
    if (error.status === 404 || error.status === 410) return true;
    const responseJsonText =
      error.responseJson && typeof error.responseJson === 'object'
        ? JSON.stringify(error.responseJson)
        : typeof error.responseJson === 'string'
        ? error.responseJson
        : '';
    const detail = `${error.detail || ''} ${error.responseText || ''} ${responseJsonText}`.toLowerCase();
    return (
      detail.includes('not found') ||
      detail.includes('does not exist') ||
      detail.includes('already deleted') ||
      detail.includes('asset missing') ||
      detail.includes('video missing')
    );
  };

  const cleanUid = (uid || '').trim();
  if (!cleanUid) {
    return { deleted: false, notFound: true };
  }

  try {
    await streamRequest(env, `/${encodeURIComponent(cleanUid)}`, { method: 'DELETE' });
    return { deleted: true, notFound: false };
  } catch (error) {
    if (error instanceof CloudflareStreamApiError && isAlreadyMissingDeleteError(error)) {
      return { deleted: false, notFound: true };
    }
    throw error;
  }
};
