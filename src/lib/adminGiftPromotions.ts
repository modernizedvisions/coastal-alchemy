import { adminFetch } from './adminAuth';
import type { GiftPromotion } from './types';

export type GiftPromotionInput = {
  name: string;
  enabled?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  thresholdSubtotalCents: number;
  giftProductId: string;
  giftQuantity?: number;
  bannerEnabled?: boolean;
  bannerText?: string;
  popupEnabled?: boolean;
  popupTitle?: string;
  popupDescription?: string;
  popupButtonText?: string;
  popupRedirect?: string;
  popupImageId?: string | null;
};

const GIFT_PROMOTIONS_PATH = '/api/admin/gift-promotions';

export async function fetchAdminGiftPromotions(): Promise<GiftPromotion[]> {
  const response = await adminFetch(GIFT_PROMOTIONS_PATH, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Failed to load gift promotions (${response.status})`);
  const data = await response.json();
  return Array.isArray(data.giftPromotions) ? (data.giftPromotions as GiftPromotion[]) : [];
}

export async function createAdminGiftPromotion(payload: GiftPromotionInput): Promise<GiftPromotion> {
  const response = await adminFetch(GIFT_PROMOTIONS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Failed to create gift promotion (${response.status})`);
  }
  return data.giftPromotion as GiftPromotion;
}

export async function updateAdminGiftPromotion(
  id: string,
  updates: Partial<GiftPromotionInput>
): Promise<GiftPromotion> {
  const response = await adminFetch(`${GIFT_PROMOTIONS_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(updates),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Failed to update gift promotion (${response.status})`);
  }
  return data.giftPromotion as GiftPromotion;
}

export async function deleteAdminGiftPromotion(id: string): Promise<void> {
  const response = await adminFetch(`${GIFT_PROMOTIONS_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Failed to delete gift promotion (${response.status})`);
  }
}