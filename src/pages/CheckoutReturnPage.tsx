import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BannerMessage } from '../components/BannerMessage';
import { fetchCheckoutSession } from '../lib/publicApi';
import { useCartStore } from '../store/cartStore';
import { mapCheckoutLineItemToAnalyticsItem, trackPurchase } from '../lib/analytics';
import { formatChoiceLabel } from '../lib/categoryOptions';

type SessionStatus = 'loading' | 'success' | 'pending' | 'failed';

const formatCurrency = (amountCents?: number, currency: string = 'usd') => {
  if (amountCents == null) return '';
  const amount = amountCents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
};
const formatShipping = (amountCents?: number, currency: string = 'usd') => {
  if (amountCents == null) return '';
  if (amountCents <= 0) return 'FREE';
  return formatCurrency(amountCents, currency);
};

export function CheckoutReturnPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [status, setStatus] = useState<SessionStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Awaited<ReturnType<typeof fetchCheckoutSession>> | null>(null);
  const clearCart = useCartStore((state) => state.clearCart);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      if (!sessionId) {
        setError('Missing checkout session.');
        setStatus('failed');
        return;
      }

      try {
        const result = await fetchCheckoutSession(sessionId);
        if (isCancelled) return;

        setSession(result);
        const isPaid = !result?.paymentStatus || result.paymentStatus === 'paid';
        if (!isPaid) {
          setStatus('pending');
          return;
        }
        clearCart();
        setStatus('success');
      } catch (err) {
        if (isCancelled) return;
        const message = err instanceof Error ? err.message : 'Unable to verify your payment.';
        setError(message);
        setStatus('failed');
      }
    };

    load();
    return () => {
      isCancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (status !== 'success' || !session) return;
    const purchaseItems = (session.lineItems || [])
      .filter((item) => !item.isShipping)
      .map((item, index) => mapCheckoutLineItemToAnalyticsItem(item, index));

    trackPurchase({
      transactionId: session.id,
      currency: session.currency || 'USD',
      valueCents: session.amountTotal,
      items: purchaseItems,
    });
  }, [session, status]);

  const renderContent = () => {
    if (status === 'loading') {
      return (
        <section className="ca-section min-h-[52vh]">
          <div className="ca-container text-center">
            <div className="ca-eyebrow mb-4">Order Confirmation</div>
            <h1 className="ca-section-title">Loading your order...</h1>
            <p className="ca-copy mx-auto mt-4 max-w-xl">
              We&apos;re confirming your payment and preparing your order details.
            </p>
          </div>
        </section>
      );
    }

    if (status === 'success' && session) {
      return (
        <>
          <header className="ca-page-head">
            <div className="ca-eyebrow mb-4">Order Confirmation</div>
            <h1>Thank you.</h1>
            <p className="ca-copy mx-auto mt-4 max-w-2xl">
              {session.customerEmail
                ? `A confirmation has been sent to ${session.customerEmail}.`
                : 'Your payment was successful.'}
            </p>
          </header>

          <section className="ca-section">
            <div className="ca-container">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)] lg:items-start">
                <article className="border border-[var(--ca-border)] bg-white p-5 sm:p-6">
                  <div className="border-b border-[var(--ca-border)] pb-4">
                    <div className="ca-eyebrow mb-2">Order</div>
                    <h2 className="ca-section-title text-[2rem]">Order Summary</h2>
                  </div>

                  <div className="divide-y divide-[var(--ca-border)]">
                    {session.lineItems && session.lineItems.length > 0 ? (
                      session.lineItems
                        .filter((item) => !item.isShipping)
                        .map((item, idx) => {
                          const isCustomOrderItem =
                            (item.productName || '').toLowerCase().startsWith('custom order');
                          const showQuantity = !item.oneOff && !isCustomOrderItem;
                          const quantity = item.quantity || 1;
                          const selectedOptions = Array.isArray((item as any).selectedOptions)
                            ? (item as any).selectedOptions
                            : [];
                          return (
                            <div key={idx} className="grid grid-cols-[72px_minmax(0,1fr)_auto] gap-4 py-5">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.productName || 'Item'}
                                  className="h-[90px] w-[72px] border border-[var(--ca-border)] bg-white object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="h-[90px] w-[72px] border border-[var(--ca-border)] bg-[var(--ca-paper)]" />
                              )}
                              <div className="min-w-0">
                                <p className="ca-card-title text-[1.2rem] leading-snug">{item.productName}</p>
                                {selectedOptions.length > 0 ? (
                                  <div className="mt-1 space-y-0.5">
                                    {selectedOptions.map((option: any) => (
                                      <p key={`${option.groupId}-${option.optionValue}`} className="ca-copy text-xs leading-5">
                                        {option.groupLabel}: {formatChoiceLabel(option.optionLabel, option.priceIncreaseCents)}
                                      </p>
                                    ))}
                                  </div>
                                ) : item.optionGroupLabel && item.optionValue ? (
                                  <p className="ca-copy mt-1 text-xs leading-5">
                                    {item.optionGroupLabel}: {item.optionValue}
                                  </p>
                                ) : null}
                                {showQuantity && <p className="ca-copy mt-1 text-xs leading-5">Qty: {quantity}</p>}
                              </div>
                              <div className="ca-card-price text-right text-[1.2rem]">
                                {session.currency
                                  ? formatCurrency(item.lineSubtotal ?? item.lineTotal, session.currency)
                                  : item.lineSubtotal ?? item.lineTotal}
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <p className="ca-copy py-5 text-sm">No line items found.</p>
                    )}
                  </div>

                  {session.currency && (
                    <div className="mt-2 space-y-3 border-t border-[var(--ca-border)] pt-5">
                      <div className="flex items-center justify-between text-sm text-[var(--ca-muted)]">
                        <span>Subtotal</span>
                        <span className="ca-card-price text-[1.25rem]">
                          {formatCurrency(session.amountSubtotal ?? 0, session.currency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm text-[var(--ca-muted)]">
                        <span>Shipping</span>
                        <span className="ca-card-price text-[1.25rem]">
                          {formatShipping(session.amountShipping ?? 0, session.currency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm text-[var(--ca-muted)]">
                        <span>Tax</span>
                        <span className="ca-card-price text-[1.25rem]">
                          {formatCurrency(session.amountTax ?? 0, session.currency)}
                        </span>
                      </div>
                      {session.amountDiscount && session.amountDiscount > 0 ? (
                        <div className="flex items-center justify-between text-sm text-[var(--ca-muted)]">
                          <span>Discount</span>
                          <span className="ca-card-price text-[1.25rem]">
                            -{formatCurrency(session.amountDiscount, session.currency)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {session.currency && session.amountTotal != null && (
                    <div className="mt-5 flex items-center justify-between border-t border-[var(--ca-border)] pt-5">
                      <span className="ca-eyebrow">Order Total</span>
                      <span className="ca-card-price text-[1.75rem]">
                        {formatCurrency(session.amountTotal, session.currency)}
                      </span>
                    </div>
                  )}
                </article>

                <aside className="space-y-5">
                  <article className="border border-[var(--ca-border)] bg-white p-5">
                    <div className="ca-eyebrow mb-3">Shipping</div>
                    {session.shipping ? (
                      <div className="ca-copy space-y-1 text-sm">
                        {session.shipping.name && <p className="font-medium text-[var(--ca-ink)]">{session.shipping.name}</p>}
                        {session.shipping.address && (
                          <div>
                            {session.shipping.address.line1 && <p>{session.shipping.address.line1}</p>}
                            {session.shipping.address.line2 && <p>{session.shipping.address.line2}</p>}
                            {(session.shipping.address.city || session.shipping.address.state || session.shipping.address.postal_code) && (
                              <p>
                                {[session.shipping.address.city, session.shipping.address.state, session.shipping.address.postal_code]
                                  .filter(Boolean)
                                  .join(', ')}
                              </p>
                            )}
                            {session.shipping.address.country && <p>{session.shipping.address.country}</p>}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="ca-copy text-sm">No shipping details available.</p>
                    )}
                  </article>

                  <article className="border border-[var(--ca-border)] bg-white p-5">
                    <div className="ca-eyebrow mb-3">Payment</div>
                    <div className="ca-copy space-y-1 text-sm">
                      <p>
                        Payment method:{' '}
                        {session.paymentMethodLabel ||
                          session.paymentMethodType ||
                          'Unknown'}
                      </p>
                      {(session.cardLast4 || session.paymentLast4) && (
                        <p>
                          Card ending in {session.cardLast4 || session.paymentLast4}
                          {session.paymentBrand ? ` (${session.paymentBrand})` : ''}
                        </p>
                      )}
                    </div>
                  </article>

                  <Link to="/shop" className="ca-button ca-button-filled w-full">
                    Continue Shopping
                  </Link>
                </aside>
              </div>
            </div>
          </section>
        </>
      );
    }

    if (status === 'pending') {
      return (
        <section className="ca-section min-h-[52vh]">
          <div className="ca-container max-w-3xl text-center">
            <div className="ca-eyebrow mb-4">Order Confirmation</div>
            <h1 className="ca-section-title">Payment processing.</h1>
            <p className="ca-copy mx-auto mt-4 max-w-xl">
            We&apos;re finalizing your payment. You can safely close this tab; we&apos;ll email you once it completes.
            </p>
            <div className="mt-8 flex justify-center">
              <Link to="/shop" className="ca-button ca-button-filled">
                Back to Shop
              </Link>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="ca-section min-h-[52vh]">
        <div className="ca-container max-w-3xl text-center">
          <div className="ca-eyebrow mb-4">Order Confirmation</div>
          <h1 className="ca-section-title">We couldn&apos;t confirm your payment.</h1>
          <p className="ca-copy mx-auto mt-4 max-w-xl">
          We couldn&apos;t confirm your payment. Please try again or use a different card.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/checkout" className="ca-button ca-button-filled">
              Retry Checkout
            </Link>
            <Link to="/shop" className="ca-button ca-button-ghost">
              Back to Shop
            </Link>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="ca-page min-h-screen">
      <div className="ca-container pt-6">
        {error && <BannerMessage message={error} type="error" />}
      </div>
      {renderContent()}
    </div>
  );
}
