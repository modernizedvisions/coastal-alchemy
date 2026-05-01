import { getAdminSession } from '../api/_lib/adminAuth';

type MiddlewareContext = {
  request: Request;
  env: any;
  next: (input?: Request | string) => Promise<Response>;
};

const normalizePath = (pathname: string): string => {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
};

const isLoginPath = (pathname: string): boolean => {
  const normalized = normalizePath(pathname);
  return normalized === '/admin' || normalized === '/admin/login';
};

const redirect = (request: Request, targetPath: string): Response => {
  const origin = new URL(request.url).origin;
  return Response.redirect(`${origin}${targetPath}`, 302);
};

export const onRequest = async (context: MiddlewareContext): Promise<Response> => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  if (pathname.startsWith('/admin/assets')) {
    return context.next();
  }

  const session = await getAdminSession(context.env, context.request);
  const hasSession = !!session;

  if (isLoginPath(pathname)) {
    if (hasSession) {
      return redirect(context.request, '/admin/customers');
    }
    return context.next('/index.html');
  }

  if (!hasSession) {
    return redirect(context.request, '/admin');
  }

  return context.next('/index.html');
};
