// Deprecated.
// This legacy signed-cookie session helper is intentionally disabled.
// Use `functions/api/_lib/adminAuth.ts` (PBKDF2 + D1-backed `admin_sessions`) instead.

export const COOKIE_NAME = 'admin_session_deprecated';

const throwDeprecated = (): never => {
  throw new Error('Deprecated auth helper. Use functions/api/_lib/adminAuth.ts');
};

export const signAdminSession = async (): Promise<string> => throwDeprecated();
export const verifyAdminSession = async (): Promise<null> => throwDeprecated();
export const parseCookie = (): null => throwDeprecated();
export const buildSetCookie = (): string => throwDeprecated();
