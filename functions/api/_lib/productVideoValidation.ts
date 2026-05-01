import {
  type CloudflareStreamEnv,
  getCloudflareStreamConfig,
} from './videoProviders/cloudflareStream';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

export type ProductVideoRowLite = {
  id: string;
  product_id: string;
  provider: string;
  provider_asset_id: string;
  upload_status: string;
};

export const ALLOWED_PRODUCT_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);
export const ALLOWED_PRODUCT_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime']);

const getLowercaseExtension = (filename: string | undefined): string | null => {
  if (!filename) return null;
  const trimmed = filename.trim().toLowerCase();
  if (!trimmed) return null;
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot < 0) return null;
  return trimmed.slice(lastDot);
};

const normalizeMimeType = (mimeType: string | undefined): string | null => {
  if (!mimeType) return null;
  const normalized = mimeType.trim().toLowerCase();
  return normalized || null;
};

const bytesFromMegabytes = (mb: number): number => Math.floor(mb * 1024 * 1024);

export const validateProductVideoFileInput = (
  env: CloudflareStreamEnv,
  input: {
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
  }
): string | null => {
  const extension = getLowercaseExtension(input.filename);
  const mimeType = normalizeMimeType(input.mimeType);

  if (!extension || !ALLOWED_PRODUCT_VIDEO_EXTENSIONS.has(extension)) {
    return 'Only .mp4 and .mov uploads are supported';
  }
  if (!mimeType || !ALLOWED_PRODUCT_VIDEO_MIME_TYPES.has(mimeType)) {
    return 'Only MP4 or MOV video MIME types are supported';
  }
  const streamConfig = getCloudflareStreamConfig(env);
  const maxSizeBytes = bytesFromMegabytes(streamConfig.maxFileSizeMb);
  const sizeBytes = Number(input.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return 'sizeBytes must be a positive number';
  }
  if (sizeBytes > maxSizeBytes) {
    return `Video exceeds max size of ${streamConfig.maxFileSizeMb} MB`;
  }
  return null;
};

export const getProductExists = async (db: D1Database, productId: string): Promise<boolean> => {
  const row = await db
    .prepare(`SELECT id FROM products WHERE id = ? LIMIT 1;`)
    .bind(productId)
    .first<{ id: string }>();
  return !!row?.id;
};

export const getExistingProductVideo = async (
  db: D1Database,
  productId: string
): Promise<ProductVideoRowLite | null> =>
  db
    .prepare(
      `SELECT id, product_id, provider, provider_asset_id, upload_status
       FROM product_videos
       WHERE product_id = ?
       LIMIT 1;`
    )
    .bind(productId)
    .first<ProductVideoRowLite>();

export const validateOneVideoPerProduct = async (
  db: D1Database,
  productId: string,
  options?: { allowExistingForReplace?: boolean }
): Promise<{ error: string | null; existing: ProductVideoRowLite | null }> => {
  const existing = await getExistingProductVideo(db, productId);
  if (!existing) {
    return { error: null, existing: null };
  }
  if (options?.allowExistingForReplace) {
    return { error: null, existing };
  }
  return {
    error: 'Product already has a video. Use the replace flow.',
    existing,
  };
};

export const validateReplaceFlowInput = (input: {
  existingAssetId?: string | null;
  newAssetId?: string | null;
}): string | null => {
  const existingAssetId = (input.existingAssetId || '').trim();
  const newAssetId = (input.newAssetId || '').trim();
  if (!existingAssetId) return 'Cannot replace video because the current video is missing';
  if (!newAssetId) return 'providerAssetId is required';
  if (existingAssetId === newAssetId) {
    return 'Replacement asset must be different from the current asset';
  }
  return null;
};
