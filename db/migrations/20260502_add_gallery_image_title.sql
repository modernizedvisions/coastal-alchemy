-- The gallery title column is already created/guarded by the gallery API schema
-- bootstrap in some deployed databases. Keep this migration as a no-op so D1 can
-- mark it applied instead of failing on duplicate column errors.
SELECT 1;
