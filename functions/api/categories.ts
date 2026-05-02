import { normalizeImageUrl } from './_lib/images';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type CategoryRow = {
  id: string;
  name: string | null;
  subtitle?: string | null;
  sample_description?: string | null;
  slug: string | null;
  image_url?: string | null;
  hero_image_url?: string | null;
  image_id?: string | null;
  hero_image_id?: string | null;
  sort_order?: number | null;
  option_group_label?: string | null;
  option_group_options_json?: string | null;
  option_groups_json?: string | null;
  show_on_homepage?: number | null;
  shipping_cents?: number | null;
};

type Category = {
  id: string;
  name: string;
  subtitle?: string;
  sampleDescription?: string;
  slug: string;
  imageUrl?: string;
  heroImageUrl?: string;
  imageId?: string;
  heroImageId?: string;
  showOnHomePage: boolean;
  shippingCents?: number | null;
  sortOrder?: number;
  optionGroupLabel?: string | null;
  optionGroupOptions?: string[];
  optionGroups?: VariationGroup[];
};

type VariationOption = {
  id: string;
  label: string;
  value: string;
  priceIncreaseCents?: number;
  displayOrder?: number;
  enabled?: boolean;
};

type VariationGroup = {
  id: string;
  label: string;
  inputType: 'select';
  required: boolean;
  displayOrder?: number;
  enabled?: boolean;
  presetId?: string | null;
  options: VariationOption[];
};

const createCategoriesTable = `
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subtitle TEXT,
    sample_description TEXT,
    slug TEXT NOT NULL,
    image_url TEXT,
    hero_image_url TEXT,
    image_id TEXT,
    hero_image_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    option_group_label TEXT,
    option_group_options_json TEXT,
    show_on_homepage INTEGER DEFAULT 0,
    shipping_cents INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

const REQUIRED_CATEGORY_COLUMNS: Record<string, string> = {
  show_on_homepage: 'show_on_homepage INTEGER DEFAULT 0',
  slug: 'slug TEXT',
  hero_image_url: 'hero_image_url TEXT',
  subtitle: 'subtitle TEXT',
  sample_description: 'sample_description TEXT',
  image_id: 'image_id TEXT',
  hero_image_id: 'hero_image_id TEXT',
  shipping_cents: 'shipping_cents INTEGER DEFAULT 0',
  sort_order: 'sort_order INTEGER NOT NULL DEFAULT 0',
  option_group_label: 'option_group_label TEXT',
  option_group_options_json: 'option_group_options_json TEXT',
  option_groups_json: 'option_groups_json TEXT',
};

export async function onRequestGet(context: {
  env: { DB: D1Database };
  request: Request;
}): Promise<Response> {
  try {

    const { results } = await context.env.DB
      .prepare(
        `SELECT id, name, subtitle, sample_description, slug, image_url, hero_image_url, image_id, hero_image_id, sort_order, option_group_label, option_group_options_json, option_groups_json, show_on_homepage, shipping_cents, created_at
         FROM categories
         ORDER BY sort_order ASC, datetime(created_at) ASC, name ASC`
      )
      .all<CategoryRow>();

    const categories = (results || [])
      .map((row) => mapRowToCategory(row, context.request, context.env))
      .filter((c): c is Category => Boolean(c));

    return new Response(JSON.stringify({ categories }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to load categories', error);
    return new Response(JSON.stringify({ error: 'Failed to load categories' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

const mapRowToCategory = (
  row: CategoryRow,
  request: Request,
  env: { PUBLIC_IMAGES_BASE_URL?: string }
): Category | null => {
  if (!row || !row.id || !row.name || !row.slug) return null;
  const options = parseOptionGroupOptions(row.option_group_options_json);
  const optionGroupLabel = (row.option_group_label || '').trim() || null;
  const optionGroupOptions = optionGroupLabel && options.length ? options : [];
  const optionGroups = parseVariationGroups(row.option_groups_json);
  const resolvedGroups = optionGroups.length ? optionGroups : legacyGroups(row.option_group_label, row.option_group_options_json);
  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle || undefined,
    sampleDescription: row.sample_description || undefined,
    slug: row.slug,
    imageUrl: row.image_url ? normalizeImageUrl(row.image_url, request, env) : undefined,
    heroImageUrl: row.hero_image_url ? normalizeImageUrl(row.hero_image_url, request, env) : undefined,
    imageId: row.image_id || undefined,
    heroImageId: row.hero_image_id || undefined,
    showOnHomePage: row.show_on_homepage === 1,
    shippingCents: row.shipping_cents ?? 0,
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    optionGroupLabel: optionGroupLabel,
    optionGroupOptions: optionGroupLabel && optionGroupOptions.length ? optionGroupOptions : undefined,
    optionGroups: resolvedGroups.length ? resolvedGroups : undefined,
  };
};

const parseOptionGroupOptions = (value?: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
  } catch {
    return [];
  }
};

const toSlug = (value: string | undefined | null) =>
  (value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const normalizeVariationGroups = (value: unknown): VariationGroup[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((group, groupIndex) => {
      const source = group as Partial<VariationGroup>;
      const label = typeof source.label === 'string' ? source.label.trim() : '';
      const options = (Array.isArray(source.options) ? source.options : [])
        .map((option, optionIndex) => {
          const opt = option as Partial<VariationOption>;
          const optionLabel = typeof opt.label === 'string' ? opt.label.trim() : '';
          if (!optionLabel) return null;
          return {
            id: typeof opt.id === 'string' && opt.id.trim() ? opt.id.trim() : `${groupIndex}-${optionIndex}`,
            label: optionLabel,
            value: typeof opt.value === 'string' && opt.value.trim() ? opt.value.trim() : toSlug(optionLabel),
            priceIncreaseCents:
              Number.isFinite(opt.priceIncreaseCents as number) && Number(opt.priceIncreaseCents) > 0
                ? Math.round(Number(opt.priceIncreaseCents))
                : 0,
            displayOrder: Number.isFinite(opt.displayOrder as number) ? Number(opt.displayOrder) : optionIndex,
            enabled: opt.enabled !== false,
          };
        })
        .filter((option): option is VariationOption => Boolean(option));
      if (!label || !options.length) return null;
      return {
        id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : `${groupIndex}`,
        label,
        inputType: 'select' as const,
        required: source.required !== false,
        displayOrder: Number.isFinite(source.displayOrder as number) ? Number(source.displayOrder) : groupIndex,
        enabled: source.enabled !== false,
        presetId: typeof source.presetId === 'string' ? source.presetId : null,
        options,
      };
    })
    .filter((group): group is VariationGroup => Boolean(group))
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
};

const parseVariationGroups = (value?: string | null): VariationGroup[] => {
  if (!value) return [];
  try {
    return normalizeVariationGroups(JSON.parse(value));
  } catch {
    return [];
  }
};

const legacyGroups = (label?: string | null, optionsJson?: string | null): VariationGroup[] => {
  const cleanLabel = (label || '').trim();
  const options = parseOptionGroupOptions(optionsJson);
  if (!cleanLabel || !options.length) return [];
  return normalizeVariationGroups([
    {
      id: 'legacy',
      label: cleanLabel,
      inputType: 'select',
      required: true,
      displayOrder: 0,
      enabled: true,
      options: options.map((option, index) => ({
        id: `legacy-${index}`,
        label: option,
        value: toSlug(option),
        priceIncreaseCents: 0,
        displayOrder: index,
        enabled: true,
      })),
    },
  ]);
};

async function ensureCategorySchema(_db: D1Database) {
  return;
}
