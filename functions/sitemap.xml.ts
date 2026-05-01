type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  DB?: D1Database;
};

type ProductRow = {
  id: string;
  slug?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

const CANONICAL_ORIGIN = 'https://dover-designs.com';

const STATIC_ROUTES = [
  '/',
  '/shop',
  '/gallery',
  '/custom-orders',
  '/about',
  '/join',
  '/terms',
  '/privacy',
];

const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const normalizeDate = (value?: string | null): string => {
  if (!value) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
};

const buildUrl = (path: string): string => `${CANONICAL_ORIGIN}${path === '/' ? '/' : path}`;

export async function onRequestGet(context: { env: Env }): Promise<Response> {
  const now = new Date().toISOString().slice(0, 10);
  const rows: Array<{ path: string; lastmod: string }> = STATIC_ROUTES.map((path) => ({
    path,
    lastmod: now,
  }));

  if (context.env.DB) {
    try {
      const { results } = await context.env.DB.prepare(
        `
          SELECT id, slug, created_at, updated_at
          FROM products
          WHERE (is_active = 1 OR is_active IS NULL)
            AND (is_sold IS NULL OR is_sold = 0)
            AND (quantity_available IS NULL OR quantity_available > 0)
          ORDER BY created_at DESC;
        `
      ).all<ProductRow>();

      for (const product of results || []) {
        const handle = (product.slug || product.id || '').trim();
        if (!handle) continue;
        const safeHandle = encodeURIComponent(handle);
        rows.push({
          path: `/product/${safeHandle}`,
          lastmod: normalizeDate(product.updated_at || product.created_at),
        });
      }
    } catch (error) {
      console.error('[sitemap.xml] failed to load products from D1', error);
    }
  }

  const seen = new Set<string>();
  const deduped = rows.filter((row) => {
    if (seen.has(row.path)) return false;
    seen.add(row.path);
    return true;
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${deduped
  .map(
    (row) => `  <url>
    <loc>${xmlEscape(buildUrl(row.path))}</loc>
    <lastmod>${row.lastmod}</lastmod>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=1800',
    },
  });
}
