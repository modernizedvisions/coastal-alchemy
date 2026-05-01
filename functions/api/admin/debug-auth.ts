const json = (data: unknown, status = 410) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

// Deprecated endpoint.
export async function onRequestGet(): Promise<Response> {
  return json({ ok: false, code: 'DEPRECATED_AUTH_ENDPOINT' });
}
