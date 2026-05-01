import { getAdminSession } from '../_lib/adminAuth';

type MiddlewareContext = {
  request: Request;
  env: any;
  next: () => Promise<Response>;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const normalizePath = (pathname: string): string => {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
};

const isLoginEndpoint = (pathname: string): boolean => normalizePath(pathname) === '/api/admin/auth/login';

export const onRequest = async (context: MiddlewareContext): Promise<Response> => {
  const method = context.request.method.toUpperCase();
  if (method === 'OPTIONS') {
    return context.next();
  }

  const pathname = new URL(context.request.url).pathname;
  if (isLoginEndpoint(pathname)) {
    return context.next();
  }

  const session = await getAdminSession(context.env, context.request);
  if (!session) {
    return json({ ok: false, code: 'ADMIN_UNAUTH' }, 401);
  }

  return context.next();
};
