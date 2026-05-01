import { ADMIN_SESSION_COOKIE, clearCookieHeader, revokeAdminSession } from '../../_lib/adminAuth';

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

export const onRequestPost = async (context: { request: Request; env: any }): Promise<Response> => {
  try {
    await revokeAdminSession(context.env, context.request);
  } catch (error) {
    console.error('[admin auth logout] revoke failed', error);
  }

  return json(
    { ok: true },
    200,
    {
      'Set-Cookie': clearCookieHeader(ADMIN_SESSION_COOKIE),
    }
  );
};
