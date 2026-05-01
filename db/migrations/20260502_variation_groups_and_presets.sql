ALTER TABLE categories ADD COLUMN option_groups_json TEXT;
ALTER TABLE products ADD COLUMN option_groups_json TEXT;
ALTER TABLE products ADD COLUMN use_category_options INTEGER NOT NULL DEFAULT 1;
ALTER TABLE order_items ADD COLUMN selected_options_json TEXT;

CREATE TABLE IF NOT EXISTS variation_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  groups_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO variation_presets (id, name, groups_json)
VALUES
(
  'preset_trim_color',
  'Trim Color',
  '[{"id":"group_trim","label":"Trim","inputType":"select","required":true,"displayOrder":0,"enabled":true,"options":[{"id":"trim_gold","label":"Gold","value":"gold","displayOrder":0,"enabled":true},{"id":"trim_silver","label":"Silver","value":"silver","displayOrder":1,"enabled":true},{"id":"trim_white","label":"White","value":"white","displayOrder":2,"enabled":true}]}]'
),
(
  'preset_shell_dish_options',
  'Shell Dish Options',
  '[{"id":"group_shell_type","label":"Shell Type","inputType":"select","required":true,"displayOrder":0,"enabled":true,"options":[{"id":"shell_oyster","label":"Oyster","value":"oyster","displayOrder":0,"enabled":true},{"id":"shell_clam","label":"Clam Shell","value":"clam-shell","displayOrder":1,"enabled":true},{"id":"shell_scallop","label":"Scallop Shell","value":"scallop-shell","displayOrder":2,"enabled":true}]},{"id":"group_trim","label":"Trim","inputType":"select","required":true,"displayOrder":1,"enabled":true,"options":[{"id":"trim_gold","label":"Gold","value":"gold","displayOrder":0,"enabled":true},{"id":"trim_silver","label":"Silver","value":"silver","displayOrder":1,"enabled":true}]}]'
),
(
  'preset_napkin_ring_set_size',
  'Napkin Ring Set Size',
  '[{"id":"group_set_size","label":"Set Size","inputType":"select","required":true,"displayOrder":0,"enabled":true,"options":[{"id":"set_2","label":"Set of 2","value":"set-of-2","displayOrder":0,"enabled":true},{"id":"set_4","label":"Set of 4","value":"set-of-4","displayOrder":1,"enabled":true},{"id":"set_8","label":"Set of 8","value":"set-of-8","displayOrder":2,"enabled":true},{"id":"set_10","label":"Set of 10","value":"set-of-10","displayOrder":3,"enabled":true},{"id":"set_12","label":"Set of 12","value":"set-of-12","displayOrder":4,"enabled":true}]}]'
);
