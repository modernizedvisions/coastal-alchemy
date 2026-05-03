import { sendEmail } from '../../_lib/email';
import { buildTrackedEmailSiteUrl } from '../../_lib/trackedSiteUrl';

type D1PreparedStatement = {
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  DB: D1Database;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_OWNER_TO?: string;
  PUBLIC_SITE_URL?: string;
};

type CreateInvoiceRequest = {
  customer_email?: string;
  customer_name?: string;
  amount_cents?: number;
  amount_dollars?: number;
  currency?: string;
  description?: string;
};

export async function onRequestPost(context: { env: Env; request: Request }): Promise<Response> {
  try {
    const body = (await context.request.json().catch(() => null)) as CreateInvoiceRequest | null;
    if (!body) return jsonResponse({ error: 'Invalid JSON body' }, 400);

    const customerEmail = (body.customer_email || '').trim();
    const customerName = (body.customer_name || '').trim() || null;
    const description = (body.description || '').trim();
    const currency = (body.currency || 'usd').toLowerCase();

    if (!customerEmail || !description) {
      return jsonResponse({ error: 'customer_email and description are required.' }, 400);
    }

    let amountCents: number | null = null;
    if (typeof body.amount_cents === 'number' && isFinite(body.amount_cents)) {
      amountCents = Math.round(body.amount_cents);
    } else if (typeof body.amount_dollars === 'number' && isFinite(body.amount_dollars)) {
      amountCents = Math.round(body.amount_dollars * 100);
    }

    if (!amountCents || amountCents <= 0) {
      return jsonResponse({ error: 'A positive amount is required (amount_cents or amount_dollars).' }, 400);
    }

    await ensureInvoiceSchema(context.env.DB);

    const invoiceId = crypto.randomUUID();
    const now = new Date().toISOString();
    const invoiceUrl = buildInvoiceUrl(context.env.PUBLIC_SITE_URL, invoiceId);

    const insert = context.env.DB.prepare(
      `INSERT INTO custom_invoices (
        id, customer_email, customer_name, amount_cents, currency, description,
        status, stripe_checkout_session_id, stripe_payment_intent_id,
        created_at, sent_at, paid_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'sent', NULL, NULL, ?, ?, NULL);`
    ).bind(
      invoiceId,
      customerEmail,
      customerName,
      amountCents,
      currency,
      description,
      now,
      now
    );

    const result = await insert.run();
    if (!result.success) {
      console.error('[custom-invoices] Failed to insert invoice', result.error);
      return jsonResponse({ error: 'Failed to create invoice' }, 500);
    }

    const emailResult = await sendInvoiceEmail({
      env: context.env,
      to: customerEmail,
      customerName,
      description,
      amountCents,
      currency,
      invoiceUrl,
    });

    if (!emailResult.ok) {
      console.error('[custom-invoices] Failed to send invoice email', emailResult.error);
      return jsonResponse({ error: 'Invoice created but email failed to send.' }, 500);
    }

    return jsonResponse(
      {
        invoiceId,
        status: 'sent',
        invoiceUrl,
      },
      201
    );
  } catch (err) {
    console.error('[custom-invoices] Error creating invoice', err);
    return jsonResponse({ error: 'Server error creating invoice' }, 500);
  }
}

async function ensureInvoiceSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS custom_invoices (
    id TEXT PRIMARY KEY,
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    stripe_checkout_session_id TEXT,
    stripe_payment_intent_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at TEXT,
    paid_at TEXT
  );`).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_custom_invoices_customer_email ON custom_invoices(customer_email);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_custom_invoices_status ON custom_invoices(status);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_custom_invoices_created_at ON custom_invoices(created_at);`).run();
}

function buildInvoiceUrl(siteUrl: string | undefined, invoiceId: string): string {
  const normalizedSiteUrl = (siteUrl || '').replace(/\/+$/, '');
  const baseUrl = normalizedSiteUrl ? `${normalizedSiteUrl}/invoice/${invoiceId}` : `/invoice/${invoiceId}`;
  return buildTrackedEmailSiteUrl(baseUrl, 'custom_order_followup', { siteOrigin: normalizedSiteUrl || null });
}

async function sendInvoiceEmail(args: {
  env: Env;
  to: string;
  customerName: string | null;
  description: string;
  amountCents: number;
  currency: string;
  invoiceUrl: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const amountFormatted = formatAmount(args.amountCents, args.currency);
  const subject = `Invoice from Coastal Alchemy - ${amountFormatted}`;

  const html = `
    <div style="background:#FBF9F5; padding:24px; font-family: Inter, Arial, sans-serif; color:#1F2530; line-height:1.5;">
      <div style="max-width:640px; margin:0 auto;">
        <div style="text-align:center; padding:10px 0 18px;">
          <div style="font-family: Georgia, 'Times New Roman', serif; font-size:22px; letter-spacing:0.18em; color:#243A5E;">COASTAL ALCHEMY</div>
          <div style="margin-top:6px; color:#5B6470; font-size:12px;">Handmade coastal pieces, crafted one at a time.</div>
        </div>
        <div style="background:#ffffff; border:1px solid #E6DFD4; border-radius:12px; padding:24px;">
      <h2 style="margin:0 0 12px; font-family:Georgia, 'Times New Roman', serif; font-size:24px; font-weight:500; color:#1F2530;">Your Coastal Alchemy custom invoice</h2>
      <p style="margin:0 0 8px;">${args.customerName ? `Hi ${escapeHtml(args.customerName)},` : 'Hi,'}</p>
      <p style="margin:0 0 12px; color:#5B6470;">${escapeHtml(args.description)}</p>
      <p style="margin:0 0 16px; font-weight:600; color:#1F2530;">Amount due: ${amountFormatted}</p>
      <p style="margin:0 0 16px;">
        <a href="${args.invoiceUrl}" style="display:inline-block; background:#243A5E; color:#fff; padding:12px 18px; border-radius:999px; text-decoration:none; font-weight:600; font-size:13px; letter-spacing:0.14em; text-transform:uppercase;">
          Pay Invoice
        </a>
      </p>
      <p style="margin:0; font-size:12px; color:#5B6470;">If the button doesn't work, copy and paste this link:<br/>
        <a href="${args.invoiceUrl}" style="color:#243A5E;">${args.invoiceUrl}</a>
      </p>
        </div>
        <div style="text-align:center; color:#5B6470; font-size:12px; line-height:1.6; padding:18px 8px 0;">
          <div style="font-family:Georgia, 'Times New Roman', serif; color:#243A5E; letter-spacing:0.1em;">Coastal Alchemy</div>
          <div>Naples, Florida</div>
          <div>Thank you for supporting handmade work.</div>
        </div>
      </div>
    </div>
  `;

  return sendEmail(
    {
      to: args.to,
      subject,
      html,
      text: `Coastal Alchemy custom order invoice\n\nDescription: ${args.description}\nAmount: ${amountFormatted}\nPay here: ${args.invoiceUrl}\n\nCoastal Alchemy - Naples, Florida\nThank you for supporting handmade work.`,
    },
    args.env
  );
}

function formatAmount(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);
  } catch {
    return `$${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return map[char] || char;
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
