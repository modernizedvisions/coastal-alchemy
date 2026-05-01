import { requireAdmin } from '../../../_lib/adminAuth';
import {
  emptyProductVideo,
  getProductVideoByProductId,
  refreshProductVideoFromProvider,
  removeProductVideoWithProviderCleanup,
  toProductVideoDetails,
  toProductVideoSummary,
} from '../../../_lib/productVideos';
import { getProductExists } from '../../../_lib/productVideoValidation';
import {
  logVideoError,
  logVideoInfo,
  logVideoWarn,
  normalizeUploadAttemptId,
  truncateLogText,
} from '../../../_lib/videoDebug';
import {
  CloudflareStreamApiError,
  type CloudflareStreamEnv,
} from '../../../_lib/videoProviders/cloudflareStream';

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

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestGet(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;

  const productId = (context.params?.id || '').trim();
  const requestUrl = new URL(context.request.url);
  const uploadAttemptId = normalizeUploadAttemptId(requestUrl.searchParams.get('uploadAttemptId'));
  if (!productId) {
    return json({ ok: false, error: 'Product id is required' }, 400);
  }
  logVideoInfo('status', 'start', { uploadAttemptId, productId, action: 'fetch-status' });

  const productExists = await getProductExists(context.env.DB, productId);
  if (!productExists) {
    logVideoWarn('status', 'failed: product not found', { uploadAttemptId, productId });
    return json({ ok: false, error: 'Product not found' }, 404);
  }

  const existing = await getProductVideoByProductId(context.env.DB, productId);
  if (!existing) {
    logVideoInfo('status', 'empty', { uploadAttemptId, productId });
    return json({
      ok: true,
      productVideo: emptyProductVideo(),
      details: null,
    });
  }

  try {
    const refreshed = await refreshProductVideoFromProvider(context.env.DB, context.env, existing);
    logVideoInfo('status', refreshed.upload_status === 'ready' ? 'ready' : 'success', {
      uploadAttemptId,
      productId,
      providerAssetId: refreshed.provider_asset_id,
      status: refreshed.upload_status,
    });
    return json({
      ok: true,
      productVideo: toProductVideoSummary(refreshed),
      details: toProductVideoDetails(refreshed),
    });
  } catch (error) {
    const streamHttpStatus = error instanceof CloudflareStreamApiError ? error.status : null;
    logVideoWarn('status', 'failed: refresh from provider, returning cached metadata', {
      uploadAttemptId,
      productId,
      providerAssetId: existing.provider_asset_id,
      streamHttpStatus,
      detail: truncateLogText(error instanceof Error ? error.message : String(error)),
    });
    return json({
      ok: true,
      productVideo: toProductVideoSummary(existing),
      details: toProductVideoDetails(existing),
      warning: 'Unable to refresh video status from provider. Showing last known metadata.',
    });
  }
}

export async function onRequestDelete(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;

  const productId = (context.params?.id || '').trim();
  const requestUrl = new URL(context.request.url);
  const uploadAttemptId = normalizeUploadAttemptId(requestUrl.searchParams.get('uploadAttemptId'));
  if (!productId) {
    return json(
      {
        ok: false,
        stage: 'remove',
        message: 'Failed to remove product video.',
        detail: 'Product id is required',
        uploadAttemptId,
      },
      400
    );
  }
  logVideoInfo('remove', 'start', { uploadAttemptId, productId });

  const productExists = await getProductExists(context.env.DB, productId);
  if (!productExists) {
    logVideoWarn('remove', 'failed: product not found', { uploadAttemptId, productId });
    return json(
      {
        ok: false,
        stage: 'remove',
        message: 'Failed to remove product video.',
        detail: 'Product not found',
        uploadAttemptId,
      },
      404
    );
  }

  const existingAtStart = await getProductVideoByProductId(context.env.DB, productId);
  logVideoInfo('remove', 'fetched-current-row', {
    uploadAttemptId,
    productId,
    rowExistedAtStart: !!existingAtStart,
    providerAssetId: existingAtStart?.provider_asset_id || null,
    provider: existingAtStart?.provider || null,
  });

  try {
    const result = await removeProductVideoWithProviderCleanup(context.env.DB, context.env, productId);
    logVideoInfo('remove', 'stream-delete-response', {
      uploadAttemptId,
      productId,
      providerAssetId: result.providerAssetId,
      attempted: result.streamDelete.attempted,
      deleted: result.streamDelete.deleted,
      notFound: result.streamDelete.notFound,
      failed: result.streamDelete.failed,
      error: truncateLogText(result.streamDelete.error),
    });
    logVideoInfo('remove', 'db-delete-response', {
      uploadAttemptId,
      productId,
      success: result.dbDelete.success,
      changes: result.dbDelete.changes,
      alreadyMissing: result.dbDelete.alreadyMissing,
      error: truncateLogText(result.dbDelete.error),
    });
    logVideoInfo('remove', 'success', {
      uploadAttemptId,
      productId,
      normalizedOutcome: 'no-video-attached',
      rowExistedAtStart: result.rowExistedAtStart,
      removed: result.removed,
      alreadyRemoved: result.notFound || result.dbDelete.alreadyMissing,
      streamCleanupFailed: result.streamDelete.failed,
    });
    return json({
      ok: true,
      removed: result.removed,
      alreadyRemoved: result.notFound || result.dbDelete.alreadyMissing,
      warning: result.streamDelete.failed
        ? 'Video detached locally, but upstream Stream cleanup should be retried.'
        : null,
      uploadAttemptId,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const streamHttpStatus = error instanceof CloudflareStreamApiError ? error.status : null;
    logVideoError('remove', 'failed', {
      uploadAttemptId,
      productId,
      streamHttpStatus,
      detail: truncateLogText(detail),
    });
    return json(
      {
        ok: false,
        stage: 'remove',
        message: 'Failed to remove product video.',
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
  const method = context.request.method.toUpperCase();
  if (method === 'GET') return onRequestGet(context);
  if (method === 'DELETE') return onRequestDelete(context);
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
