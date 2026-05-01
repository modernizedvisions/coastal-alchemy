import { useEffect, useState } from 'react';
import HomeTemplate from './HomeTemplate';
import { fetchProducts, getPublicSiteContentHome } from '../lib/publicApi';
import type { HomeSiteContent, Product } from '../lib/types';

export function HomePage() {
  const [homeContent, setHomeContent] = useState<HomeSiteContent | null>(null);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [content, products] = await Promise.all([
          getPublicSiteContentHome(),
          fetchProducts(),
        ]);
        if (!cancelled) {
          setHomeContent(content || {});
          setFeaturedProducts((Array.isArray(products) ? products : [])
            .filter((product) => product.visible !== false)
            .slice(0, 4));
        }
      } catch (err) {
        console.error('Failed to load home content or featured products', err);
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
      featuredProducts={featuredProducts}
    />
  );
}
