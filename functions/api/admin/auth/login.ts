import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  getAdminSessionMaxAgeSeconds,
  pbkdf2Verify,
  setCookieHeader,
} from '../../_lib/adminAuth';

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

type LoginBody = {
  password?: string;
};

export const onRequestPost = async (context: { request: Request; env: any }): Promise<Response> => {
  let body: LoginBody | null = null;
  try {
    body = await context.request.json();
  } catch {
    body = null;
  }

  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) {
    return json({ ok: false, code: 'BAD_INPUT' }, 400);
  }

  try {
    const isValid = await pbkdf2Verify(password, context.env);
    if (!isValid) {
      return json({ ok: false, code: 'BAD_PASSWORD' }, 401);
    }

    const session = await createAdminSession(context.env, context.request);
    const maxAgeSeconds = getAdminSessionMaxAgeSeconds(context.env);
    const setCookie = setCookieHeader(ADMIN_SESSION_COOKIE, session.token, maxAgeSeconds);

    return json(
      { ok: true, expiresAt: session.expiresAt },
      200,
      {
        'Set-Cookie': setCookie,
      }
    );
  } catch (error) {
    console.error('[admin auth login] server error', error);
    return json({ ok: false, code: 'SERVER_ERROR' }, 500);
  }
};
