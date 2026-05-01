import { requireAdmin } from '../../../../_lib/adminAuth';
import {
  validateOneVideoPerProduct,
  getProductExists,
  validateProductVideoFileInput,
} from '../../../../_lib/productVideoValidation';
import {
  logVideoError,
  logVideoInfo,
  logVideoWarn,
  normalizeUploadAttemptId,
  truncateLogText,
} from '../../../../_lib/videoDebug';
import {
  CloudflareStreamApiError,
  createCloudflareStreamDirectUpload,
  getCloudflareStreamConfig,
  type CloudflareStreamEnv,
} from '../../../../_lib/videoProviders/cloudflareStream';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = CloudflareStreamEnv & {
  DB: D1Database;
};

type CreateUploadBody = {
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  replace?: boolean;
  uploadAttemptId?: string;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestPost(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  const unauthorized = await requireAdmin(context.request, context.env);
  if (unauthorized) return unauthorized;

  const productId = (context.params?.id || '').trim();
  if (!productId) {
    return json({ ok: false, error: 'Product id is required' }, 400);
  }

  let body: CreateUploadBody;
  try {
    body = (await context.request.json()) as CreateUploadBody;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  const uploadAttemptId = normalizeUploadAttemptId(body.uploadAttemptId);
  logVideoInfo('create-upload', 'start', {
    uploadAttemptId,
    productId,
    replace: body.replace === true,
    filename: truncateLogText(body.filename, 120),
    mimeType: truncateLogText(body.mimeType, 80),
    sizeBytes: Number.isFinite(Number(body.sizeBytes)) ? Number(body.sizeBytes) : null,
  });

  const productExists = await getProductExists(context.env.DB, productId);
  if (!productExists) {
    logVideoWarn('create-upload', 'failed: product not found', { uploadAttemptId, productId });
    return json({ ok: false, error: 'Product not found' }, 404);
  }

  let validationError: string | null;
  try {
    validationError = validateProductVideoFileInput(context.env, {
      filename: body.filename,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logVideoError('create-upload', 'failed: stream config missing', {
      uploadAttemptId,
      productId,
      detail: truncateLogText(detail),
    });
    return json({ ok: false, error: 'Cloudflare Stream is not configured', detail }, 500);
  }
  if (validationError) {
    logVideoWarn('create-upload', 'failed: file validation', {
      uploadAttemptId,
      productId,
      validationError,
    });
    return json({ ok: false, error: validationError }, 400);
  }

  const oneVideoCheck = await validateOneVideoPerProduct(context.env.DB, productId, {
    allowExistingForReplace: body.replace === true,
  });
  if (oneVideoCheck.error) {
    logVideoWarn('create-upload', 'failed: one-video rule', {
      uploadAttemptId,
      productId,
      reason: oneVideoCheck.error,
    });
    return json(
      {
        ok: false,
        error: oneVideoCheck.error,
        code: 'VIDEO_ALREADY_EXISTS',
      },
      409
    );
  }

  try {
    const upload = await createCloudflareStreamDirectUpload(context.env, {
      meta: {
        productId,
        uploadAttemptId,
        filename: body.filename || null,
      },
    });
    const config = getCloudflareStreamConfig(context.env);
    logVideoInfo('create-upload', 'success', {
      uploadAttemptId,
      productId,
      providerAssetId: upload.uid,
      maxDurationSeconds: config.maxDurationSeconds,
      maxFileSizeMb: config.maxFileSizeMb,
      uploadExpiryMinutes: config.uploadExpiryMinutes,
    });
    return json({
      ok: true,
      upload: {
        provider: 'cloudflare_stream',
        providerAssetId: upload.uid,
        uploadUrl: upload.uploadUrl,
        expiresAt: upload.expiryAt,
      },
      constraints: {
        allowedExtensions: ['.mp4', '.mov'],
        preferredFormat: 'MP4',
        maxDurationSeconds: config.maxDurationSeconds,
        maxFileSizeMb: config.maxFileSizeMb,
        uploadExpiryMinutes: config.uploadExpiryMinutes,
        allowedOrigins: upload.allowedOrigins,
      },
    });
  } catch (error) {
    if (error instanceof CloudflareStreamApiError) {
      const detail = error.detail || error.message;
      const rawResponseText = truncateLogText(error.responseText, 4000);
      const parsedResponseText = error.responseJson ? JSON.stringify(error.responseJson) : null;
      const responseSnippet = truncateLogText(
        rawResponseText || parsedResponseText || detail,
        1200
      );
      logVideoWarn('create-upload', 'cloudflare-error-text', {
        uploadAttemptId,
        productId,
        endpointUrl: error.url,
        streamHttpStatus: error.status,
        streamStatusText: error.statusText,
        responseText: rawResponseText,
      });
      logVideoWarn('create-upload', 'cloudflare-error-json', {
        uploadAttemptId,
        productId,
        endpointUrl: error.url,
        streamHttpStatus: error.status,
        responseJson: error.responseJson,
        errors: error.responseErrors,
        messages: error.responseMessages,
        sourcePointers: Array.isArray(error.responseErrors)
          ? error.responseErrors
              .map((entry) =>
                entry && typeof entry === 'object' && (entry as { source?: unknown }).source
                  ? ((entry as { source?: { pointer?: string } }).source?.pointer || '').trim()
                  : ''
              )
              .filter(Boolean)
          : [],
      });
      logVideoWarn('create-upload', 'failed: Cloudflare Stream returned error', {
        uploadAttemptId,
        productId,
        streamHttpStatus: error.status,
        detail: truncateLogText(detail),
      });
      return json(
        {
          ok: false,
          stage: 'create-upload',
          upstreamStatus: error.status,
          message: 'Cloudflare Stream rejected the direct upload request.',
          error: 'Cloudflare Stream rejected upload initialization',
          detail,
          responseSnippet,
          uploadAttemptId,
          cloudflareErrors: error.responseErrors || null,
          cloudflareMessages: error.responseMessages || null,
        },
        502
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    logVideoError('create-upload', 'failed: unknown error', {
      uploadAttemptId,
      productId,
      detail: truncateLogText(detail),
    });
    return json({ ok: false, error: 'Failed to create direct upload URL', detail }, 500);
  }
}

export async function onRequest(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  if (context.request.method.toUpperCase() !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }
  return onRequestPost(context);
}
