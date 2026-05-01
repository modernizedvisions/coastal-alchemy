import { requireAdmin } from '../../../../_lib/adminAuth';
import {
  buildVideoWriteInputFromProviderDetails,
  getProductVideoByProductId,
  toProductVideoDetails,
  toProductVideoSummary,
  upsertProductVideo,
} from '../../../../_lib/productVideos';
import {
  getExistingProductVideo,
  getProductExists,
  validateProductVideoFileInput,
} from '../../../../_lib/productVideoValidation';
import {
  logVideoError,
  logVideoInfo,
  logVideoWarn,
  normalizeUploadAttemptId,
  truncateLogText,
} from '../../../../_lib/videoDebug';
import {
  CloudflareStreamApiError,
  getCloudflareStreamVideoDetails,
  type CloudflareStreamVideoDetails,
  type CloudflareStreamEnv,
} from '../../../../_lib/videoProviders/cloudflareStream';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = CloudflareStreamEnv & {
  DB: D1Database;
};

type AttachBody = {
  providerAssetId?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadAttemptId?: string;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const toNonNegativeDurationOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed >= 0 ? parsed : null;
};

export async function onRequestPost(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;

  const productId = (context.params?.id || '').trim();
  if (!productId) {
    return json(
      {
        ok: false,
        stage: 'attach',
        message: 'Product id is required',
        error: 'Product id is required',
        detail: null,
        uploadAttemptId: null,
      },
      400
    );
  }

  let body: AttachBody;
  try {
    body = (await context.request.json()) as AttachBody;
  } catch {
    return json(
      {
        ok: false,
        stage: 'attach',
        message: 'Invalid JSON body',
        error: 'Invalid JSON body',
        detail: null,
        uploadAttemptId: null,
      },
      400
    );
  }
  const uploadAttemptId = normalizeUploadAttemptId(body.uploadAttemptId);

  const providerAssetId = (body.providerAssetId || '').trim();
  if (!providerAssetId) {
    logVideoWarn('attach', 'failed: missing Stream asset id', { uploadAttemptId, productId });
    return json(
      {
        ok: false,
        stage: 'attach',
        message: 'providerAssetId is required',
        error: 'providerAssetId is required',
        detail: null,
        uploadAttemptId,
      },
      400
    );
  }
  logVideoInfo('attach', 'start', {
    uploadAttemptId,
    productId,
    providerAssetId,
    filename: truncateLogText(body.filename, 120),
    mimeType: truncateLogText(body.mimeType, 80),
    sizeBytes: Number.isFinite(Number(body.sizeBytes)) ? Number(body.sizeBytes) : null,
  });

  const productExists = await getProductExists(context.env.DB, productId);
  if (!productExists) {
    logVideoWarn('attach', 'failed: product not found', { uploadAttemptId, productId, providerAssetId });
    return json(
      {
        ok: false,
        stage: 'attach',
        message: 'Product not found',
        error: 'Product not found',
        detail: null,
        uploadAttemptId,
      },
      404
    );
  }

  const existing = await getExistingProductVideo(context.env.DB, productId);
  if (existing && existing.provider_asset_id !== providerAssetId) {
    logVideoWarn('attach', 'failed: product already has different active video', {
      uploadAttemptId,
      productId,
      existingProviderAssetId: existing.provider_asset_id,
      incomingProviderAssetId: providerAssetId,
    });
    return json(
      {
        ok: false,
        stage: 'attach',
        message: 'Product already has a video. Use the replace flow.',
        error: 'Product already has a video. Use the replace flow.',
        code: 'VIDEO_ALREADY_EXISTS',
        detail: null,
        uploadAttemptId,
      },
      409
    );
  }

  let fileValidationError: string | null;
  try {
    fileValidationError = validateProductVideoFileInput(context.env, {
      filename: body.filename,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logVideoError('attach', 'failed: stream config missing', {
      uploadAttemptId,
      productId,
      providerAssetId,
      detail: truncateLogText(detail),
    });
    return json(
      {
        ok: false,
        stage: 'attach',
        message: 'Cloudflare Stream is not configured',
        error: 'Cloudflare Stream is not configured',
        detail,
        uploadAttemptId,
      },
      500
    );
  }
  if (fileValidationError) {
    logVideoWarn('attach', 'failed: file validation', {
      uploadAttemptId,
      productId,
      providerAssetId,
      validationError: fileValidationError,
      cleanupSkipped: true,
    });
    return json(
      {
        ok: false,
        stage: 'attach',
        message: fileValidationError,
        error: fileValidationError,
        detail: null,
        uploadAttemptId,
      },
      400
    );
  }

  let details: CloudflareStreamVideoDetails | null = null;
  try {
    details = await getCloudflareStreamVideoDetails(context.env, providerAssetId);
  } catch (error) {
    if (error instanceof CloudflareStreamApiError) {
      logVideoWarn('attach', 'failed: provider verification returned Stream error', {
        uploadAttemptId,
        productId,
        providerAssetId,
        streamHttpStatus: error.status,
        detail: truncateLogText(error.detail || error.message),
      });
      return json(
        {
          ok: false,
          stage: 'attach',
          message: 'Unable to verify uploaded Stream asset',
          error: 'Unable to verify uploaded Stream asset',
          detail: error.detail || error.message,
          uploadAttemptId,
        },
        502
      );
    }
    logVideoError('attach', 'failed: provider verification error', {
      uploadAttemptId,
      productId,
      providerAssetId,
      detail: truncateLogText(error instanceof Error ? error.message : String(error)),
    });
    return json(
      {
        ok: false,
        stage: 'attach',
        message: 'Unable to verify uploaded Stream asset',
        error: 'Unable to verify uploaded Stream asset',
        detail: error instanceof Error ? error.message : String(error),
        uploadAttemptId,
      },
      500
    );
  }
  if (!details) {
    logVideoWarn('attach', 'failed: uploaded Stream asset missing', {
      uploadAttemptId,
      productId,
      providerAssetId,
    });
    return json(
      {
        ok: false,
        stage: 'attach',
        message: 'Uploaded Stream asset not found. The upload may have expired; try uploading again.',
        error: 'Uploaded Stream asset not found. The upload may have expired; try uploading again.',
        detail: null,
        uploadAttemptId,
      },
      404
    );
  }

  try {
    const writeInput = buildVideoWriteInputFromProviderDetails({
      productId,
      providerAssetId,
      existingRowId: existing?.id || null,
      details,
      fallbackMimeType: body.mimeType || null,
      fallbackOriginalFilename: body.filename || null,
      fallbackSizeBytes: Number.isFinite(Number(body.sizeBytes)) ? Number(body.sizeBytes) : null,
    });

    const rawDurationValue = details.rawDurationValue ?? details.durationSeconds;
    const normalizedDurationSeconds = toNonNegativeDurationOrNull(writeInput.durationSeconds);
    if (writeInput.durationSeconds !== normalizedDurationSeconds) {
      logVideoWarn('attach', 'duration-normalized-to-null', {
        uploadAttemptId,
        productId,
        providerAssetId,
        rawDurationValue,
        normalizedDurationSeconds,
      });
    }
    writeInput.durationSeconds = normalizedDurationSeconds;
    if (writeInput.status !== 'ready') {
      writeInput.readyAt = null;
      if (!writeInput.thumbnailUrl) {
        writeInput.thumbnailUrl = null;
      }
    }

    logVideoInfo('attach', 'normalized-metadata', {
      uploadAttemptId,
      productId,
      providerAssetId,
      rawDurationValue,
      normalizedDurationSeconds,
      uploadStatus: writeInput.status,
      thumbnailUrl: writeInput.thumbnailUrl || null,
      readyAt: writeInput.readyAt || null,
    });
    logVideoInfo('attach', 'inserting-row', {
      uploadAttemptId,
      productId,
      providerAssetId: writeInput.providerAssetId,
      uploadStatus: writeInput.status,
      durationSeconds: writeInput.durationSeconds,
    });

    const writeResult = await upsertProductVideo(context.env.DB, writeInput);
    if (!writeResult.success) {
      // Keep uploaded asset during debugging so it can be inspected from Stream dashboard/logs.
      logVideoError('attach', 'failed: metadata write failed', {
        uploadAttemptId,
        productId,
        providerAssetId,
        detail: truncateLogText(writeResult.error),
        cleanupSkipped: true,
      });
      return json(
        {
          ok: false,
          stage: 'attach',
          message: 'The video upload finished, but saving it to the product failed.',
          error: 'Failed to store video metadata',
          detail: writeResult.error || null,
          uploadAttemptId,
        },
        500
      );
    }

    const persisted = await getProductVideoByProductId(context.env.DB, productId);
    if (!persisted) {
      logVideoError('attach', 'failed: metadata reload failed after write', {
        uploadAttemptId,
        productId,
        providerAssetId,
      });
      return json(
        {
          ok: false,
          stage: 'attach',
          message: 'The video upload finished, but saving it to the product failed.',
          error: 'Failed to load stored video metadata',
          detail: null,
          uploadAttemptId,
        },
        500
      );
    }
    logVideoInfo('attach', 'success', {
      uploadAttemptId,
      productId,
      providerAssetId: persisted.provider_asset_id,
      status: persisted.upload_status,
    });

    return json({
      ok: true,
      productVideo: toProductVideoSummary(persisted),
      details: toProductVideoDetails(persisted),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logVideoError('attach', 'failed: unhandled attach persistence error', {
      uploadAttemptId,
      productId,
      providerAssetId,
      detail: truncateLogText(detail),
    });
    return json(
      {
        ok: false,
        stage: 'attach',
        message: 'The video upload finished, but saving it to the product failed.',
        error: 'Attach persistence failed',
        detail,
        uploadAttemptId,
      },
      500
    );
  }
}

export async function onRequest(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }
  return onRequestPost(context);
}
