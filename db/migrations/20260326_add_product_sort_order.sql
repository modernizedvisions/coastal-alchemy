ALTER TABLE products ADD COLUMN sort_order INTEGER;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY datetime(created_at) DESC, rowid ASC
    ) - 1 AS next_sort_order
  FROM products
)
UPDATE products
SET sort_order = (
  SELECT ordered.next_sort_order
  FROM ordered
  WHERE ordered.id = products.id
)
WHERE id IN (SELECT id FROM ordered);

CREATE INDEX IF NOT EXISTS idx_products_sort_order ON products(sort_order);
