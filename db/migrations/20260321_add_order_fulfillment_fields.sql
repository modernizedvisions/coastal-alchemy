PRAGMA foreign_keys=ON;

ALTER TABLE orders ADD COLUMN viewed_at TEXT;

ALTER TABLE orders ADD COLUMN manual_fulfillment_override TEXT CHECK (
  manual_fulfillment_override IN ('new_order', 'label_needed', 'label_created', 'shipped')
);

ALTER TABLE orders ADD COLUMN shipping_label_created_at TEXT;

ALTER TABLE orders ADD COLUMN fulfillment_shipped_at TEXT;

UPDATE orders
SET viewed_at = COALESCE(viewed_at, seen_at)
WHERE viewed_at IS NULL
  AND seen_at IS NOT NULL;
