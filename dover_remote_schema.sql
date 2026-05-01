CREATE INDEX idx_categories_name ON categories(name);

CREATE INDEX idx_categories_slug ON categories(slug);

CREATE INDEX idx_custom_invoices_created_at ON custom_invoices(created_at);

CREATE INDEX idx_custom_invoices_customer_email ON custom_invoices(customer_email);

CREATE INDEX idx_custom_invoices_status ON custom_invoices(status);

CREATE INDEX idx_custom_orders_created_at ON custom_orders(created_at);

CREATE UNIQUE INDEX idx_custom_orders_display_id ON custom_orders(display_custom_order_id);

CREATE INDEX idx_custom_orders_status ON custom_orders(status);

CREATE INDEX idx_custom_orders_stripe_payment_intent_id ON custom_orders(stripe_payment_intent_id);

CREATE INDEX idx_custom_orders_stripe_session_id ON custom_orders(stripe_session_id);

CREATE INDEX idx_email_logs_type_created_at ON email_logs(type, created_at);

CREATE INDEX idx_gallery_images_created_at ON gallery_images(created_at);

CREATE INDEX idx_gallery_images_sort_order ON gallery_images(sort_order);

CREATE INDEX idx_images_entity ON images(entity_type, entity_id);

CREATE INDEX idx_images_public_url ON images(public_url);

CREATE INDEX idx_images_storage_key ON images(storage_key);

CREATE INDEX idx_messages_created_at ON messages(created_at);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);

CREATE INDEX idx_order_items_product_id ON order_items(product_id);

CREATE INDEX idx_orders_created_at ON orders(created_at);

CREATE UNIQUE INDEX idx_orders_display_order_id ON orders(display_order_id);

CREATE INDEX idx_orders_payment_intent ON orders(stripe_payment_intent_id);

CREATE INDEX idx_products_category ON products(category);

CREATE INDEX idx_products_created_at ON products(created_at);

CREATE INDEX idx_products_is_active ON products(is_active);

CREATE INDEX idx_products_is_one_off ON products(is_one_off);

CREATE INDEX idx_products_is_sold ON products(is_sold);

CREATE INDEX idx_products_slug ON products(slug);

CREATE INDEX idx_products_stripe_product_id ON products(stripe_product_id);

CREATE UNIQUE INDEX idx_promo_codes_code ON promo_codes(code);

CREATE INDEX idx_promo_codes_enabled ON promo_codes(enabled);

CREATE INDEX idx_promotions_enabled ON promotions(enabled);

CREATE TABLE _cf_KV (
        key TEXT PRIMARY KEY,
        value BLOB
      ) WITHOUT ROWID;

CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    image_url TEXT,
    hero_image_url TEXT,
    show_on_homepage INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  , shipping_cents INTEGER DEFAULT 0, subtitle TEXT, image_id TEXT, hero_image_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, option_group_label TEXT, option_group_options_json TEXT);

CREATE TABLE custom_invoices (  id TEXT PRIMARY KEY,  invoice_number TEXT NOT NULL,  customer_name TEXT,  customer_email TEXT NOT NULL,  description TEXT,  amount_cents INTEGER NOT NULL,  status TEXT NOT NULL DEFAULT 'draft',  stripe_payment_link_url TEXT,  stripe_payment_link_id TEXT,  stripe_checkout_session_id TEXT,  stripe_payment_intent_id TEXT,  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));

CREATE TABLE custom_order_counters (
    year INTEGER PRIMARY KEY,
    counter INTEGER NOT NULL
  );

