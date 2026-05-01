import type { AdminEmailListResponse, EmailListSubscribeResult } from './emailListTypes';
import { adminFetch } from './adminAuth';

const parseJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json().catch(() => null)) as T | null;
  if (!data) throw new Error('Response was not valid JSON');
  return data;
};

export async function subscribeToEmailList(email: string): Promise<EmailListSubscribeResult> {
  const response = await fetch('/api/email-list/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await parseJson<any>(response).catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data?.error === 'string' ? data.error : '';
    throw new Error(detail || `Failed to subscribe (${response.status})`);
  }
  return {
    ok: !!data?.ok,
    alreadySubscribed: !!data?.alreadySubscribed,
  };
}

export async function fetchAdminEmailList(): Promise<AdminEmailListResponse> {
  const response = await adminFetch('/api/admin/email-list', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
  const data = await parseJson<any>(response).catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data?.error === 'string' ? data.error : data?.code || '';
    throw new Error(detail || `Failed to fetch email list (${response.status})`);
  }
  return {
    ok: !!data?.ok,
    items: Array.isArray(data?.items) ? data.items : [],
  };
}
