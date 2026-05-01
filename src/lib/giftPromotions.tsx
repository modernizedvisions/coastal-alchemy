import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { GiftPromotion, GiftPromotionProductSummary } from './types';

export type GiftPromotionContextValue = {
  giftPromotion: GiftPromotion | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

type PricedItemLike = {
  priceCents?: number | null;
  quantity?: number | null;
};

const GiftPromotionContext = createContext<GiftPromotionContextValue | undefined>(undefined);

const fetchActiveGiftPromotion = async (): Promise<GiftPromotion | null> => {
  const response = await fetch('/api/promotions/gift-active', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Active gift promotion fetch failed (${response.status})`);
  }
  const data = await response.json();
  return (data?.giftPromotion as GiftPromotion | null) || null;
};

export const computeGiftMerchandiseSubtotalCents = (items: PricedItemLike[]): number => {
  if (!Array.isArray(items) || !items.length) return 0;
  return items.reduce((sum, item) => {
    const unit = Number(item?.priceCents || 0);
    const quantity = Math.max(1, Math.floor(Number(item?.quantity || 1)));
    if (!Number.isFinite(unit) || unit <= 0) return sum;
    return sum + unit * quantity;
  }, 0);
};

export const doesGiftPromotionQualify = (
  giftPromotion: GiftPromotion | null | undefined,
  merchandiseSubtotalCents: number
): boolean => {
  if (!giftPromotion || !giftPromotion.enabled) return false;
  const threshold = Number(giftPromotion.thresholdSubtotalCents || 0);
  if (!Number.isFinite(threshold) || threshold < 1) return false;
  return merchandiseSubtotalCents >= threshold;
};

export const getGiftRemainingCents = (
  giftPromotion: GiftPromotion | null | undefined,
  merchandiseSubtotalCents: number
): number => {
  if (!giftPromotion || !giftPromotion.enabled) return 0;
  const threshold = Number(giftPromotion.thresholdSubtotalCents || 0);
  if (!Number.isFinite(threshold) || threshold < 1) return 0;
  return Math.max(0, threshold - Math.max(0, merchandiseSubtotalCents));
};

export const getQualifiedGiftProductPreview = (
  giftPromotion: GiftPromotion | null | undefined,
  merchandiseSubtotalCents: number
): GiftPromotionProductSummary | null => {
  if (!doesGiftPromotionQualify(giftPromotion, merchandiseSubtotalCents)) return null;
  return giftPromotion?.giftProduct || null;
};

export function GiftPromotionProvider({ children }: { children: ReactNode }) {
  const [giftPromotion, setGiftPromotion] = useState<GiftPromotion | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const active = await fetchActiveGiftPromotion();
      setGiftPromotion(active);
    } catch (error) {
      console.error('Failed to load active gift promotion', error);
      setGiftPromotion(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!mounted) return;
      await refresh();
    };
    load();
    const interval = window.setInterval(load, 60000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      giftPromotion,
      isLoading,
      refresh,
    }),
    [giftPromotion, isLoading, refresh]
  );

  return <GiftPromotionContext.Provider value={value}>{children}</GiftPromotionContext.Provider>;
}

export const useGiftPromotions = () => {
  const context = useContext(GiftPromotionContext);
  if (!context) {
    throw new Error('useGiftPromotions must be used within GiftPromotionProvider');
  }
  return context;
};