CREATE TABLE custom_order_examples (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings, e.g. ["INITIALS","DATE","KEEPSAKE"]
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE custom_orders (
    id TEXT PRIMARY KEY,
    display_custom_order_id TEXT,
    customer_name TEXT,
    customer_email TEXT,
    description TEXT,
    amount INTEGER,
    message_id TEXT,
    status TEXT DEFAULT 'pending',
    payment_link TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  , stripe_session_id TEXT, stripe_payment_intent_id TEXT, shipping_name TEXT, shipping_line1 TEXT, shipping_line2 TEXT, shipping_city TEXT, shipping_state TEXT, shipping_postal_code TEXT, shipping_country TEXT, shipping_phone TEXT, paid_at TEXT, image_url TEXT, shipping_cents INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, archived_at TEXT, image_id TEXT, image_storage_key TEXT, show_on_sold_products INTEGER NOT NULL DEFAULT 0);

CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE email_logs (  id TEXT PRIMARY KEY,  type TEXT NOT NULL,  to_email TEXT NOT NULL,  subject TEXT,  status TEXT NOT NULL,  error TEXT,  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));

CREATE TABLE gallery_images (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  hidden INTEGER DEFAULT 0,
  title TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
, url TEXT, alt_text TEXT, is_active INTEGER DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, position INTEGER DEFAULT 0, image_id TEXT);

CREATE TABLE hero_images (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  slot TEXT,                   -- e.g., 'main' or 'grid-N'
  hidden INTEGER DEFAULT 0,
  title TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE images (
    id TEXT PRIMARY KEY,
    storage_provider TEXT,
    storage_key TEXT,
    public_url TEXT,
    content_type TEXT,
    size_bytes INTEGER,
    original_filename TEXT,
    entity_type TEXT,
    entity_id TEXT,
    kind TEXT,
    is_primary INTEGER,
    sort_order INTEGER,
    upload_request_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    message TEXT,
    image_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  , type TEXT NOT NULL DEFAULT 'message', category_id TEXT, category_name TEXT, inspo_example_id TEXT, inspo_title TEXT, inspo_image_url TEXT, category_ids_json TEXT, category_names_json TEXT, is_read INTEGER NOT NULL DEFAULT 0, read_at TEXT);

CREATE TABLE order_counters (
    year INTEGER PRIMARY KEY,
    counter INTEGER NOT NULL
  );

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  product_id TEXT,
  quantity INTEGER,
  price_cents INTEGER
, image_url TEXT, option_group_label TEXT, option_value TEXT);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  stripe_payment_intent_id TEXT,
  total_cents INTEGER,
  customer_email TEXT,
  shipping_name TEXT,
  shipping_address_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
, card_last4 TEXT, card_brand TEXT, display_order_id TEXT, order_type TEXT, currency TEXT, description TEXT, shipping_cents INTEGER DEFAULT 0, promo_code TEXT, promo_percent_off INTEGER, promo_free_shipping INTEGER, promo_source TEXT, is_seen INTEGER NOT NULL DEFAULT 0, seen_at TEXT, amount_total_cents INTEGER NOT NULL DEFAULT 0, amount_subtotal_cents INTEGER, amount_shipping_cents INTEGER, amount_tax_cents INTEGER, amount_discount_cents INTEGER);

CREATE TABLE product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT,
  slug TEXT,
  description TEXT,
  price_cents INTEGER,
  category TEXT,
  image_url TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
, quantity_available INTEGER DEFAULT 1, is_one_off INTEGER DEFAULT 1, is_sold INTEGER DEFAULT 0, stripe_price_id TEXT, stripe_product_id TEXT, image_urls_json TEXT, collection TEXT, primary_image_id TEXT, image_ids_json TEXT);

CREATE TABLE promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  percent_off INTEGER,
  free_shipping INTEGER NOT NULL DEFAULT 0,
  scope TEXT NOT NULL CHECK (scope IN ('global','categories')),
  category_slugs_json TEXT NOT NULL DEFAULT '[]',
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE promotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  percent_off INTEGER NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global','categories')),
  category_slugs_json TEXT NOT NULL DEFAULT '[]',
  banner_enabled INTEGER NOT NULL DEFAULT 0,
  banner_text TEXT NOT NULL DEFAULT '',
  starts_at TEXT,
  ends_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE site_content (
    key TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

CREATE TABLE sqlite_sequence(name,seq);