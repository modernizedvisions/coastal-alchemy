// Deprecated.
// Admin auth now uses /api/admin/auth/login + server-side sessions in D1.
export async function verifyAdminPassword(): Promise<boolean> {
  return false;
}
