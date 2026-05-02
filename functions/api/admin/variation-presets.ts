import { requireAdmin } from '../_lib/adminAuth';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type VariationPresetRow = {
  id: string;
  name: string;
  groups_json: string;
  created_at?: string | null;
  updated_at?: string | null;
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

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const normalizeGroups = (value: unknown): VariationGroup[] => {
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
            id: typeof opt.id === 'string' && opt.id.trim() ? opt.id.trim() : crypto.randomUUID(),
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
        id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : crypto.randomUUID(),
        label,
        inputType: 'select' as const,
        required: source.required !== false,
        displayOrder: Number.isFinite(source.displayOrder as number) ? Number(source.displayOrder) : groupIndex,
        enabled: source.enabled !== false,
        presetId: typeof source.presetId === 'string' ? source.presetId : null,
        options,
      };
    })
    .filter((group): group is VariationGroup => Boolean(group));
};

const parseGroups = (value: string) => {
  try {
    return normalizeGroups(JSON.parse(value));
  } catch {
    return [];
  }
};

const mapRow = (row: VariationPresetRow) => ({
  id: row.id,
  name: row.name,
  groups: parseGroups(row.groups_json),
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
});

async function ensureSchema(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS variation_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        groups_json TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );`
    )
    .run();
}

export async function onRequest(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;

  await ensureSchema(context.env.DB);
  const method = context.request.method.toUpperCase();

  if (method === 'GET') {
    const { results } = await context.env.DB
      .prepare(`SELECT id, name, groups_json, created_at, updated_at FROM variation_presets ORDER BY lower(name) ASC;`)
      .all<VariationPresetRow>();
    return json({ presets: (results || []).map(mapRow) });
  }

  if (method === 'POST') {
    const body = (await context.request.json().catch(() => null)) as { name?: string; groups?: VariationGroup[] } | null;
    const name = (body?.name || '').trim();
    const groups = normalizeGroups(body?.groups);
    if (!name) return json({ error: 'Preset name is required' }, 400);
    if (!groups.length) return json({ error: 'Add at least one option group' }, 400);
    const id = crypto.randomUUID();
    await context.env.DB
      .prepare(`INSERT INTO variation_presets (id, name, groups_json, updated_at) VALUES (?, ?, ?, datetime('now'));`)
      .bind(id, name, JSON.stringify(groups))
      .run();
    return json({ preset: { id, name, groups, createdAt: null, updatedAt: null } }, 201);
  }

  if (method === 'PUT') {
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id') || '';
    if (!id) return json({ error: 'id is required' }, 400);
    const body = (await context.request.json().catch(() => null)) as { name?: string; groups?: VariationGroup[] } | null;
    const name = (body?.name || '').trim();
    const groups = normalizeGroups(body?.groups);
    if (!name) return json({ error: 'Preset name is required' }, 400);
    if (!groups.length) return json({ error: 'Add at least one option group' }, 400);
    await context.env.DB
      .prepare(`UPDATE variation_presets SET name = ?, groups_json = ?, updated_at = datetime('now') WHERE id = ?;`)
      .bind(name, JSON.stringify(groups), id)
      .run();
    return json({ preset: { id, name, groups } });
  }

  if (method === 'DELETE') {
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id') || '';
    if (!id) return json({ error: 'id is required' }, 400);
    await context.env.DB.prepare(`DELETE FROM variation_presets WHERE id = ?;`).bind(id).run();
    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
