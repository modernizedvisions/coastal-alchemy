import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { loadStripe, type EmbeddedCheckout } from '@stripe/stripe-js';
import { BannerMessage } from '../components/BannerMessage';
import { createEmbeddedCheckoutSession, fetchCategories, fetchProductById } from '../lib/publicApi';
import type { Category, Product } from '../lib/types';
import { useCartStore } from '../store/cartStore';
import { calculateShippingCents } from '../lib/shipping';
import { getCategoryKeys, getDiscountedCents, isPromotionEligible, usePromotions } from '../lib/promotions';
import {
  computeGiftMerchandiseSubtotalCents,
  getQualifiedGiftProductPreview,
  useGiftPromotions,
} from '../lib/giftPromotions';
import type { CheckoutPromoSummary } from '../lib/payments/checkout';

const SESSION_MAX_AGE_MS = 10 * 60 * 1000;
const sessionTimestampKey = (sessionId: string) => `checkout_session_created_at_${sessionId}`;

const isExpiredSessionError = (error: unknown) => {
  const code = (error as any)?.code || (error as any)?.type;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : typeof code === 'string'
      ? code
      : '';
  if (typeof code === 'string' && code.toLowerCase().includes('expired')) return true;
  if (message && /expired/i.test(message)) return true;
  return false;
};

