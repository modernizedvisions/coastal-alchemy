PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS product_videos (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  provider_asset_id TEXT NOT NULL,
  upload_status TEXT NOT NULL CHECK (upload_status IN ('uploading', 'processing', 'ready', 'error')),
  thumbnail_url TEXT,
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  mime_type TEXT,
  original_filename TEXT,
  uploaded_at TEXT,
  ready_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_videos_provider_asset
ON product_videos(provider, provider_asset_id);

CREATE INDEX IF NOT EXISTS idx_product_videos_upload_status
ON product_videos(upload_status);
