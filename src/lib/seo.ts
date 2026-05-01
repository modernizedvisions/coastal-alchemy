import { useEffect, useMemo } from 'react';

export const CANONICAL_ORIGIN = 'https://coastal-alchemy.pages.dev';
export const DEFAULT_SOCIAL_IMAGE = `${CANONICAL_ORIGIN}/images/large-shell-frame.png`;

const MANAGED_ATTR = 'data-dd-seo';

export type SeoInput = {
  title: string;
  description: string;
  canonicalPath?: string;
  canonicalUrl?: string;
  ogType?: 'website' | 'product' | 'article';
  noindex?: boolean;
  robots?: string;
};

export const normalizePathname = (pathname: string): string => {
  const trimmed = pathname.split('#')[0].split('?')[0].trim();
  if (!trimmed || trimmed === '/') return '/';
  return trimmed.replace(/\/+$/, '') || '/';
};

export const toCanonicalUrl = (pathOrUrl?: string): string => {
  if (!pathOrUrl) return CANONICAL_ORIGIN;

  if (/^https?:\/\//i.test(pathOrUrl)) {
    try {
      const parsed = new URL(pathOrUrl);
      const normalizedPath = normalizePathname(parsed.pathname);
      return `${CANONICAL_ORIGIN}${normalizedPath === '/' ? '/' : normalizedPath}`;
    } catch {
      return CANONICAL_ORIGIN;
    }
  }

  const normalizedPath = normalizePathname(pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`);
  return `${CANONICAL_ORIGIN}${normalizedPath === '/' ? '/' : normalizedPath}`;
};

const clipDescription = (value: string): string => {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= 160) return collapsed;
  return `${collapsed.slice(0, 157)}...`;
};

const upsertMetaByName = (name: string, content: string) => {
  let node = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute('name', name);
    document.head.appendChild(node);
  }
  node.setAttribute('content', content);
  node.setAttribute(MANAGED_ATTR, '1');
};

const upsertMetaByProperty = (property: string, content: string) => {
  let node = document.head.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute('property', property);
    document.head.appendChild(node);
  }
  node.setAttribute('content', content);
  node.setAttribute(MANAGED_ATTR, '1');
};

const upsertCanonical = (href: string) => {
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
  link.setAttribute(MANAGED_ATTR, '1');
};

export const applySeo = (input: SeoInput): void => {
  const canonical = input.canonicalUrl || toCanonicalUrl(input.canonicalPath || '/');
  const description = clipDescription(input.description);
  const robots = input.robots || (input.noindex ? 'noindex, nofollow' : 'index, follow');
  const ogType = input.ogType || 'website';

  document.documentElement.lang = document.documentElement.lang || 'en';
  document.title = input.title;

  upsertMetaByName('description', description);
  upsertMetaByName('robots', robots);
  upsertMetaByName('twitter:title', input.title);
  upsertMetaByName('twitter:description', description);
  upsertMetaByName('twitter:card', 'summary_large_image');
  upsertMetaByName('twitter:image', DEFAULT_SOCIAL_IMAGE);
  upsertMetaByName('twitter:image:alt', 'Coastal Alchemy framed hand-painted shell collection');

  upsertMetaByProperty('og:title', input.title);
  upsertMetaByProperty('og:description', description);
  upsertMetaByProperty('og:url', canonical);
  upsertMetaByProperty('og:type', ogType);
  upsertMetaByProperty('og:site_name', 'Coastal Alchemy');
  upsertMetaByProperty('og:image', DEFAULT_SOCIAL_IMAGE);
  upsertMetaByProperty('og:image:secure_url', DEFAULT_SOCIAL_IMAGE);
  upsertMetaByProperty('og:image:type', 'image/png');
  upsertMetaByProperty('og:image:alt', 'Coastal Alchemy framed hand-painted shell collection');

  upsertCanonical(canonical);
};

export const useSeo = (input: SeoInput): void => {
  useEffect(() => {
    applySeo(input);
  }, [
    input.title,
    input.description,
    input.canonicalPath,
    input.canonicalUrl,
    input.ogType,
    input.noindex,
    input.robots,
  ]);
};

export const useJsonLd = (id: string, data: unknown | null): void => {
  const serialized = useMemo(() => (data ? JSON.stringify(data) : ''), [data]);

  useEffect(() => {
    const scriptId = `seo-jsonld-${id}`;
    const existing = document.getElementById(scriptId);

    if (!data) {
      existing?.remove();
      return;
    }

    let script = existing as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      script.setAttribute(MANAGED_ATTR, '1');
      document.head.appendChild(script);
    }
    script.text = serialized;

    return () => {
      const current = document.getElementById(scriptId);
      current?.remove();
    };
  }, [data, id, serialized]);
};

export const toAbsoluteAssetUrl = (pathOrUrl: string): string => {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${CANONICAL_ORIGIN}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
};
