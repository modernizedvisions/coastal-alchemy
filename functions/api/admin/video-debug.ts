import { requireAdmin } from '../_lib/adminAuth';
import {
  logVideoInfo,
  normalizeUploadAttemptId,
  truncateLogText,
} from '../_lib/videoDebug';

type VideoDebugStage =
  | 'validating-file'
  | 'requesting-upload-url'
  | 'create-upload'
  | 'uploading-to-cloudflare'
  | 'direct-upload'
  | 'attaching-to-product'
  | 'attach'
  | 'poll'
  | 'status'
  | 'replace'
  | 'remove'
  | 'error';

type VideoDebugBeaconBody = {
  uploadAttemptId?: string | null;
  productId?: string | null;
  stage?: VideoDebugStage;
  message?: string;
  httpStatus?: number | null;
  responseSnippet?: string | null;
  errorName?: string | null;
  errorStack?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileType?: string | null;
  extras?: Record<string, unknown> | null;
};

type Env = Record<string, unknown>;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const safeNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;

  let body: VideoDebugBeaconBody;
  try {
    body = (await context.request.json()) as VideoDebugBeaconBody;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const uploadAttemptId = normalizeUploadAttemptId(body.uploadAttemptId);
  const stage = truncateLogText(body.stage, 40) || 'error';
  const message = truncateLogText(body.message, 400) || 'No message provided';
  const productId = truncateLogText(body.productId, 80);
  const responseSnippet = truncateLogText(body.responseSnippet, 600);
  const errorName = truncateLogText(body.errorName, 120);
  const errorStack = truncateLogText(body.errorStack, 1200);
  const fileName = truncateLogText(body.fileName, 180);
  const fileType = truncateLogText(body.fileType, 120);
  const fileSize = safeNumber(body.fileSize);
  const httpStatus = safeNumber(body.httpStatus);

  logVideoInfo('debug-beacon', message, {
    uploadAttemptId,
    productId,
    stage,
    httpStatus,
    responseSnippet,
    errorName,
    errorStack,
    fileName,
    fileSize,
    fileType,
    extras: body.extras || null,
    result: 'client-reported-debug-event',
  });

  return json({ ok: true, logged: true });
}

export async function onRequest(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }
  return onRequestPost(context);
}
