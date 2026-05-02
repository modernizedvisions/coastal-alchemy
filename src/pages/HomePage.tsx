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
          setFeaturedTiles(resolveFeaturedTiles(resolvedContent.featuredCategoryTiles, categories));
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

const resolveFeaturedTiles = (
  tiles: HomeFeaturedCategoryTile[] | undefined,
  categories: Category[]
): HomeFeaturedCategoryTile[] => {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryBySlug = new Map(categories.map((category) => [normalize(category.slug), category]));

  return (Array.isArray(tiles) ? tiles : [])
    .slice(0, 4)
    .map((tile) => {
      const category =
        (tile.categoryId ? categoryById.get(tile.categoryId) : null) ||
        (tile.categorySlug ? categoryBySlug.get(normalize(tile.categorySlug)) : null);
      return {
        ...tile,
        categorySlug: tile.categorySlug === 'all' ? 'all' : category?.slug || tile.categorySlug || 'all',
      };
    })
    .filter((tile) => !!tile.imageUrl && !!tile.title);
};
