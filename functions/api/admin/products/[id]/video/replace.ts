import { requireAdmin } from '../../../../_lib/adminAuth';
import {
  buildVideoWriteInputFromProviderDetails,
  getProductVideoByProductId,
  toProductVideoDetails,
  toProductVideoSummary,
  tryDeleteVideoAssetByProvider,
  upsertProductVideo,
} from '../../../../_lib/productVideos';
import {
  getProductExists,
  validateProductVideoFileInput,
  validateReplaceFlowInput,
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

type ReplaceBody = {
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

export async function onRequestPost(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;

  const productId = (context.params?.id || '').trim();
  if (!productId) {
    return json({ ok: false, error: 'Product id is required' }, 400);
  }

  let body: ReplaceBody;
  try {
    body = (await context.request.json()) as ReplaceBody;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  const uploadAttemptId = normalizeUploadAttemptId(body.uploadAttemptId);

  const productExists = await getProductExists(context.env.DB, productId);
  if (!productExists) {
    logVideoWarn('replace', 'failed: product not found', { uploadAttemptId, productId });
    return json({ ok: false, error: 'Product not found' }, 404);
  }

  const existing = await getProductVideoByProductId(context.env.DB, productId);
  if (!existing) {
    logVideoWarn('replace', 'failed: no existing video to replace', { uploadAttemptId, productId });
    return json({ ok: false, error: 'Product does not have an existing video to replace' }, 404);
  }

  const newAssetId = (body.providerAssetId || '').trim();
  logVideoInfo('replace', 'start', {
    uploadAttemptId,
    productId,
    existingProviderAssetId: existing.provider_asset_id,
    newProviderAssetId: newAssetId || null,
    filename: truncateLogText(body.filename, 120),
    mimeType: truncateLogText(body.mimeType, 80),
    sizeBytes: Number.isFinite(Number(body.sizeBytes)) ? Number(body.sizeBytes) : null,
  });
  const replaceValidationError = validateReplaceFlowInput({
    existingAssetId: existing.provider_asset_id,
    newAssetId,
  });
  if (replaceValidationError) {
    logVideoWarn('replace', 'failed: replace validation', {
      uploadAttemptId,
      productId,
      existingProviderAssetId: existing.provider_asset_id,
      newProviderAssetId: newAssetId || null,
      reason: replaceValidationError,
    });
    return json({ ok: false, error: replaceValidationError }, 400);
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
    logVideoError('replace', 'failed: stream config missing', {
      uploadAttemptId,
      productId,
      newProviderAssetId: newAssetId,
      detail: truncateLogText(detail),
    });
    return json({ ok: false, error: 'Cloudflare Stream is not configured', detail }, 500);
  }
  if (fileValidationError) {
    logVideoWarn('replace', 'failed: file validation', {
      uploadAttemptId,
      productId,
      newProviderAssetId: newAssetId,
      validationError: fileValidationError,
      cleanupSkipped: true,
    });
    return json({ ok: false, error: fileValidationError }, 400);
  }

  let details;
  try {
    details = await getCloudflareStreamVideoDetails(context.env, newAssetId);
  } catch (error) {
    if (error instanceof CloudflareStreamApiError) {
      logVideoWarn('replace', 'failed: provider verification returned Stream error', {
        uploadAttemptId,
        productId,
        newProviderAssetId: newAssetId,
        streamHttpStatus: error.status,
        detail: truncateLogText(error.detail || error.message),
      });
      return json(
        {
          ok: false,
          error: 'Unable to verify replacement Stream asset',
          detail: error.detail || error.message,
        },
        502
      );
    }
    logVideoError('replace', 'failed: provider verification error', {
      uploadAttemptId,
      productId,
      newProviderAssetId: newAssetId,
      detail: truncateLogText(error instanceof Error ? error.message : String(error)),
    });
    return json(
      {
        ok: false,
        error: 'Unable to verify replacement Stream asset',
        detail: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
  if (!details) {
    logVideoWarn('replace', 'failed: replacement Stream asset missing', {
      uploadAttemptId,
      productId,
      newProviderAssetId: newAssetId,
      cleanupSkipped: true,
    });
    return json(
      {
        ok: false,
        error:
          'Uploaded replacement Stream asset not found. The upload may have expired; try uploading again.',
      },
      404
    );
  }

  const writeInput = buildVideoWriteInputFromProviderDetails({
    productId,
    providerAssetId: newAssetId,
    existingRowId: existing.id,
    details,
    fallbackMimeType: body.mimeType || existing.mime_type,
    fallbackOriginalFilename: body.filename || existing.original_filename,
    fallbackSizeBytes: Number.isFinite(Number(body.sizeBytes))
      ? Number(body.sizeBytes)
      : existing.size_bytes,
  });

  const writeResult = await upsertProductVideo(context.env.DB, writeInput);
  if (!writeResult.success) {
    logVideoError('replace', 'failed: metadata write failed', {
      uploadAttemptId,
      productId,
      existingProviderAssetId: existing.provider_asset_id,
      newProviderAssetId: newAssetId,
      detail: truncateLogText(writeResult.error),
      cleanupSkipped: true,
    });
    return json({ ok: false, error: 'Failed to attach replacement video', detail: writeResult.error }, 500);
  }

  const persisted = await getProductVideoByProductId(context.env.DB, productId);
  if (!persisted) {
    logVideoError('replace', 'failed: metadata reload failed after write', {
      uploadAttemptId,
      productId,
      newProviderAssetId: newAssetId,
    });
    return json({ ok: false, error: 'Replacement was stored but could not be reloaded' }, 500);
  }

  let warning: string | null = null;
  if (existing.provider_asset_id && existing.provider_asset_id !== newAssetId) {
    // Safe replace flow: old asset is deleted only after new metadata is persisted.
    try {
      await tryDeleteVideoAssetByProvider(
        context.env,
        existing.provider,
        existing.provider_asset_id
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logVideoError('replace', 'failed: old asset cleanup after successful replace', {
        productId,
        oldAssetId: existing.provider_asset_id,
        newAssetId,
        uploadAttemptId,
        detail,
      });
      warning = 'Replacement attached, but failed to delete previous video asset';
    }
  }
  logVideoInfo('replace', 'success', {
    uploadAttemptId,
    productId,
    oldProviderAssetId: existing.provider_asset_id,
    newProviderAssetId: persisted.provider_asset_id,
    status: persisted.upload_status,
    warning,
  });

  return json({
    ok: true,
    productVideo: toProductVideoSummary(persisted),
    details: toProductVideoDetails(persisted),
    warning,
  });
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
