CREATE TABLE IF NOT EXISTS gift_promotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  threshold_subtotal_cents INTEGER NOT NULL,
  gift_product_id TEXT NOT NULL,
  gift_quantity INTEGER NOT NULL DEFAULT 1,
  banner_enabled INTEGER NOT NULL DEFAULT 0,
  banner_text TEXT NOT NULL DEFAULT '',
  popup_enabled INTEGER NOT NULL DEFAULT 0,
  popup_title TEXT NOT NULL DEFAULT '',
  popup_description TEXT NOT NULL DEFAULT '',
  popup_button_text TEXT NOT NULL DEFAULT '',
  popup_redirect TEXT NOT NULL DEFAULT '',
  popup_image_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_gift_promotions_enabled ON gift_promotions(enabled);
CREATE INDEX IF NOT EXISTS idx_gift_promotions_updated_at ON gift_promotions(updated_at);

ALTER TABLE orders ADD COLUMN gift_promotion_id TEXT;
ALTER TABLE orders ADD COLUMN gift_product_id TEXT;
ALTER TABLE orders ADD COLUMN gift_quantity INTEGER;