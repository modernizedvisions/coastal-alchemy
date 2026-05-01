type Env = {
  IMAGES_BUCKET?: R2Bucket;
  IMAGE_STORAGE_PREFIX?: string;
  IMAGE_DEBUG?: string;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const guessContentType = (key: string) => {
  const lower = key.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return undefined;
};

const normalizePrefix = (value?: string): string => {
  const trimmed = (value || 'site').trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed || 'site';
};

const normalizePath = (pathname: string): string => {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
};

const shouldApplyNoIndexHeader = (pathname: string): boolean => {
  const normalized = normalizePath(pathname);
  if (normalized === '/admin' || normalized === '/admin/login' || normalized.startsWith('/admin/')) return true;
  if (normalized === '/checkout' || normalized === '/checkout/return') return true;
  if (normalized.startsWith('/api/admin') || normalized.startsWith('/api/checkout')) return true;
  if (normalized.startsWith('/api/_debug')) return true;
  return false;
};

const withNoIndexHeader = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export async function onRequest(context: {
  request: Request;
  env: Env;
  next: (input?: Request | string) => Promise<Response>;
}): Promise<Response> {
  const url = new URL(context.request.url);
  if (!url.pathname.startsWith('/images/')) {
    const response = await context.next();
    if (shouldApplyNoIndexHeader(url.pathname)) {
      return withNoIndexHeader(response);
    }
    return response;
  }

  const method = context.request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const storageKey = decodeURIComponent(url.pathname.replace(/^\/images\//, ''));
  if (!storageKey) {
    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  }

  const primary = normalizePrefix(context.env.IMAGE_STORAGE_PREFIX);
  const allowed = Array.from(new Set([primary, 'site', 'doverdesign'])).filter(Boolean);
  const allowedPrefixes = allowed.map((p) => `${p}/`);
  const isAllowed = allowedPrefixes.some((prefix) => storageKey.startsWith(prefix));
  if (!isAllowed) {
    const shouldLogReject = Boolean(context.env.IMAGE_STORAGE_PREFIX) || context.env.IMAGE_DEBUG === '1';
    if (shouldLogReject) {
      console.warn('[images/middleware] rejected key', {
        storageKey,
        allowedPrefixes,
      });
    }
    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  }

  if (!context.env.IMAGES_BUCKET) {
    console.error('[images/middleware] missing IMAGES_BUCKET binding');
    return json({ ok: false, code: 'MISSING_R2' }, 500);
  }

  try {
    const object = await context.env.IMAGES_BUCKET.get(storageKey);
    if (!object) {
      return json({ ok: false, code: 'NOT_FOUND' }, 404);
    }

    const headers = new Headers();

    if (typeof (object as any).writeHttpMetadata === 'function') {
      (object as any).writeHttpMetadata(headers);
    }

    const contentType = headers.get('Content-Type') || object.httpMetadata?.contentType || guessContentType(storageKey);
    if (contentType) headers.set('Content-Type', contentType);

    const etag = (object as any).httpEtag || object.etag;
    if (etag) headers.set('ETag', etag);

    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new Response(method === 'HEAD' ? null : object.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('[images/middleware] fetch failed', error);
    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  }
}
