CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT,
  slug TEXT,
  description TEXT,
  price_cents INTEGER,
  category TEXT,
  image_url TEXT,
  -- Extended fields for inventory + Stripe wiring
  image_urls_json TEXT,
  primary_image_id TEXT,
  image_ids_json TEXT,
  is_active INTEGER DEFAULT 1,
  is_one_off INTEGER DEFAULT 1,
  is_sold INTEGER DEFAULT 0,
  quantity_available INTEGER DEFAULT 1,
  stripe_price_id TEXT,
  stripe_product_id TEXT,
  collection TEXT,
  shipping_override_enabled INTEGER NOT NULL DEFAULT 0,
  shipping_override_amount_cents INTEGER,
  option_groups_json TEXT,
  use_category_options INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT,
  slug TEXT NOT NULL,
  image_url TEXT,
  hero_image_url TEXT,
  image_id TEXT,
  hero_image_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  option_group_label TEXT,
  option_group_options_json TEXT,
  option_groups_json TEXT,
  show_on_homepage INTEGER DEFAULT 0,
  shipping_cents INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS variation_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  groups_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  storage_provider TEXT NOT NULL DEFAULT 'r2',
  storage_key TEXT NOT NULL,
  public_url TEXT,
  content_type TEXT,
  size_bytes INTEGER,
  original_filename TEXT,
  entity_type TEXT,
  entity_id TEXT,
  kind TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  stripe_payment_intent_id TEXT,
  total_cents INTEGER,
  currency TEXT,
  amount_total_cents INTEGER,
  amount_subtotal_cents INTEGER,
  amount_shipping_cents INTEGER,
  amount_tax_cents INTEGER,
  amount_discount_cents INTEGER,
  shipping_cents INTEGER,
  customer_email TEXT,
  shipping_name TEXT,
  shipping_address_json TEXT,
  shipping_phone TEXT,
  card_last4 TEXT,
  card_brand TEXT,
  is_seen INTEGER NOT NULL DEFAULT 0,
  seen_at TEXT,
  viewed_at TEXT,
  manual_fulfillment_override TEXT CHECK (
    manual_fulfillment_override IN ('new_order', 'label_needed', 'label_created', 'shipped')
  ),
  shipping_label_created_at TEXT,
  fulfillment_shipped_at TEXT,
  gift_promotion_id TEXT,
  gift_product_id TEXT,
  gift_quantity INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Migration for existing databases (run via Wrangler once per environment):
-- ALTER TABLE orders ADD COLUMN card_last4 TEXT;
-- ALTER TABLE orders ADD COLUMN card_brand TEXT;

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  product_id TEXT,
  quantity INTEGER,
  price_cents INTEGER,
  image_url TEXT,
  option_group_label TEXT,
  option_value TEXT
);

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

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  message TEXT,
  image_url TEXT,
  image_id TEXT,
  type TEXT NOT NULL DEFAULT 'message',
  category_id TEXT,
  category_name TEXT,
  inspo_example_id TEXT,
  inspo_title TEXT,
  inspo_image_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_list (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_list_email ON email_list(email);
CREATE INDEX IF NOT EXISTS idx_email_list_created_at ON email_list(created_at);

CREATE TABLE IF NOT EXISTS custom_orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT,
  customer_email TEXT,
  description TEXT,
  image_url TEXT,
  image_id TEXT,
  image_storage_key TEXT,
  amount INTEGER,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  message_id TEXT,
  status TEXT DEFAULT 'pending',
  payment_link TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_order_examples (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  image_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery_images (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  image_url TEXT,
  image_id TEXT,
  alt_text TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  position INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ship_from_name TEXT,
  ship_from_address1 TEXT,
  ship_from_address2 TEXT,
  ship_from_city TEXT,
  ship_from_state TEXT,
  ship_from_postal TEXT,
  ship_from_country TEXT NOT NULL DEFAULT 'US',
  ship_from_phone TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO site_settings (id, ship_from_country)
VALUES (1, 'US');

CREATE TABLE IF NOT EXISTS shipping_box_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  length_in REAL NOT NULL,
  width_in REAL NOT NULL,
  height_in REAL NOT NULL,
  default_weight_lb REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  parcel_index INTEGER NOT NULL,
  box_preset_id TEXT,
  custom_length_in REAL,
  custom_width_in REAL,
  custom_height_in REAL,
  weight_lb REAL NOT NULL,
  easyship_shipment_id TEXT,
  easyship_label_id TEXT,
  carrier TEXT,
  service TEXT,
  tracking_number TEXT,
  label_url TEXT,
  label_cost_amount_cents INTEGER,
  label_currency TEXT NOT NULL DEFAULT 'USD',
  label_state TEXT NOT NULL DEFAULT 'pending',
  quote_selected_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  purchased_at TEXT,
  tracking_email_sent_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (box_preset_id) REFERENCES shipping_box_presets(id) ON DELETE SET NULL,
  CHECK (label_state IN ('pending', 'generated', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_shipments_order_parcel ON order_shipments(order_id, parcel_index);
CREATE INDEX IF NOT EXISTS idx_order_shipments_order ON order_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_shipments_label_state ON order_shipments(label_state);
CREATE INDEX IF NOT EXISTS idx_order_shipments_purchased_at ON order_shipments(purchased_at);

CREATE TABLE IF NOT EXISTS order_rate_quotes (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  shipment_temp_key TEXT NOT NULL,
  rates_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_rate_quotes_order_key ON order_rate_quotes(order_id, shipment_temp_key);
CREATE INDEX IF NOT EXISTS idx_order_rate_quotes_expires ON order_rate_quotes(expires_at);
