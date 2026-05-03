import React from 'react';
import { Package, RefreshCcw } from 'lucide-react';
import { AdminSectionHeader } from './AdminSectionHeader';
import type { AdminOrder } from '../../lib/db/orders';
import { formatEasternDateTime } from '../../lib/dates';
import { getOrderFulfillmentBadgeMeta } from '../../lib/orderFulfillment';

export interface AdminOrdersTabProps {
  searchQuery: string;
  filteredOrders: AdminOrder[];
  onSearchChange: (value: string) => void;
  onSelectOrder: (order: AdminOrder) => void;
  onOpenShipping: (order: AdminOrder) => void;
  onRefresh: () => void;
  loading?: boolean;
  error?: string | null;
}

export function AdminOrdersTab({
  searchQuery,
  filteredOrders,
  onSearchChange,
  onSelectOrder,
  onOpenShipping,
  onRefresh,
  loading,
  error,
}: AdminOrdersTabProps) {
  const getMobileCustomerNameLines = (name: string) => {
    const normalized = name.trim().replace(/\s+/g, ' ');
    const parts = normalized.split(' ').filter(Boolean);
    const shouldSplit = normalized.length >= 14 && parts.length >= 2;
    return shouldSplit
      ? { firstLine: parts[0], secondLine: parts.slice(1).join(' '), split: true }
      : { firstLine: normalized || 'Customer', secondLine: '', split: false };
  };

  return (
    <div className="lux-card p-6">
      <AdminSectionHeader
        title="Orders"
        subtitle="View and manage storefront orders."
      />
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by order ID, customer, or product..."
          className="lux-input ca-admin-order-search sm:max-w-md text-sm"
        />
        <button
          type="button"
          className="lux-button--ghost px-3 py-2 text-[10px] disabled:opacity-60"
          disabled={!!loading}
          onClick={onRefresh}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
              Refreshing...
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </span>
          )}
        </button>
      </div>
      {loading ? (
        <div className="p-8 text-center text-charcoal/70">Loading orders...</div>
      ) : error ? (
        <div className="p-8 text-center text-rose-700">
          Failed to load orders{error ? `: ${error}` : ''}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-8 text-center text-charcoal/60">
          <div>No orders found</div>
        </div>
      ) : (
        <>
          <div className="sm:hidden w-full min-w-0 overflow-x-auto">
            <table className="w-full min-w-full table-fixed divide-y divide-driftwood/50">
              <thead className="bg-linen/70">
                <tr>
                  <th className="w-1/2 px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Customer</th>
                  <th className="w-24 px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Total</th>
                  <th className="w-1/4 px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white/80 divide-y divide-driftwood/40">
                {filteredOrders.map((order) => {
                  const customerName = order.shippingName || order.customerName || 'Customer';
                  const mobileName = getMobileCustomerNameLines(customerName);
                  return (
                  <tr key={order.id}>
                    <td className="min-w-0 px-3 py-4 text-sm text-charcoal whitespace-normal break-words leading-tight">
                      <div className="flex items-center gap-2">
                        {mobileName.split ? (
                          <span className="min-w-0 leading-tight">
                            <span className="block">{mobileName.firstLine}</span>
                            <span className="block">{mobileName.secondLine}</span>
                          </span>
                        ) : (
                          <span className="min-w-0">{customerName}</span>
                        )}
                        {order.isSeen === false && (
                          <span className="inline-flex h-2 w-2 rounded-ui bg-soft-gold ring-1 ring-deep-ocean/20" aria-label="Unseen order" />
                        )}
                      </div>
                    </td>
                    <td className="w-24 px-2 py-4 text-center whitespace-nowrap text-sm tabular-nums text-charcoal">
                      ${(((order.amountTotalCents ?? order.totalCents) || 0) / 100).toFixed(2)}
                    </td>
                    <td className="px-2 py-4 text-center align-middle">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectOrder(order)}
                          className="lux-button--ghost px-3 py-1 text-[10px]"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenShipping(order)}
                          aria-label="Shipping"
                          title="Shipping"
                          className="lux-button--ghost relative inline-flex items-center justify-center px-3 py-1 text-[10px]"
                        >
                          <span className="invisible">View</span>
                          <Package className="pointer-events-none absolute h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          <div className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-driftwood/50">
                <thead className="bg-linen/70">
                  <tr>
                    <th className="px-6 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Order ID</th>
                    <th className="px-6 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Date / Time</th>
                    <th className="px-6 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Customer</th>
                    <th className="px-6 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Total</th>
                    <th className="px-6 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Fulfillment</th>
                    <th className="px-6 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Shipping</th>
                    <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-deep-ocean/70">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white/80 divide-y divide-driftwood/40">
                {filteredOrders.map((order) => {
                  const fulfillmentBadge = getOrderFulfillmentBadgeMeta(order);
                  return (
                  <tr key={order.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-charcoal font-mono">
                      {order.displayOrderId || order.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-charcoal">
                      {formatEasternDateTime(order.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-sm text-charcoal">
                      <div className="flex items-center gap-2">
                        <span>{order.shippingName || order.customerName || 'Customer'}</span>
                        {order.isSeen === false && (
                          <span className="inline-flex h-2 w-2 rounded-ui bg-soft-gold ring-1 ring-deep-ocean/20" aria-label="Unseen order" />
                        )}
                      </div>
                      <div className="text-charcoal/60">{order.customerEmail || 'No email'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-charcoal">
                      ${(((order.amountTotalCents ?? order.totalCents) || 0) / 100).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-charcoal text-center">
                      <span className={`inline-flex items-center rounded-ui px-3 py-1 text-xs font-semibold ${fulfillmentBadge.className}`}>
                        {fulfillmentBadge.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center align-middle whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenShipping(order)}
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                      >
                        Create Label
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectOrder(order)}
                        className="lux-button--ghost px-3 py-1 text-[10px]"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                )})}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
