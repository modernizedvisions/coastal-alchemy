import {
  getActiveProducts,
  getProductById,
  getRelatedProducts,
  getSoldProducts,
} from './db/products';
import { createEmbeddedCheckoutSession, fetchCheckoutSession } from './payments/checkout';
import type { Category, HomeSiteContent } from './types';
import { normalizeImageUrl } from './images';

export const fetchProducts = getActiveProducts;
export const fetchProductById = getProductById;
export const fetchRelatedProducts = getRelatedProducts;
export const fetchSoldProducts = getSoldProducts;

export { createEmbeddedCheckoutSession, fetchCheckoutSession };

export type CustomOrderExample = {
  id: string;
  imageUrl: string;
  imageId?: string;
  title: string;
  description: string;
  tags: string[];
  sortOrder?: number;
  isActive?: boolean;
};

export async function fetchGalleryImages() {
  const response = await fetch('/api/gallery', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Gallery API responded with ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.images)) return [];
  return data.images.map((img: any, idx: number) => ({
    id: img.id || `gallery-${idx}`,
    imageUrl: normalizeImageUrl(img.imageUrl || img.image_url || ''),
    imageId: img.imageId || img.image_id || undefined,
    hidden: !!(img.hidden ?? img.is_active === 0),
    alt: img.alt || img.alt_text,
    title: img.title || undefined,
    position: typeof img.position === 'number' ? img.position : idx,
    createdAt: img.createdAt || img.created_at,
  }));
}

export async function fetchCategories(): Promise<Category[]> {
  try {
    const response = await fetch('/api/categories', { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Categories API responded with ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data.categories) ? (data.categories as Category[]) : [];
  } catch (error) {
    console.error('Failed to load categories from API', error);
    return [];
  }
}

export async function fetchCustomOrderExamples(): Promise<CustomOrderExample[]> {
  const response = await fetch('/api/custom-orders/examples', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Custom order examples API responded with ${response.status}`);
  const data = await response.json();
  return Array.isArray(data?.examples) ? (data.examples as CustomOrderExample[]) : [];
}

export async function getPublicSiteContentHome(): Promise<HomeSiteContent> {
  const response = await fetch('/api/site-content', { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Site content API responded with ${response.status}`);
  const data = await response.json();
  return (data || {}) as HomeSiteContent;
}
