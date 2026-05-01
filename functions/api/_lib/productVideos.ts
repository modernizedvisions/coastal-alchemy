import {
  type AppVideoUploadStatus,
  type CloudflareStreamEnv,
  type CloudflareStreamVideoDetails,
  deleteCloudflareStreamVideo,
  getCloudflareStreamVideoDetails,
} from './videoProviders/cloudflareStream';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

export const VIDEO_PROVIDER_CLOUDFLARE_STREAM = 'cloudflare_stream' as const;

export type ProductVideoState = 'empty' | 'uploading' | 'processing' | 'ready' | 'error';

export type ProductVideoSummary = {
  hasVideo: boolean;
  status: ProductVideoState;
  provider: 'cloudflare_stream' | null;
  providerAssetId: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
};

export type ProductVideoRow = {
  id: string;
  product_id: string;
  provider: string;
  provider_asset_id: string;
  upload_status: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  mime_type: string | null;
  original_filename: string | null;
  uploaded_at: string | null;
  ready_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductVideoDetails = {
  provider: string;
  providerAssetId: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
  mimeType: string | null;
  originalFilename: string | null;
  uploadedAt: string | null;
  readyAt: string | null;
  errorMessage: string | null;
  status: ProductVideoState;
};

export type ProductVideoWriteInput = {
  id?: string;
  productId: string;
  provider: string;
  providerAssetId: string;
  status: AppVideoUploadStatus;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  sizeBytes?: number | null;
  mimeType?: string | null;
  originalFilename?: string | null;
  uploadedAt?: string | null;
  readyAt?: string | null;
  errorMessage?: string | null;
};

const PRODUCT_VIDEO_SELECT = `
  SELECT id, product_id, provider, provider_asset_id, upload_status,
         thumbnail_url, duration_seconds, size_bytes, mime_type, original_filename,
         uploaded_at, ready_at, error_message, created_at, updated_at
  FROM product_videos
`;

const PRODUCT_VIDEO_CHUNK_SIZE = 200;

const isMissingTableError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table/i.test(message) && /product_videos/i.test(message);
};

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNonNegativeFiniteNumberOrNull = (value: unknown): number | null => {
  const parsed = toFiniteNumberOrNull(value);
  if (parsed === null) return null;
  return parsed >= 0 ? parsed : null;
};

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (!Array.isArray(items) || !items.length) return [];
  const chunkSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : 1;
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
};

export const normalizeProductVideoState = (value: string | null | undefined): ProductVideoState => {
  // Collapse persisted/provider values into the compact app-facing state model.
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return 'empty';
  if (normalized === 'uploading') return 'uploading';
  if (normalized === 'processing') return 'processing';
  if (normalized === 'ready') return 'ready';
  if (normalized === 'error') return 'error';
  return 'processing';
};

export const emptyProductVideo = (): ProductVideoSummary => ({
  hasVideo: false,
  status: 'empty',
  provider: null,
  providerAssetId: null,
  thumbnailUrl: null,
  durationSeconds: null,
});

export const toProductVideoSummary = (
  row: ProductVideoRow | null | undefined
): ProductVideoSummary => {
  if (!row) return emptyProductVideo();
  const provider =
    row.provider === VIDEO_PROVIDER_CLOUDFLARE_STREAM ? VIDEO_PROVIDER_CLOUDFLARE_STREAM : null;
  const providerAssetId = (row.provider_asset_id || '').trim() || null;
  return {
    hasVideo: !!providerAssetId,
    status: normalizeProductVideoState(row.upload_status),
    provider,
    providerAssetId,
    thumbnailUrl: row.thumbnail_url || null,
    durationSeconds: toFiniteNumberOrNull(row.duration_seconds),
  };
};

export const toProductVideoDetails = (row: ProductVideoRow): ProductVideoDetails => ({
  provider: row.provider,
  providerAssetId: row.provider_asset_id,
  thumbnailUrl: row.thumbnail_url || null,
  durationSeconds: toFiniteNumberOrNull(row.duration_seconds),
  sizeBytes: toFiniteNumberOrNull(row.size_bytes),
  mimeType: row.mime_type || null,
  originalFilename: row.original_filename || null,
  uploadedAt: row.uploaded_at || null,
  readyAt: row.ready_at || null,
  errorMessage: row.error_message || null,
  status: normalizeProductVideoState(row.upload_status),
});

