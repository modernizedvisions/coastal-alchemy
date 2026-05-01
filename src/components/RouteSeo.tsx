import { useLocation } from 'react-router-dom';
import { CANONICAL_ORIGIN, normalizePathname, useJsonLd, useSeo } from '../lib/seo';

type RouteSeoConfig = {
  title: string;
  description: string;
  ogType?: 'website' | 'product' | 'article';
  noindex?: boolean;
};

const DEFAULT_DESCRIPTION =
  'Dover Designs creates handcrafted coastal shell art for curated interiors, custom gifts, and one-of-a-kind collections.';

const STATIC_ROUTES: Record<string, RouteSeoConfig> = {
  '/': {
    title: 'Dover Designs | Handcrafted Coastal Shell Art',
    description:
      'Handcrafted coastal shell art designed for curated interiors. Shop one-of-a-kind pieces and custom shell designs.',
  },
  '/shop': {
    title: 'Shop Coastal Shell Art | Dover Designs',
    description: 'Browse handcrafted shell art collections and discover one-of-a-kind coastal pieces from Dover Designs.',
  },
  '/gallery': {
    title: 'Gallery | Dover Designs',
    description: 'Explore sold works, studio highlights, and the visual gallery of Dover Designs handcrafted shell art.',
  },
  '/custom-orders': {
    title: 'Custom Orders | Dover Designs',
    description: 'Request a custom shell art piece designed for your interior style, palette, and personal story.',
  },
  '/about': {
    title: 'About Dover Designs',
    description: 'Meet the artist behind Dover Designs and learn how each handcrafted shell piece is created.',
  },
  '/join': {
    title: 'Join the Email List | Dover Designs',
    description: 'Join the Dover Designs email list for collection updates, releases, and custom order news.',
  },
  '/terms': {
    title: 'Terms of Service | Dover Designs',
    description: 'Read the Dover Designs Terms of Service for purchases, custom orders, and website usage.',
  },
  '/privacy': {
    title: 'Privacy Policy | Dover Designs',
    description: 'Read the Dover Designs Privacy Policy to understand how information is collected and used.',
  },
};

const getRouteSeo = (pathname: string): RouteSeoConfig => {
  if (pathname === '/checkout') {
    return {
      title: 'Checkout | Dover Designs',
      description: 'Secure checkout for Dover Designs orders.',
      noindex: true,
    };
  }

  if (pathname === '/checkout/return') {
    return {
      title: 'Checkout Return | Dover Designs',
      description: 'Checkout confirmation and payment return page.',
      noindex: true,
    };
  }

  if (pathname === '/admin' || pathname === '/admin/login' || pathname.startsWith('/admin/')) {
    return {
      title: 'Admin | Dover Designs',
      description: 'Admin utility page.',
      noindex: true,
    };
  }

  if (pathname === '/product' || pathname.startsWith('/product/')) {
    return {
      title: 'Product | Dover Designs',
      description: 'View handcrafted product details from Dover Designs.',
      ogType: 'product',
    };
  }

  return (
    STATIC_ROUTES[pathname] || {
      title: 'Page Not Found | Dover Designs',
      description: 'The requested page could not be found.',
      noindex: true,
    }
  );
};

export function RouteSeo() {
  const location = useLocation();
  const pathname = normalizePathname(location.pathname);
  const config = getRouteSeo(pathname);

  useSeo({
    title: config.title,
    description: config.description || DEFAULT_DESCRIPTION,
    canonicalPath: pathname,
    ogType: config.ogType || 'website',
    noindex: config.noindex,
  });

  const isUtilitySurface =
    pathname === '/checkout' ||
    pathname === '/checkout/return' ||
    pathname === '/admin' ||
    pathname === '/admin/login' ||
    pathname.startsWith('/admin/');

  const organizationSchema = isUtilitySurface
    ? null
    : {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Dover Designs',
        url: CANONICAL_ORIGIN,
        logo: `${CANONICAL_ORIGIN}/logo.jpg`,
        sameAs: [
          'https://www.instagram.com/dover_designs/',
          'https://www.tiktok.com/@doverdesign',
        ],
      };

  const websiteSchema = isUtilitySurface
    ? null
    : {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Dover Designs',
        url: CANONICAL_ORIGIN,
      };

  useJsonLd('organization', organizationSchema);
  useJsonLd('website', websiteSchema);

  return null;
}
