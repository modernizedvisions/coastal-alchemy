import { useLocation } from 'react-router-dom';
import { CANONICAL_ORIGIN, normalizePathname, useJsonLd, useSeo } from '../lib/seo';

type RouteSeoConfig = {
  title: string;
  description: string;
  ogType?: 'website' | 'product' | 'article';
  noindex?: boolean;
};

const DEFAULT_DESCRIPTION =
  'Coastal Alchemy creates hand-painted shells, framed shell collections, tabletop pieces, and custom coastal art from Naples, Florida.';

const STATIC_ROUTES: Record<string, RouteSeoConfig> = {
  '/': {
    title: 'Coastal Alchemy | Hand-Painted Shell Art',
    description:
      'Hand-painted shells, framed shell collections, and coastal home pieces made by hand on the gulf coast of Naples, Florida.',
  },
  '/shop': {
    title: 'Shop Coastal Shell Art | Coastal Alchemy',
    description: 'Browse hand-painted shell art collections and discover one-of-a-kind coastal pieces from Coastal Alchemy.',
  },
  '/gallery': {
    title: 'Gallery | Coastal Alchemy',
    description: 'Explore finished works, studio highlights, and the visual gallery of Coastal Alchemy hand-painted shell art.',
  },
  '/custom-orders': {
    title: 'Custom Orders | Coastal Alchemy',
    description: 'Request a custom shell art piece designed for your interior style, palette, and personal story.',
  },
  '/about': {
    title: 'About Coastal Alchemy',
    description: 'Meet the studio behind Coastal Alchemy and learn how each hand-painted shell piece is created.',
  },
  '/join': {
    title: 'Join the Email List | Coastal Alchemy',
    description: 'Join the Coastal Alchemy email list for collection updates, releases, and custom order news.',
  },
  '/terms': {
    title: 'Terms of Service | Coastal Alchemy',
    description: 'Read the Coastal Alchemy Terms of Service for purchases, custom orders, and website usage.',
  },
  '/privacy': {
    title: 'Privacy Policy | Coastal Alchemy',
    description: 'Read the Coastal Alchemy Privacy Policy to understand how information is collected and used.',
  },
  '/contact': {
    title: 'Contact | Coastal Alchemy',
    description: 'Contact Coastal Alchemy for commissions, design trade, press, and hand-painted shell art inquiries.',
  },
};

const getRouteSeo = (pathname: string): RouteSeoConfig => {
  if (pathname === '/checkout') {
    return {
      title: 'Checkout | Coastal Alchemy',
      description: 'Secure checkout for Coastal Alchemy orders.',
      noindex: true,
    };
  }

  if (pathname === '/checkout/return') {
    return {
      title: 'Checkout Return | Coastal Alchemy',
      description: 'Checkout confirmation and payment return page.',
      noindex: true,
    };
  }

  if (pathname === '/admin' || pathname === '/admin/login' || pathname.startsWith('/admin/')) {
    return {
      title: 'Admin | Coastal Alchemy',
      description: 'Admin utility page.',
      noindex: true,
    };
  }

  if (pathname === '/product' || pathname.startsWith('/product/')) {
    return {
      title: 'Product | Coastal Alchemy',
      description: 'View hand-painted shell art product details from Coastal Alchemy.',
      ogType: 'product',
    };
  }

  return (
    STATIC_ROUTES[pathname] || {
      title: 'Page Not Found | Coastal Alchemy',
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
        name: 'Coastal Alchemy',
        url: CANONICAL_ORIGIN,
        logo: `${CANONICAL_ORIGIN}/images/logo.jpg`,
      };

  const websiteSchema = isUtilitySurface
    ? null
    : {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Coastal Alchemy',
        url: CANONICAL_ORIGIN,
      };

  useJsonLd('organization', organizationSchema);
  useJsonLd('website', websiteSchema);

  return null;
}
