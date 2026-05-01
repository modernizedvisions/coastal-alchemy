import type { ProductVideoStatus, ProductVideoSummary } from './types';

export const PRODUCT_VIDEO_ACCEPTED_EXTENSIONS = new Set(['.mp4', '.mov']);
export const PRODUCT_VIDEO_ACCEPTED_MIME_TYPES = new Set(['video/mp4', 'video/quicktime']);
export const PRODUCT_VIDEO_MAX_SIZE_MB = 50;
export const PRODUCT_VIDEO_MAX_BYTES = PRODUCT_VIDEO_MAX_SIZE_MB * 1024 * 1024;

export const emptyProductVideoSummary = (): ProductVideoSummary => ({
  hasVideo: false,
  status: 'empty',
  provider: null,
  providerAssetId: null,
  thumbnailUrl: null,
  durationSeconds: null,
});

export const normalizeProductVideoStatus = (
  status: string | null | undefined
): ProductVideoStatus => {
  const normalized = (status || '').trim().toLowerCase();
  if (!normalized) return 'empty';
  if (normalized === 'empty') return 'empty';
  if (normalized === 'uploading') return 'uploading';
  if (normalized === 'processing') return 'processing';
  if (normalized === 'ready') return 'ready';
  if (normalized === 'error') return 'error';
  return 'processing';
};
