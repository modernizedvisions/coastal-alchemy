ALTER TABLE categories ADD COLUMN subtitle TEXT;
ALTER TABLE categories ADD COLUMN image_id TEXT;
ALTER TABLE categories ADD COLUMN hero_image_id TEXT;
ALTER TABLE categories ADD COLUMN shipping_cents INTEGER DEFAULT 0;
