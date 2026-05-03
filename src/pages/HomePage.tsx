import { useEffect, useState } from 'react';
import HomeTemplate from './HomeTemplate';
import { fetchCategories, getPublicSiteContentHome } from '../lib/publicApi';
import type { Category, HomeFeaturedCategoryTile, HomeSiteContent } from '../lib/types';

export function HomePage() {
  const [homeContent, setHomeContent] = useState<HomeSiteContent | null>(null);
  const [featuredTiles, setFeaturedTiles] = useState<HomeFeaturedCategoryTile[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [content, categories] = await Promise.all([
          getPublicSiteContentHome(),
          fetchCategories(),
        ]);
        if (!cancelled) {
          const resolvedContent = content || {};
          setHomeContent(resolvedContent);
          setFeaturedTiles(resolveFeaturedTiles(resolvedContent, categories));
        }
      } catch (err) {
        console.error('Failed to load home content or categories', err);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <HomeTemplate
      heroImageUrls={[
        homeContent?.heroImages?.left,
        homeContent?.heroImages?.middle,
        homeContent?.heroImages?.right,
      ].filter((url): url is string => !!url)}
      heroRotationEnabled={!!homeContent?.heroRotationEnabled}
      aboutImageUrl={homeContent?.aboutImages?.home}
      customOrdersMainImageUrl={homeContent?.customOrdersMainImage}
      featuredTiles={featuredTiles}
    />
  );
}

const normalize = (value?: string | null) =>
  (value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const resolveFeaturedTiles = (content: HomeSiteContent, categories: Category[]): HomeFeaturedCategoryTile[] => {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryBySlug = new Map(categories.map((category) => [normalize(category.slug), category]));
  const shopCategoryTiles = Array.isArray(content.shopCategoryCards)
    ? content.shopCategoryCards
        .slice()
        .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0))
        .slice(0, 4)
        .map((tile) => {
          const category =
            (tile.categoryId ? categoryById.get(tile.categoryId) : null) ||
            (tile.categorySlug ? categoryBySlug.get(normalize(tile.categorySlug)) : null);
          return category
            ? categoryToFeaturedTile(category, tile.label)
            : {
                imageUrl: '',
                title: tile.label || '',
                categorySlug: tile.categorySlug || 'all',
                categoryId: tile.categoryId,
              };
        })
        .filter((tile) => !!tile.imageUrl && !!tile.title)
    : [];
  const fallbackCategoryTiles = categories
    .filter((category) => category.showOnHomePage)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .slice(0, 4)
    .map((category) => categoryToFeaturedTile(category));

  const configuredTiles = (Array.isArray(content.featuredCategoryTiles) ? content.featuredCategoryTiles : [])
    .slice(0, 4)
    .map((tile) => {
      const category =
        (tile.categoryId ? categoryById.get(tile.categoryId) : null) ||
        (tile.categorySlug ? categoryBySlug.get(normalize(tile.categorySlug)) : null);
      return {
        ...tile,
        imageUrl: tile.imageUrl || category?.heroImageUrl || category?.imageUrl || '',
        title: tile.title || category?.name || '',
        categorySlug: tile.categorySlug === 'all' ? 'all' : category?.slug || tile.categorySlug || 'all',
        categoryId: tile.categoryId || category?.id,
      };
    })
    .filter((tile) => !!tile.imageUrl && !!tile.title);

  if (configuredTiles.length) return configuredTiles;
  if (shopCategoryTiles.length) return shopCategoryTiles;
  return fallbackCategoryTiles;
};

const categoryToFeaturedTile = (category: Category, title?: string): HomeFeaturedCategoryTile => ({
  imageUrl: category.heroImageUrl || category.imageUrl || '',
  title: title || category.name,
  categorySlug: category.slug || 'all',
  categoryId: category.id,
});
