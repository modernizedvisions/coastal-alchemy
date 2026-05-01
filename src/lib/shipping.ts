import type { Category } from './types';

export type ShippingItem = {
  category?: string | null;
  categories?: Array<string | null> | null;
  shippingOverrideEnabled?: boolean | number | null;
  shipping_override_enabled?: boolean | number | null;
  shippingOverrideAmountCents?: number | null;
  shipping_override_amount_cents?: number | null;
};

const normalizeCategoryKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const buildCategoryShippingMap = (categories: Category[]) => {
  const map = new Map<string, number>();
  categories.forEach((cat) => {
    const rawCents = cat.shippingCents;
    const shippingCents =
      Number.isFinite(rawCents as number) && (rawCents as number) >= 0
        ? Number(rawCents)
        : 0;
    const slugKey = cat.slug ? normalizeCategoryKey(cat.slug) : '';
    const nameKey = cat.name ? normalizeCategoryKey(cat.name) : '';
    [slugKey, nameKey].filter(Boolean).forEach((key) => {
      const existing = map.get(key);
      if (existing === undefined || shippingCents > existing) {
        map.set(key, shippingCents);
      }
    });
  });
  return map;
};

const normalizeOverrideEnabled = (value: unknown): boolean =>
  value === true || value === 1 || value === '1';

const normalizeOverrideAmountCents = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
};

const resolveOverrideShippingCents = (item: ShippingItem): number | null => {
  const enabled = normalizeOverrideEnabled(
    item.shippingOverrideEnabled ?? item.shipping_override_enabled
  );
  if (!enabled) return null;

  return normalizeOverrideAmountCents(
    item.shippingOverrideAmountCents ?? item.shipping_override_amount_cents
  );
};

const resolveItemCategoryShippingCents = (item: ShippingItem, map: Map<string, number>): number => {
  const categories = [
    item.category,
    ...(Array.isArray(item.categories) ? item.categories : []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (!categories.length) return 0;

  let itemMax = 0;
  for (const raw of categories) {
    const key = normalizeCategoryKey(raw);
    if (!key || !map.has(key)) continue;
    const shipping = map.get(key) ?? 0;
    if (shipping > itemMax) itemMax = shipping;
  }
  return itemMax;
};

// Centralized shipping rule for frontend display (must match server helper):
// 1) If any product override is enabled, shipping = max(enabled override amounts)
// 2) Otherwise shipping = max(category shipping requirements across items)
export function calculateShippingCents(items: ShippingItem[], categories: Category[]): number {
  if (!items.length) return 0;

  const map = buildCategoryShippingMap(categories);
  let overrideMax: number | null = null;
  let categoryMax = 0;

  for (const item of items) {
    const overrideShipping = resolveOverrideShippingCents(item);
    if (overrideShipping !== null) {
      if (overrideMax === null || overrideShipping > overrideMax) {
        overrideMax = overrideShipping;
      }
      continue;
    }

    const categoryShipping = resolveItemCategoryShippingCents(item, map);
    if (categoryShipping > categoryMax) categoryMax = categoryShipping;
  }

  if (overrideMax !== null) return overrideMax;
  return categoryMax;
}