export const getProductVideoByProductId = async (
  db: D1Database,
  productId: string
): Promise<ProductVideoRow | null> => {
  try {
    return await db
      .prepare(`${PRODUCT_VIDEO_SELECT} WHERE product_id = ? LIMIT 1;`)
      .bind(productId)
      .first<ProductVideoRow>();
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
};

export const getProductVideoMapByProductIds = async (
  db: D1Database,
  productIds: string[]
): Promise<Map<string, ProductVideoRow>> => {
  const map = new Map<string, ProductVideoRow>();
  const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
  if (!uniqueIds.length) return map;

  try {
    for (const chunk of chunkArray(uniqueIds, PRODUCT_VIDEO_CHUNK_SIZE)) {
      const placeholders = chunk.map(() => '?').join(', ');
      const { results } = await db
        .prepare(`${PRODUCT_VIDEO_SELECT} WHERE product_id IN (${placeholders});`)
        .bind(...chunk)
        .all<ProductVideoRow>();
      (results || []).forEach((row) => {
        if (!row?.product_id) return;
        map.set(row.product_id, row);
      });
    }
  } catch (error) {
    if (isMissingTableError(error)) return map;
    throw error;
  }

  return map;
};

export const upsertProductVideo = async (
  db: D1Database,
  input: ProductVideoWriteInput
): Promise<{ success: boolean; error?: string }> => {
  const now = new Date().toISOString();
  const id = input.id || crypto.randomUUID();
  const status = normalizeProductVideoState(input.status);
  const readyAt = status === 'ready' ? input.readyAt || now : null;
  const durationSeconds = toNonNegativeFiniteNumberOrNull(input.durationSeconds);
  const sizeBytes = toNonNegativeFiniteNumberOrNull(input.sizeBytes);
  const result = await db
    .prepare(
      `INSERT INTO product_videos (
         id,
         product_id,
         provider,
         provider_asset_id,
         upload_status,
         thumbnail_url,
         duration_seconds,
         size_bytes,
         mime_type,
         original_filename,
         uploaded_at,
         ready_at,
         error_message,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         provider = excluded.provider,
         provider_asset_id = excluded.provider_asset_id,
         upload_status = excluded.upload_status,
         thumbnail_url = excluded.thumbnail_url,
         duration_seconds = excluded.duration_seconds,
         size_bytes = excluded.size_bytes,
         mime_type = excluded.mime_type,
         original_filename = excluded.original_filename,
         uploaded_at = excluded.uploaded_at,
         ready_at = excluded.ready_at,
         error_message = excluded.error_message,
         updated_at = excluded.updated_at;`
    )
    .bind(
      id,
      input.productId,
      input.provider,
      input.providerAssetId,
      status,
      input.thumbnailUrl || null,
      durationSeconds,
      sizeBytes,
      input.mimeType || null,
      input.originalFilename || null,
      input.uploadedAt || now,
      readyAt,
      input.errorMessage || null,
      now,
      now
    )
    .run();

  return {
    success: !!result.success,
    error: result.error,
  };
};

export const deleteProductVideoRowByProductId = async (
  db: D1Database,
  productId: string
): Promise<{ success: boolean; error?: string; changes: number }> => {
  const result = await db
    .prepare(`DELETE FROM product_videos WHERE product_id = ?;`)
    .bind(productId)
    .run();
  return {
    success: !!result.success,
    error: result.error,
    changes: result.meta?.changes || 0,
  };
};

export const buildVideoWriteInputFromProviderDetails = (params: {
  productId: string;
  providerAssetId: string;
  existingRowId?: string | null;
  details: CloudflareStreamVideoDetails;
  fallbackMimeType?: string | null;
  fallbackOriginalFilename?: string | null;
  fallbackSizeBytes?: number | null;
}): ProductVideoWriteInput => ({
  id: params.existingRowId || crypto.randomUUID(),
  productId: params.productId,
  provider: VIDEO_PROVIDER_CLOUDFLARE_STREAM,
  providerAssetId: params.providerAssetId,
  status: params.details.status,
  thumbnailUrl: params.details.thumbnailUrl,
  durationSeconds: params.details.durationSeconds,
  sizeBytes: params.details.sizeBytes ?? params.fallbackSizeBytes ?? null,
  mimeType: params.details.mimeType || params.fallbackMimeType || null,
  originalFilename: params.details.originalFilename || params.fallbackOriginalFilename || null,
  uploadedAt: params.details.uploadedAt,
  readyAt: params.details.readyAt,
  errorMessage: params.details.errorMessage,
});

export const refreshProductVideoFromProvider = async (
  db: D1Database,
  env: CloudflareStreamEnv,
  row: ProductVideoRow
): Promise<ProductVideoRow> => {
  // Keep D1 metadata in sync with provider lifecycle so admin/storefront only
  // need to consume normalized app-level states.
  if (row.provider !== VIDEO_PROVIDER_CLOUDFLARE_STREAM) {
    return row;
  }
  const details = await getCloudflareStreamVideoDetails(env, row.provider_asset_id);
  if (!details) {
    const writeResult = await upsertProductVideo(db, {
      id: row.id,
      productId: row.product_id,
      provider: row.provider,
      providerAssetId: row.provider_asset_id,
      status: 'error',
      thumbnailUrl: row.thumbnail_url,
      durationSeconds: row.duration_seconds,
      sizeBytes: row.size_bytes,
      mimeType: row.mime_type,
      originalFilename: row.original_filename,
      uploadedAt: row.uploaded_at,
      readyAt: row.ready_at,
      errorMessage: 'Video asset not found in Cloudflare Stream',
    });
    if (!writeResult.success) {
      throw new Error(writeResult.error || 'Failed to update missing-video state');
    }
    return (await getProductVideoByProductId(db, row.product_id)) || {
      ...row,
      upload_status: 'error',
      error_message: 'Video asset not found in Cloudflare Stream',
    };
  }

  const writeInput = buildVideoWriteInputFromProviderDetails({
    productId: row.product_id,
    providerAssetId: row.provider_asset_id,
    existingRowId: row.id,
    details,
    fallbackMimeType: row.mime_type,
    fallbackOriginalFilename: row.original_filename,
    fallbackSizeBytes: row.size_bytes,
  });
  const writeResult = await upsertProductVideo(db, writeInput);
  if (!writeResult.success) {
    throw new Error(writeResult.error || 'Failed to refresh product video metadata');
  }

  return (await getProductVideoByProductId(db, row.product_id)) || row;
};

export const removeProductVideoWithProviderCleanup = async (
  db: D1Database,
  env: CloudflareStreamEnv,
  productId: string
): Promise<{
  removed: boolean;
  notFound: boolean;
  rowExistedAtStart: boolean;
  provider: string | null;
  providerAssetId: string | null;
  streamDelete: {
    attempted: boolean;
    deleted: boolean;
    notFound: boolean;
    failed: boolean;
    error: string | null;
  };
  dbDelete: {
    success: boolean;
    changes: number;
    alreadyMissing: boolean;
    error: string | null;
  };
}> => {
  const existing = await getProductVideoByProductId(db, productId);
  if (!existing) {
    return {
      removed: true,
      notFound: true,
      rowExistedAtStart: false,
      provider: null,
      providerAssetId: null,
      streamDelete: {
        attempted: false,
        deleted: false,
        notFound: true,
        failed: false,
        error: null,
      },
      dbDelete: {
        success: true,
        changes: 0,
        alreadyMissing: true,
        error: null,
      },
    };
  }

  let streamDelete = {
    attempted: false,
    deleted: false,
    notFound: false,
    failed: false,
    error: null as string | null,
  };
  if (existing.provider === VIDEO_PROVIDER_CLOUDFLARE_STREAM) {
    try {
      streamDelete = {
        attempted: true,
        failed: false,
        error: null,
        ...(await deleteCloudflareStreamVideo(env, existing.provider_asset_id)),
      };
    } catch (error) {
      // Keep remove idempotent: local detachment must still proceed even if
      // upstream cleanup has a transient failure.
      streamDelete = {
        attempted: true,
        deleted: false,
        notFound: false,
        failed: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const deleted = await deleteProductVideoRowByProductId(db, productId);
  if (!deleted.success) {
    throw new Error(deleted.error || 'Failed to delete product video metadata');
  }

  const rowDeleted = deleted.changes > 0;
  return {
    removed: true,
    notFound: false,
    rowExistedAtStart: true,
    provider: existing.provider || null,
    providerAssetId: existing.provider_asset_id || null,
    streamDelete,
    dbDelete: {
      success: true,
      changes: deleted.changes,
      alreadyMissing: !rowDeleted,
      error: deleted.error || null,
    },
  };
};

export const tryDeleteVideoAssetByProvider = async (
  env: CloudflareStreamEnv,
  provider: string,
  providerAssetId: string
): Promise<void> => {
  if (provider === VIDEO_PROVIDER_CLOUDFLARE_STREAM) {
    await deleteCloudflareStreamVideo(env, providerAssetId);
  }
};
