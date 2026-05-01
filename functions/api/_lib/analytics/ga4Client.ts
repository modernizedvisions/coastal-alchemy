import type { AnalyticsDateRange } from './types';

type Ga4Metric = { name: string };
type Ga4Dimension = { name: string };

type Ga4RunReportRequest = {
  dateRanges: AnalyticsDateRange[];
  metrics: Ga4Metric[];
  dimensions?: Ga4Dimension[];
  dimensionFilter?: Record<string, unknown>;
  metricFilter?: Record<string, unknown>;
  limit?: string;
  orderBys?: Array<Record<string, unknown>>;
  keepEmptyRows?: boolean;
};

type Ga4RunReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
  rowCount?: number;
  metadata?: Record<string, unknown>;
};

type Ga4CheckCompatibilityRequest = {
  dimensions?: Ga4Dimension[];
  metrics?: Ga4Metric[];
  compatibilityFilter?: 'COMPATIBLE' | 'INCOMPATIBLE';
};

type Ga4Compatibility = {
  compatibility?: string;
  dimensionMetadata?: { apiName?: string };
  metricMetadata?: { apiName?: string };
};

type Ga4CheckCompatibilityResponse = {
  dimensionCompatibilities?: Ga4Compatibility[];
  metricCompatibilities?: Ga4Compatibility[];
};

export type Ga4CompatibilityResult = {
  incompatibleDimensions: string[];
  incompatibleMetrics: string[];
};

export type AnalyticsEnv = {
  GA4_PROPERTY_ID?: string;
  GA4_GCP_CLIENT_EMAIL?: string;
  GA4_GCP_PRIVATE_KEY?: string;
  GA4_GCP_PROJECT_ID?: string;
};

const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const GA4_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GA4_API_BASE = 'https://analyticsdata.googleapis.com/v1beta';
const DEFAULT_PROPERTY_ID = '529430584';

let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

const encoder = new TextEncoder();

const base64UrlEncode = (value: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < value.length; i += 1) {
    binary += String.fromCharCode(value[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const stringToBase64Url = (value: string): string => base64UrlEncode(encoder.encode(value));

const decodeBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const parsePrivateKeyPem = (pemOrEscaped: string): ArrayBuffer => {
  const normalized = pemOrEscaped.replace(/\\n/g, '\n').trim();
  const body = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  if (!body) {
    throw new Error('GA4 private key is empty after normalization');
  }
  return decodeBase64(body).buffer;
};

const getPropertyId = (env: AnalyticsEnv): string => {
  const raw = (env.GA4_PROPERTY_ID || '').trim();
  return raw || DEFAULT_PROPERTY_ID;
};

const getCredentialConfig = (env: AnalyticsEnv) => {
  const clientEmail = (env.GA4_GCP_CLIENT_EMAIL || '').trim();
  const privateKey = (env.GA4_GCP_PRIVATE_KEY || '').trim();
  if (!clientEmail || !privateKey) {
    throw new Error('GA4 service-account env vars are missing');
  }
  return { clientEmail, privateKey };
};

const createSignedJwt = async (clientEmail: string, privateKeyPem: string): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: GA4_SCOPE,
    aud: GA4_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = stringToBase64Url(JSON.stringify(header));
  const encodedPayload = stringToBase64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    parsePrivateKeyPem(privateKeyPem),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsignedToken));
  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  return `${unsignedToken}.${encodedSignature}`;
};

const fetchAccessToken = async (env: AnalyticsEnv): Promise<{ accessToken: string; expiresAtMs: number }> => {
  const { clientEmail, privateKey } = getCredentialConfig(env);
  const assertion = await createSignedJwt(clientEmail, privateKey);

  const body = new URLSearchParams();
  body.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  body.set('assertion', assertion);

  const response = await fetch(GA4_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = parsed?.error_description || parsed?.error || text || `status ${response.status}`;
    throw new Error(`GA4 OAuth token exchange failed: ${detail}`);
  }

  const accessToken = typeof parsed?.access_token === 'string' ? parsed.access_token : '';
  const expiresIn = Number(parsed?.expires_in || 3600);
  if (!accessToken) {
    throw new Error('GA4 OAuth token response did not include access_token');
  }
  const expiresAtMs = Date.now() + Math.max(60, expiresIn - 60) * 1000;
  return { accessToken, expiresAtMs };
};

const getAccessToken = async (env: AnalyticsEnv): Promise<string> => {
  if (cachedToken && cachedToken.expiresAtMs > Date.now()) {
    return cachedToken.accessToken;
  }
  const nextToken = await fetchAccessToken(env);
  cachedToken = nextToken;
  return nextToken.accessToken;
};

export const runGa4Report = async (
  env: AnalyticsEnv,
  request: Ga4RunReportRequest
): Promise<Ga4RunReportResponse> => {
  const propertyId = getPropertyId(env);
  const accessToken = await getAccessToken(env);
  const endpoint = `${GA4_API_BASE}/properties/${encodeURIComponent(propertyId)}:runReport`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail =
      parsed?.error?.message ||
      parsed?.error ||
      text ||
      `status ${response.status}`;
    throw new Error(`GA4 runReport failed: ${detail}`);
  }

  return parsed || {};
};

const parseApiErrorDetail = (text: string, parsed: any, status: number): string =>
  parsed?.error?.message || parsed?.error || text || `status ${status}`;

export const checkGa4ReportCompatibility = async (
  env: AnalyticsEnv,
  request: Ga4CheckCompatibilityRequest
): Promise<Ga4CompatibilityResult> => {
  const propertyId = getPropertyId(env);
  const accessToken = await getAccessToken(env);
  const endpoint = `${GA4_API_BASE}/properties/${encodeURIComponent(propertyId)}:checkCompatibility`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = parseApiErrorDetail(text, parsed, response.status);
    throw new Error(`GA4 checkCompatibility failed: ${detail}`);
  }

  const payload = (parsed || {}) as Ga4CheckCompatibilityResponse;
  const incompatibleDimensions = (payload.dimensionCompatibilities || [])
    .filter((entry) => (entry.compatibility || '').toUpperCase() === 'INCOMPATIBLE')
    .map((entry) => entry.dimensionMetadata?.apiName || '')
    .filter((value) => value.trim().length > 0);
  const incompatibleMetrics = (payload.metricCompatibilities || [])
    .filter((entry) => (entry.compatibility || '').toUpperCase() === 'INCOMPATIBLE')
    .map((entry) => entry.metricMetadata?.apiName || '')
    .filter((value) => value.trim().length > 0);

  return {
    incompatibleDimensions,
    incompatibleMetrics,
  };
};

export const safeNumber = (raw: string | undefined): number => {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return value;
};

export const makeStorefrontPageFilter = (fieldName = 'pagePath'): Record<string, unknown> => ({
  andGroup: {
    expressions: [
      {
        notExpression: {
          filter: {
            fieldName,
            stringFilter: {
              matchType: 'BEGINS_WITH',
              value: '/admin',
              caseSensitive: false,
            },
          },
        },
      },
      {
        notExpression: {
          filter: {
            fieldName,
            stringFilter: {
              matchType: 'BEGINS_WITH',
              value: '/api/admin',
              caseSensitive: false,
            },
          },
        },
      },
    ],
  },
});
