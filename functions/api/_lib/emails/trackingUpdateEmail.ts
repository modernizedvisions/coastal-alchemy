import { sendEmail, type EmailEnv } from '../../../_lib/email';
import { buildTrackedEmailSiteUrl } from '../../../_lib/trackedSiteUrl';
import type { TrackingEmailContext } from '../trackingEmailContext';

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const resolveSiteUrl = (env: EmailEnv): string | null => {
  const raw = trimOrNull(env.PUBLIC_SITE_URL) || trimOrNull(env.VITE_PUBLIC_SITE_URL) || null;
  return raw ? raw.replace(/\/+$/, '') : null;
};

export const buildTrackingUpdateEmailHtml = (
  context: TrackingEmailContext,
  options?: { siteUrl?: string | null }
): string => {
  const greeting = context.customerName ? `Hi ${escapeHtml(context.customerName)},` : 'Hi,';
  const carrierService = [context.carrier, context.service].filter(Boolean).join(' - ');
  const siteUrl = trimOrNull(options?.siteUrl) || null;
  const trackedSiteUrl = siteUrl
    ? buildTrackedEmailSiteUrl(siteUrl, 'customer_email', { siteOrigin: siteUrl })
    : null;
  const items =
    context.items.length > 0
      ? `
      <div style="margin:12px 0 0;">
        <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#5B6470; margin-bottom:6px;">Items</div>
        <ul style="margin:0; padding-left:18px; color:#1F2530; font-size:14px; line-height:1.5;">
          ${context.items
            .slice(0, 6)
            .map((item) => `<li>${escapeHtml(item.name)}${item.quantity > 1 ? ` x${item.quantity}` : ''}</li>`)
            .join('')}
        </ul>
      </div>`
      : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:24px;background:#FBF9F5;font-family:Inter,Arial,sans-serif;color:#1F2530;">
    <div style="max-width:640px;margin:0 auto;">
      <div style="text-align:center;padding:10px 0 18px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:0.18em;color:#243A5E;">COASTAL ALCHEMY</div>
        <div style="margin-top:6px;color:#5B6470;font-size:12px;">Handmade coastal pieces, crafted one at a time.</div>
      </div>
    <div style="background:#ffffff;border:1px solid #E6DFD4;border-radius:12px;padding:22px;">
      <h1 style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500;line-height:1.3;color:#1F2530;">Your Coastal Alchemy order has shipped</h1>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">${greeting}</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5B6470;">Your handmade coastal pieces are on their way.</p>
      <div style="margin:14px 0;padding:12px 14px;border:1px solid #E6DFD4;border-radius:10px;background:#FBF9F5;">
        <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#5B6470;margin-bottom:6px;">Order</div>
        <div style="font-size:14px;font-weight:600;color:#1F2530;">${escapeHtml(context.orderLabel)}</div>
        <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#5B6470;margin:10px 0 6px;">Tracking Number</div>
        <div style="font-size:16px;font-weight:700;color:#1F2530;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(
          context.trackingNumber
        )}</div>
        ${
          carrierService
            ? `<div style="margin-top:10px;font-size:14px;color:#5B6470;">Carrier/Service: ${escapeHtml(carrierService)}</div>`
            : ''
        }
      </div>
      ${items}
      ${
        context.labelUrl
          ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.6;">Label: <a href="${escapeHtml(
              context.labelUrl
            )}" style="color:#243A5E;">View label</a></p>`
          : ''
      }
      ${
        trackedSiteUrl
          ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.6;">Store: <a href="${escapeHtml(
              trackedSiteUrl
            )}" style="color:#243A5E;">${escapeHtml(siteUrl || trackedSiteUrl)}</a></p>`
          : ''
      }
      <p style="margin:16px 0 0;font-size:13px;color:#5B6470;">Any questions? Reply to this email.</p>
    </div>
    <div style="text-align:center;color:#5B6470;font-size:12px;line-height:1.6;padding:18px 8px 0;">
      <div style="font-family:Georgia,'Times New Roman',serif;color:#243A5E;letter-spacing:0.1em;">Coastal Alchemy</div>
      <div>Naples, Florida</div>
      <div>Thank you for supporting handmade work.</div>
    </div>
    </div>
  </body>
</html>`;
};

export const buildTrackingUpdateEmailText = (
  context: TrackingEmailContext,
  options?: { siteUrl?: string | null }
): string => {
  const greeting = context.customerName ? `Hi ${context.customerName},` : 'Hi,';
  const carrierService = [context.carrier, context.service].filter(Boolean).join(' - ');
  const lines: string[] = [
    greeting,
    '',
    'Your Coastal Alchemy order has shipped.',
    `Order: ${context.orderLabel}`,
    `Tracking Number: ${context.trackingNumber}`,
  ];

  if (carrierService) lines.push(`Carrier/Service: ${carrierService}`);
  if (context.items.length > 0) {
    lines.push('', 'Items:');
    context.items.slice(0, 6).forEach((item) => {
      lines.push(`- ${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`);
    });
  }
  if (context.labelUrl) lines.push(`Label: ${context.labelUrl}`);
  const siteUrl = trimOrNull(options?.siteUrl) || null;
  const trackedSiteUrl = siteUrl
    ? buildTrackedEmailSiteUrl(siteUrl, 'customer_email', { siteOrigin: siteUrl })
    : null;
  if (trackedSiteUrl) lines.push(`Store: ${trackedSiteUrl}`);
  lines.push('', 'Any questions? Reply to this email.', 'Coastal Alchemy - Naples, Florida', 'Thank you for supporting handmade work.');
  return lines.join('\n');
};

export const sendTrackingUpdateEmail = async (
  env: EmailEnv,
  context: TrackingEmailContext
): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
  const siteUrl = resolveSiteUrl(env);
  const subject = `Your Coastal Alchemy order has shipped (${context.orderLabel})`;
  const html = buildTrackingUpdateEmailHtml(context, { siteUrl });
  const text = buildTrackingUpdateEmailText(context, { siteUrl });

  return sendEmail(
    {
      to: context.toEmail,
      subject,
      html,
      text,
    },
    env
  );
};
