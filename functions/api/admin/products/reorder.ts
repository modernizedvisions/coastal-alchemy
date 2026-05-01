import { requireAdmin } from '../../_lib/adminAuth';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type ReorderPayload = {
  productIds?: unknown;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const normalizeProductIds = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
};

export async function onRequestPost(context: {
  env: { DB: D1Database };
  request: Request;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;

  const body = (await context.request.json().catch(() => null)) as ReorderPayload | null;
  const productIds = normalizeProductIds(body?.productIds);
  if (!productIds.length) {
    return json({ error: 'productIds is required' }, 400);
  }

  const uniqueIds = new Set(productIds);
  if (uniqueIds.size !== productIds.length) {
    return json({ error: 'productIds contains duplicates' }, 400);
  }

  const { results } = await context.env.DB.prepare(`SELECT id FROM products;`).all<{ id: string }>();
  const existingIds = (results || []).map((row) => row.id).filter(Boolean);
  const existingSet = new Set(existingIds);

  if (existingIds.length !== productIds.length) {
    return json({ error: 'productIds must include every product exactly once' }, 400);
  }

  const hasMissing = productIds.some((id) => !existingSet.has(id));
  if (hasMissing) {
    return json({ error: 'productIds contains unknown ids' }, 400);
  }

  try {
    const caseClauses = productIds.map(() => 'WHEN ? THEN ?').join(' ');
    const inPlaceholders = productIds.map(() => '?').join(', ');
    const values: unknown[] = [];

    productIds.forEach((id, index) => {
      values.push(id, index);
    });
    values.push(...productIds);

    const update = await context.env.DB
      .prepare(
        `UPDATE products
         SET sort_order = CASE id ${caseClauses} ELSE sort_order END
         WHERE id IN (${inPlaceholders});`
      )
      .bind(...values)
      .run();

    if (!update.success) {
      throw new Error(update.error || 'Failed to update sort_order');
    }

    return json({ success: true });
  } catch (error) {
    console.error('Failed to reorder products', error);
    return json({ error: 'Failed to reorder products' }, 500);
  }
}

export async function onRequest(context: {
  env: { DB: D1Database };
  request: Request;
}): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  return onRequestPost(context);
}
