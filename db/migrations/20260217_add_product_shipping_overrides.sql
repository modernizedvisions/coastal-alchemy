ALTER TABLE products ADD COLUMN shipping_override_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN shipping_override_amount_cents INTEGER;
