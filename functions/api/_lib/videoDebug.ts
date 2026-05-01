export type VideoLogScope =
  | 'create-upload'
  | 'direct-upload'
  | 'attach'
  | 'status'
  | 'replace'
  | 'remove'
  | 'debug-beacon';

type VideoLogPayload = Record<string, unknown>;

const MAX_ATTEMPT_ID_LENGTH = 80;
const MAX_TEXT_LOG_LENGTH = 500;

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

export const normalizeUploadAttemptId = (value: unknown): string | null => {
  const raw = normalizeText(value);
  if (!raw) return null;
  const safe = raw.slice(0, MAX_ATTEMPT_ID_LENGTH).replace(/[^a-zA-Z0-9._-]/g, '');
  return safe || null;
};

export const truncateLogText = (value: unknown, maxLength = MAX_TEXT_LOG_LENGTH): string | null => {
  const raw = normalizeText(value);
  if (!raw) return null;
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, maxLength)}...`;
};

const buildPayload = (payload: VideoLogPayload): VideoLogPayload => ({
  at: new Date().toISOString(),
  ...payload,
});

export const logVideoInfo = (scope: VideoLogScope, message: string, payload: VideoLogPayload = {}): void => {
  console.log(`[video][${scope}] ${message}`, buildPayload(payload));
};

export const logVideoWarn = (scope: VideoLogScope, message: string, payload: VideoLogPayload = {}): void => {
  console.warn(`[video][${scope}] ${message}`, buildPayload(payload));
};

export const logVideoError = (scope: VideoLogScope, message: string, payload: VideoLogPayload = {}): void => {
  console.error(`[video][${scope}] ${message}`, buildPayload(payload));
};
