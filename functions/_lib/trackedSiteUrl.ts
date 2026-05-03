export type EmailUtmCampaign =
  | 'order_confirmation'
  | 'custom_order_followup'
  | 'newsletter'
  | 'customer_email';

type UtmParams = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
};

type BuildTrackedSiteUrlOptions = {
  siteOrigin?: string | null;
};

const DEFAULT_SITE_ORIGIN = 'https://coastalalchemy.com';

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const isAbsoluteHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const normalizeOrigin = (value: string | null | undefined): string | null => {
  const trimmed = trimOrNull(value);
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return null;
  }
};

const isKnownDefaultHost = (hostname: string): boolean => {
  const lower = hostname.toLowerCase();
  return lower === 'coastalalchemy.com' || lower === 'www.coastalalchemy.com' || lower.endsWith('.coastalalchemy.com');
};

const isFirstPartySiteUrl = (url: URL, options?: BuildTrackedSiteUrlOptions): boolean => {
  const configuredOrigin = normalizeOrigin(options?.siteOrigin);
  if (configuredOrigin) {
    try {
      return url.origin.toLowerCase() === new URL(configuredOrigin).origin.toLowerCase();
    } catch {
      return false;
    }
  }
  return isKnownDefaultHost(url.hostname);
};

export function buildTrackedSiteUrl(
  baseUrlOrPath: string,
  utm: UtmParams,
  options?: BuildTrackedSiteUrlOptions
): string {
  const input = trimOrNull(baseUrlOrPath);
  if (!input) return baseUrlOrPath;

  const isAbsoluteInput = isAbsoluteHttpUrl(input);
  const isRelativePathInput = input.startsWith('/');
  if (!isAbsoluteInput && !isRelativePathInput) return baseUrlOrPath;

  const fallbackOrigin = normalizeOrigin(options?.siteOrigin) || DEFAULT_SITE_ORIGIN;
  let url: URL;
  try {
    url = new URL(input, fallbackOrigin);
  } catch {
    return baseUrlOrPath;
  }

  if (isAbsoluteInput && !isFirstPartySiteUrl(url, options)) {
    return baseUrlOrPath;
  }

  if (!url.searchParams.has('utm_source')) {
    url.searchParams.set('utm_source', utm.utm_source);
  }
  if (!url.searchParams.has('utm_medium')) {
    url.searchParams.set('utm_medium', utm.utm_medium);
  }
  if (!url.searchParams.has('utm_campaign')) {
    url.searchParams.set('utm_campaign', utm.utm_campaign);
  }

  if (isAbsoluteInput) return url.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildTrackedEmailSiteUrl(
  baseUrlOrPath: string,
  campaign: EmailUtmCampaign,
  options?: BuildTrackedSiteUrlOptions
): string {
  return buildTrackedSiteUrl(
    baseUrlOrPath,
    {
      utm_source: 'email',
      utm_medium: 'email',
      utm_campaign: campaign,
    },
    options
  );
}
