const json = (data: unknown, status = 410) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

// Deprecated endpoint. Use POST /api/admin/auth/logout.
export const onRequestPost = async (): Promise<Response> =>
  json({ ok: false, code: 'DEPRECATED_AUTH_ENDPOINT', use: '/api/admin/auth/logout' });
