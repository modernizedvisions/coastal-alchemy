export type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results?: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
};

export type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

export const FULFILLMENT_STATUS_VALUES = [
  'new_order',
  'label_needed',
  'label_created',
  'shipped',
] as const;

export type OrderFulfillmentStatus = (typeof FULFILLMENT_STATUS_VALUES)[number];
export type OrderManualFulfillmentOverride = OrderFulfillmentStatus | null;

type FulfillmentFields = {
  manual_fulfillment_override?: string | null;
  fulfillment_shipped_at?: string | null;
  shipping_label_created_at?: string | null;
  viewed_at?: string | null;
  seen_at?: string | null;
  is_seen?: number | null;
  has_shipping_label_evidence?: number | boolean | null;
};

export const isOrderFulfillmentStatus = (value: unknown): value is OrderFulfillmentStatus =>
  typeof value === 'string' && (FULFILLMENT_STATUS_VALUES as readonly string[]).includes(value);

export const normalizeManualFulfillmentOverride = (
  value: unknown
): OrderManualFulfillmentOverride | undefined => {
  if (value === null || value === undefined || value === '' || value === 'automatic') return null;
  if (isOrderFulfillmentStatus(value)) return value;
  return undefined;
};

const hasViewedEvidence = (fields: FulfillmentFields): boolean => {
  if (typeof fields.viewed_at === 'string' && fields.viewed_at.trim()) return true;
  if (typeof fields.seen_at === 'string' && fields.seen_at.trim()) return true;
  return fields.is_seen === 1;
};

const hasShippingLabelEvidence = (fields: FulfillmentFields): boolean => {
  if (typeof fields.shipping_label_created_at === 'string' && fields.shipping_label_created_at.trim()) return true;
  return fields.has_shipping_label_evidence === 1 || fields.has_shipping_label_evidence === true;
};

export const resolveOrderViewedAt = (fields: FulfillmentFields): string | null => {
  if (typeof fields.viewed_at === 'string' && fields.viewed_at.trim()) return fields.viewed_at;
  if (typeof fields.seen_at === 'string' && fields.seen_at.trim()) return fields.seen_at;
  return null;
};

export const getOrderFulfillmentStatus = (fields: FulfillmentFields): OrderFulfillmentStatus => {
  const manual = normalizeManualFulfillmentOverride(fields.manual_fulfillment_override);
  if (manual) return manual;
  if (typeof fields.fulfillment_shipped_at === 'string' && fields.fulfillment_shipped_at.trim()) return 'shipped';
  if (hasShippingLabelEvidence(fields)) return 'label_created';
  if (hasViewedEvidence(fields)) return 'label_needed';
  return 'new_order';
};

export async function ensureOrdersFulfillmentSchema(db: D1Database): Promise<void> {
  const columns = await db.prepare(`PRAGMA table_info(orders);`).all<{ name: string }>();
  const names = new Set((columns.results || []).map((c) => c.name));
  if (!names.has('is_seen')) {
    await db.prepare(`ALTER TABLE orders ADD COLUMN is_seen INTEGER NOT NULL DEFAULT 0;`).run();
  }
  if (!names.has('seen_at')) {
    await db.prepare(`ALTER TABLE orders ADD COLUMN seen_at TEXT;`).run();
  }
  if (!names.has('viewed_at')) {
    await db.prepare(`ALTER TABLE orders ADD COLUMN viewed_at TEXT;`).run();
  }
  if (!names.has('manual_fulfillment_override')) {
    await db
      .prepare(
        `ALTER TABLE orders ADD COLUMN manual_fulfillment_override TEXT CHECK (
          manual_fulfillment_override IN ('new_order', 'label_needed', 'label_created', 'shipped')
        );`
      )
      .run();
  }
  if (!names.has('shipping_label_created_at')) {
    await db.prepare(`ALTER TABLE orders ADD COLUMN shipping_label_created_at TEXT;`).run();
  }
  if (!names.has('fulfillment_shipped_at')) {
    await db.prepare(`ALTER TABLE orders ADD COLUMN fulfillment_shipped_at TEXT;`).run();
  }

  await db
    .prepare(
      `UPDATE orders
       SET viewed_at = COALESCE(viewed_at, seen_at)
       WHERE viewed_at IS NULL
         AND seen_at IS NOT NULL;`
    )
    .run();
}

export async function markOrderViewed(db: D1Database, orderId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE orders
       SET is_seen = 1,
           seen_at = COALESCE(seen_at, ?),
           viewed_at = COALESCE(viewed_at, ?)
       WHERE id = ?;`
    )
    .bind(now, now, orderId)
    .run();
}

export async function markOrderShippingLabelCreated(
  db: D1Database,
  orderId: string,
  createdAtIso?: string
): Promise<void> {
  const timestamp = createdAtIso || new Date().toISOString();
  await db
    .prepare(
      `UPDATE orders
       SET shipping_label_created_at = COALESCE(shipping_label_created_at, ?)
       WHERE id = ?;`
    )
    .bind(timestamp, orderId)
    .run();
}

export async function countUnviewedOrders(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) as count
       FROM orders
       WHERE viewed_at IS NULL
         AND seen_at IS NULL
         AND (is_seen IS NULL OR is_seen = 0);`
    )
    .first<{ count: number }>();
  return row?.count ?? 0;
}