export function CheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cartItems = useCartStore((state) => state.items);
  const stripeContainerRef = useRef<HTMLDivElement | null>(null);

  const [product, setProduct] = useState<Product | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMountingStripe, setIsMountingStripe] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [promoInput, setPromoInput] = useState('');
  const [promoSummary, setPromoSummary] = useState<CheckoutPromoSummary | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
  const { promotion } = usePromotions();
  const { giftPromotion } = useGiftPromotions();

  const productIdFromUrl = searchParams.get('productId');
  const fallbackCartProduct = cartItems[0]?.productId;
  const targetProductId = useMemo(() => productIdFromUrl || fallbackCartProduct || null, [productIdFromUrl, fallbackCartProduct]);

  const clearSessionTimestamp = useCallback((id: string | null) => {
    if (!id || typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(sessionTimestampKey(id));
    } catch (storageError) {
      console.warn('checkout: failed to clear session timestamp', storageError);
    }
  }, []);

  const recordSessionTimestamp = useCallback((id: string) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(sessionTimestampKey(id), String(Date.now()));
    } catch (storageError) {
      console.warn('checkout: failed to store session timestamp', storageError);
    }
  }, []);

  const hasSessionExpired = useCallback(
    (id: string) => {
      if (typeof window === 'undefined') return false;
      try {
        const stored = window.localStorage.getItem(sessionTimestampKey(id));
        if (!stored) return false;
        const createdAt = Number(stored);
        if (!createdAt) return false;
        return Date.now() - createdAt > SESSION_MAX_AGE_MS;
      } catch (storageError) {
        console.warn('checkout: failed to read session timestamp', storageError);
        return false;
      }
    },
    []
  );

  const handleStaleSession = useCallback(
    (reason: string) => {
      console.warn('checkout: session expired; redirecting', { reason, sessionId });
      if (sessionId) {
        clearSessionTimestamp(sessionId);
      }
      setClientSecret(null);
      setSessionId(null);
      setError('Your checkout session expired. Please start again.');
      navigate('/shop', { replace: true });
    },
    [clearSessionTimestamp, navigate, sessionId]
  );

  const buildSessionItems = useCallback(() => {
    if (cartItems.length) {
      return cartItems.map((ci) => ({
        productId: ci.productId,
        quantity: ci.quantity,
        optionGroupLabel: ci.optionGroupLabel ?? null,
        optionValue: ci.optionValue ?? null,
        selectedOptions: ci.selectedOptions ?? null,
      }));
    }
    if (targetProductId) {
      return [{ productId: targetProductId, quantity: 1 }];
    }
    return [];
  }, [cartItems, targetProductId]);

  const refreshCheckoutSession = useCallback(
    async (promoCode?: string) => {
      const sessionItems = buildSessionItems();
      if (!sessionItems.length) {
        throw new Error('No products in cart.');
      }
      const session = await createEmbeddedCheckoutSession(sessionItems, promoCode);
      setClientSecret(session.clientSecret);
      setSessionId(session.sessionId);
      recordSessionTimestamp(session.sessionId);
      setPromoSummary(session.promo ?? null);
      setPromoError(null);
    },
    [buildSessionItems, recordSessionTimestamp]
  );

  const handleApplyPromo = useCallback(async () => {
    const code = promoInput.trim();
    setPromoError(null);
    setIsApplyingPromo(true);
    try {
      await refreshCheckoutSession(code || undefined);
      if (code) {
        setPromoInput(code);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to apply promo code.';
      setPromoError(message);
    } finally {
      setIsApplyingPromo(false);
    }
  }, [promoInput, refreshCheckoutSession]);

  const handleClearPromo = useCallback(async () => {
    setPromoInput('');
    setPromoError(null);
    setIsApplyingPromo(true);
    try {
      await refreshCheckoutSession(undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to remove promo code.';
      setPromoError(message);
    } finally {
      setIsApplyingPromo(false);
    }
  }, [refreshCheckoutSession]);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      if (!publishableKey) {
        console.error('VITE_STRIPE_PUBLISHABLE_KEY is missing on the client');
        setError('Stripe is not configured');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        if (cartItems.length === 0 && !targetProductId) {
          throw new Error('No products in cart.');
        }

        let displayProduct: Product | null = null;
        if (targetProductId) {
          console.log('checkout: targetProductId', targetProductId);
          const found = await fetchProductById(targetProductId);
          console.log('checkout: fetched product', found);

          if (!found) {
            throw new Error('Product not found.');
          }
          if (found.isSold) {
            throw new Error('This piece has already been sold.');
          }
          if (!found.priceCents) {
            throw new Error('This product is missing pricing details.');
          }
          if (!found.stripePriceId) {
            throw new Error('This product has no Stripe price configured.');
          }
          displayProduct = found;
        } else {
          // No single target product; use first cart item for display only.
          displayProduct = cartItems[0] as any;
        }

        if (isCancelled) return;
        setProduct(displayProduct);

        const sessionItems = cartItems.length
          ? cartItems.map((ci) => ({
              productId: ci.productId,
              quantity: ci.quantity,
              optionGroupLabel: ci.optionGroupLabel ?? null,
              optionValue: ci.optionValue ?? null,
              selectedOptions: ci.selectedOptions ?? null,
            }))
          : targetProductId
          ? [{ productId: targetProductId, quantity: 1 }]
          : [];

        const session = await createEmbeddedCheckoutSession(sessionItems);
        console.log('checkout: session response', session);
        if (isCancelled) return;
        setClientSecret(session.clientSecret);
        setSessionId(session.sessionId);
        recordSessionTimestamp(session.sessionId);
        setPromoSummary(session.promo ?? null);
        setPromoError(null);
      } catch (err) {
        if (isCancelled) return;
        const message = err instanceof Error ? err.message : 'Unable to start checkout.';
        setError(message);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    load();
    return () => {
      isCancelled = true;
    };
  }, [cartItems, publishableKey, recordSessionTimestamp, targetProductId]);

  useEffect(() => {
    if (!clientSecret) return;
    if (!publishableKey) return;

    let checkout: EmbeddedCheckout | null = null;
    let isCancelled = false;

    const mount = async () => {
      try {
        setIsMountingStripe(true);
        const stripe = await loadStripe(publishableKey);
        if (!stripe) throw new Error('Failed to load Stripe.');

        if (isCancelled) return;

        checkout = await stripe.initEmbeddedCheckout({ clientSecret });
        checkout.mount('#embedded-checkout');
      } catch (err) {
        if (isCancelled) return;
        const message = err instanceof Error ? err.message : 'Unable to load checkout.';
        if (isExpiredSessionError(err)) {
          handleStaleSession('stripe-reported-expired');
          return;
        }
        setError(message);
      } finally {
        if (!isCancelled) setIsMountingStripe(false);
      }
    };

    mount();
    return () => {
      isCancelled = true;
      checkout?.destroy();
    };
  }, [clientSecret, handleStaleSession, publishableKey]);

  useEffect(() => {
    if (!sessionId) return;

    const checkExpiry = () => {
      if (hasSessionExpired(sessionId)) {
        handleStaleSession('age-limit');
      }
    };

    checkExpiry();
    const intervalId = window.setInterval(checkExpiry, 15000);
    return () => window.clearInterval(intervalId);
  }, [sessionId, hasSessionExpired, handleStaleSession]);

  useEffect(() => {
    const load = async () => {
      const data = await fetchCategories();
      setCategories(data);
    };
    void load();
  }, []);

  const previewItems = useMemo(() => {
    if (cartItems.length) {
        return cartItems.map((item) => ({
          id: item.productId,
          name: item.name,
          collection: (item as any).collection,
          description: (item as any).description,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          priceCents: item.priceCents,
          category: item.category ?? null,
          categories: item.categories ?? null,
          optionGroupLabel: item.optionGroupLabel ?? null,
          optionValue: item.optionValue ?? null,
          selectedOptions: item.selectedOptions ?? null,
        }));
    }
    if (product) {
      return [
        {
          id: product.id ?? product.stripeProductId ?? 'product',
          name: product.name,
          collection: product.collection || product.type,
          description: product.description,
          imageUrl: (product as any).thumbnailUrl || (product as any).imageUrl || null,
          quantity: 1,
          priceCents: product.priceCents ?? 0,
          category: product.category ?? null,
          categories: product.categories ?? null,
          optionGroupLabel: null,
          optionValue: null,
          selectedOptions: null,
        },
      ];
    }
    return [];
  }, [cartItems, product]);

  const previewItemsWithPricing = useMemo(() => {
    return previewItems.map((item) => {
      const autoPercent = isPromotionEligible(promotion, item) ? promotion?.percentOff || 0 : 0;
      const codePercent =
        promoSummary?.codePercentOff && promoSummary.codePercentOff > 0
          ? promoSummary.codeScope === 'global'
            ? promoSummary.codePercentOff
            : promoSummary.codeScope === 'categories'
            ? getCategoryKeys(item).some((key) => promoSummary.codeCategorySlugs.includes(key))
              ? promoSummary.codePercentOff
              : 0
            : 0
          : 0;
      const appliedPercent = Math.max(autoPercent, codePercent);
      const unitPrice = getDiscountedCents(item.priceCents, appliedPercent);
      return {
        ...item,
        appliedPercent,
        unitPrice,
        lineTotal: unitPrice * (item.quantity || 1),
      };
    });
  }, [previewItems, promoSummary, promotion]);

  const subtotalCents = useMemo(
    () => previewItemsWithPricing.reduce((sum, item) => sum + item.lineTotal, 0),
    [previewItemsWithPricing]
  );

  const qualifyingSubtotalCents = useMemo(
    () =>
      computeGiftMerchandiseSubtotalCents(
        previewItems.map((item) => ({ priceCents: item.priceCents, quantity: item.quantity }))
      ),
    [previewItems]
  );
  const qualifiedGiftProduct = useMemo(
    () => getQualifiedGiftProductPreview(giftPromotion, qualifyingSubtotalCents),
    [giftPromotion, qualifyingSubtotalCents]
  );

  const shippingItems = useMemo(() => {
    if (cartItems.length) return cartItems;
    if (product) {
      return [
        {
          category: product.category ?? null,
          categories: product.categories ?? null,
          shippingOverrideEnabled: product.shippingOverrideEnabled ?? false,
          shippingOverrideAmountCents: product.shippingOverrideAmountCents ?? null,
        },
      ];
    }
    return [];
  }, [cartItems, product]);

  const shippingCents = calculateShippingCents(shippingItems, categories);
  const effectiveShippingCents = promoSummary?.freeShippingApplied ? 0 : shippingCents;
  const totalCents = (subtotalCents || 0) + effectiveShippingCents;

  const formatMoney = (cents: number) => `$${((cents ?? 0) / 100).toFixed(2)}`;
  const formatShipping = (cents: number) => (cents <= 0 ? 'FREE' : formatMoney(cents));

  if (loading) {
    return (
      <div className="ca-page flex min-h-screen items-center justify-center px-4">
        <p className="ca-copy">Preparing your checkout...</p>
      </div>
    );
  }

  return (
    <div className="ca-page min-h-screen">
      <header className="ca-page-head">
        <div className="ca-eyebrow mb-4">Checkout</div>
        <h1>Almost there.</h1>
        <p className="ca-copy mx-auto mt-4 max-w-2xl">
          Review your pieces, share a few details, and we'll take it from here.
        </p>
      </header>

      <section className="ca-section">
      <div className="ca-container">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="ca-eyebrow">Coastal Alchemy</p>
            <h2 className="ca-section-title mt-2">Secure Checkout</h2>
          </div>
          <button
            onClick={() => navigate('/shop')}
            className="ca-button ca-button-ghost"
          >
            Back to Shop
          </button>
        </div>

        {error && <BannerMessage message={error} type="error" />}

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div className="order-2 lg:order-2">
            <div className="ca-checkout-summary space-y-5">
              <div>
                <p className="ca-eyebrow mb-2">Order Summary</p>
                <h2 className="ca-card-title">Items in your cart</h2>
              </div>

              <div>
                {previewItems.length === 0 && (
                  <div className="ca-copy text-sm">No items to display.</div>
                )}
                {previewItemsWithPricing.map((item) => (
                  <div key={`${item.id}-${item.name}`} className="ca-line">
                    {item.imageUrl ? (
                      <div className="ca-line-media">
                        <img src={item.imageUrl} alt={item.name || 'Item'} loading="lazy" />
                      </div>
                    ) : (
                      <div className="ca-line-media" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="ca-card-title truncate text-[1rem]">{item.name || 'Item'}</p>
                      </div>
                      {item.collection && (
                        <p className="ca-card-meta">{item.collection}</p>
                      )}
                      {Array.isArray((item as any).selectedOptions) && (item as any).selectedOptions.length > 0 ? (
                        <div className="mt-1 space-y-0.5">
                          {(item as any).selectedOptions.map((option: any) => (
                            <p key={`${option.groupId}-${option.optionValue}`} className="ca-copy text-xs">
                              {option.groupLabel}: {option.optionLabel}
                            </p>
                          ))}
                        </div>
                      ) : item.optionGroupLabel && item.optionValue && (
                        <p className="ca-copy mt-1 text-xs">
                          {item.optionGroupLabel}: {item.optionValue}
                        </p>
                      )}
                      {item.description && (
                        <p className="ca-copy line-clamp-2 text-xs">{item.description}</p>
                      )}
                      <div className="ca-copy mt-1 flex items-baseline gap-2 text-xs">
                        <span>Qty: {item.quantity || 1}</span>
                        {item.appliedPercent > 0 ? (
                          <>
                            <span className="line-through">{formatMoney(item.priceCents)}</span>
                            <span className="text-[var(--ca-ink)]">{formatMoney(item.unitPrice)}</span>
                          </>
                        ) : (
                          <span>{formatMoney(item.priceCents)}</span>
                        )}
                      </div>
                    </div>
                    <div className="ca-card-price text-[0.95rem]">{formatMoney(item.lineTotal)}</div>
                  </div>
                ))}
                {qualifiedGiftProduct && (
                  <div className="ca-line">
                    {qualifiedGiftProduct.imageUrl ? (
                      <div className="ca-line-media">
                        <img src={qualifiedGiftProduct.imageUrl} alt={qualifiedGiftProduct.name || 'Gift item'} loading="lazy" />
                      </div>
                    ) : (
                      <div className="ca-line-media" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="ca-card-title truncate text-[1rem]">
                          {qualifiedGiftProduct.name || 'Gift Item'}
                        </p>
                        <span className="text-sm font-semibold text-emerald-700">FREE</span>
                      </div>
                      {qualifiedGiftProduct.description ? (
                        <p className="ca-copy line-clamp-2 text-xs">{qualifiedGiftProduct.description}</p>
                      ) : null}
                      <div className="ca-copy mt-1 flex items-baseline gap-2 text-xs">
                        <span>Qty: 1</span>
                        <span>$0.00</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--ca-border)] pt-5 space-y-3 ca-form-skin">
                <div className="flex items-center justify-between">
                  <label className="ca-eyebrow">Promo Code</label>
                  {promoSummary?.code ? (
                    <button
                      type="button"
                      onClick={handleClearPromo}
                      className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--ca-navy)] hover:underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    placeholder="Enter promo code"
                    className="lux-input flex-1 capitalize"
                  />
                  <button
                    type="button"
                    onClick={handleApplyPromo}
                    disabled={isApplyingPromo || !promoInput.trim()}
                    className="ca-button ca-button-ghost px-4 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isApplyingPromo ? 'Applying...' : 'Apply'}
                  </button>
                </div>
                {promoSummary?.code ? (
                  <div className="ca-copy text-xs">
                    Applied: <span className="font-medium text-[var(--ca-ink)]">{promoSummary.code.toUpperCase()}</span>
                    {promoSummary.source ? (
                      <span> - {promoSummary.source}</span>
                    ) : null}
                  </div>
                ) : null}
                {promoError ? (
                  <div className="text-xs text-red-600">{promoError}</div>
                ) : null}
              </div>

              <div className="border-t border-[var(--ca-border)] pt-5 space-y-2 text-sm">
                <div className="flex justify-between text-[var(--ca-muted)]">
                  <span>Subtotal</span>
                  <span className="font-medium text-[var(--ca-ink)]">{formatMoney(subtotalCents || 0)}</span>
                </div>
                <div className="flex justify-between text-[var(--ca-muted)]">
                  <span>Shipping</span>
                  <span className="font-medium text-[var(--ca-ink)]">{formatShipping(effectiveShippingCents)}</span>
                </div>
                <div className="flex justify-between text-xs text-[var(--ca-muted)]">
                  <span>Tax</span>
                  <span>Calculated at checkout</span>
                </div>
                {promoSummary?.percentOff ? (
                  <div className="flex justify-between text-[var(--ca-muted)]">
                    <span>Promotion</span>
                    <span className="font-medium">{promoSummary.percentOff}% off</span>
                  </div>
                ) : null}
                {promoSummary?.freeShippingApplied ? (
                  <div className="flex justify-between text-[var(--ca-muted)]">
                    <span>Free shipping</span>
                    <span className="font-medium">Applied</span>
                  </div>
                ) : null}
                <div className="flex justify-between pt-3 border-t border-[var(--ca-border)] font-serif text-xl text-[var(--ca-ink)]">
                  <span>Total</span>
                  <span>{formatMoney(totalCents)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-1">
            <div className="border border-[var(--ca-border)] bg-white p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="ca-eyebrow mb-2">Contact & Payment</p>
                  <h2 className="ca-card-title">Secure details</h2>
                </div>
                {isMountingStripe && <p className="ca-copy text-sm">Loading Stripe...</p>}
              </div>
              <div
                id="embedded-checkout"
                ref={stripeContainerRef}
                className="min-h-[360px] border border-dashed border-[var(--ca-border)] bg-white"
              />
              <p className="ca-copy text-xs">
                Secure payment is handled by Stripe. You’ll receive a confirmation as soon as the purchase completes.
              </p>
            </div>
          </div>
        </div>

        {!product && !error && (
          <div className="mt-6 border border-[var(--ca-border)] bg-white p-6 text-center">
            <p className="ca-copy">Select a product to begin checkout.</p>
            <Link to="/shop" className="ca-button ca-button-ghost mt-3 inline-flex">
              Back to Shop
            </Link>
          </div>
        )}
      </div>
      </section>
    </div>
  );
}
