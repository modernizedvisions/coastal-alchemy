import { useEffect, useRef, useState } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';
import { useUIStore } from '../../store/uiStore';
import { useNavigate } from 'react-router-dom';
import { calculateShippingCents } from '../../lib/shipping';
import { fetchCategories } from '../../lib/publicApi';
import type { Category } from '../../lib/types';
import { getDiscountedCents, isPromotionEligible, usePromotions } from '../../lib/promotions';
import {
  computeGiftMerchandiseSubtotalCents,
  getQualifiedGiftProductPreview,
  useGiftPromotions,
} from '../../lib/giftPromotions';
import { mapCartItemToAnalyticsItem, trackBeginCheckout, trackViewCart } from '../../lib/analytics';

export function CartDrawer() {
  const isOpen = useUIStore((state) => state.isCartDrawerOpen);
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);
  const items = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const navigate = useNavigate();
  const { promotion } = usePromotions();
  const { giftPromotion } = useGiftPromotions();

  const [isVisible, setIsVisible] = useState(isOpen);
  const [isActive, setIsActive] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const wasOpenRef = useRef(false);
  const checkoutTrackedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      const raf = requestAnimationFrame(() => setIsActive(true));
      return () => cancelAnimationFrame(raf);
    }
    if (isVisible) {
      setIsActive(false);
      const timeout = window.setTimeout(() => setIsVisible(false), 280);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [isOpen, isVisible]);

  useEffect(() => {
    if (!isOpen) return;
    if (categories.length) return;
    const load = async () => {
      const data = await fetchCategories();
      setCategories(data);
    };
    void load();
  }, [isOpen, categories.length]);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      checkoutTrackedRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;

    trackViewCart(items.map((item) => mapCartItemToAnalyticsItem(item)));
    wasOpenRef.current = true;
  }, [isOpen, items]);

  if (!isVisible) return null;

  const qualifyingSubtotalCents = computeGiftMerchandiseSubtotalCents(items);
  const qualifiedGiftProduct = getQualifiedGiftProductPreview(giftPromotion, qualifyingSubtotalCents);

  const effectiveSubtotal = items.reduce((sum, item) => {
    const basePrice = item.priceCents || 0;
    const isEligible = isPromotionEligible(promotion, item);
    const effectivePrice =
      isEligible && promotion ? getDiscountedCents(basePrice, promotion.percentOff) : basePrice;
    return sum + effectivePrice * (item.quantity || 1);
  }, 0);
  const shippingCents = calculateShippingCents(items, categories);
  const totalCents = effectiveSubtotal + shippingCents;
  const formatShipping = (cents: number) => (cents <= 0 ? 'FREE' : `$${(cents / 100).toFixed(2)}`);
  const formatMoney = (cents: number) => `$${((cents || 0) / 100).toFixed(2)}`;

  const handleCheckout = () => {
    if (!items.length) return;
    if (!checkoutTrackedRef.current) {
      trackBeginCheckout(items.map((item) => mapCartItemToAnalyticsItem(item)));
      checkoutTrackedRef.current = true;
    }
    setCartDrawerOpen(false);
    const productId = items[0].productId;
    navigate(`/checkout?productId=${encodeURIComponent(productId)}`);
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-charcoal/60 backdrop-blur-sm z-40 drawer-overlay motion-safe-only ${isActive ? 'is-open' : 'is-closed'}`}
        onClick={() => setCartDrawerOpen(false)}
      />
      <div className={`fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col drawer-panel motion-safe-only ${isActive ? 'is-open' : 'is-closed'}`}>
        <div className="flex items-center justify-between border-b border-[var(--ca-border)] bg-white px-5 py-5">
          <h2 className="ca-eyebrow">Your Cart</h2>
          <button
            onClick={() => setCartDrawerOpen(false)}
            className="inline-flex h-10 w-10 items-center justify-center border border-[var(--ca-border)] text-[var(--ca-ink)] transition hover:bg-[var(--ca-ink)] hover:text-white"
            aria-label="Close cart"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          {items.length === 0 ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
              <p className="ca-card-title">Your cart is empty.</p>
              <p className="ca-copy mt-2 text-sm">Add a shell piece from the shop to begin.</p>
              <button
                type="button"
                onClick={() => {
                  setCartDrawerOpen(false);
                  navigate('/shop');
                }}
                className="ca-button ca-button-filled mt-6"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <>
            {items.map((item) => {
              const itemKey = `${item.productId}::${(item.optionValue || '').trim()}`;
              const unitPrice = isPromotionEligible(promotion, item)
                ? getDiscountedCents(item.priceCents, promotion?.percentOff || 0)
                : item.priceCents;
              return (
              <div key={itemKey} className="grid grid-cols-[86px_1fr_auto] gap-4 border-b border-[var(--ca-border)] py-5">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-[108px] w-[86px] object-cover border border-[var(--ca-border)] bg-white"
                  />
                )}
                <div className="min-w-0">
                  <h3 className="ca-card-title text-[1.08rem] leading-snug">{item.name}</h3>
                  {item.category && <p className="ca-card-meta mt-1">{item.category}</p>}
                  {Array.isArray(item.selectedOptions) && item.selectedOptions.length > 0 ? (
                    <div className="mt-1 space-y-0.5">
                      {item.selectedOptions.map((option) => (
                        <p key={`${option.groupId}-${option.optionValue}`} className="ca-copy text-xs leading-5">
                          {option.groupLabel}: {option.optionLabel}
                        </p>
                      ))}
                    </div>
                  ) : item.optionGroupLabel && item.optionValue && (
                    <p className="ca-copy mt-1 text-xs leading-5">
                      {item.optionGroupLabel}: {item.optionValue}
                    </p>
                  )}
                  {item.oneoff ? (
                    <div className="mt-4 flex items-center gap-3">
                      <span className="border border-[var(--ca-border)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--ca-muted)]">One of one</span>
                      <button
                        onClick={() => removeItem(item.productId, item.optionValue)}
                        className="text-[10px] uppercase tracking-[0.2em] text-[var(--ca-muted)] underline-offset-4 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center gap-3">
                      <div className="inline-flex items-center border border-[var(--ca-border)]">
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity - 1, item.optionValue)}
                          className="inline-flex h-9 w-9 items-center justify-center text-[var(--ca-ink)] hover:bg-[var(--ca-paper)]"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-9 text-center text-sm text-[var(--ca-ink)]">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity + 1, item.optionValue)}
                          disabled={item.quantityAvailable !== null && item.quantityAvailable !== undefined && item.quantity >= item.quantityAvailable}
                          className="inline-flex h-9 w-9 items-center justify-center text-[var(--ca-ink)] hover:bg-[var(--ca-paper)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(item.productId, item.optionValue)}
                        className="text-[10px] uppercase tracking-[0.2em] text-[var(--ca-muted)] underline-offset-4 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  {isPromotionEligible(promotion, item) ? (
                    <div className="space-y-1">
                      <div className="text-xs text-[var(--ca-muted)] line-through">{formatMoney(item.priceCents)}</div>
                      <div className="ca-card-price">{formatMoney(unitPrice)}</div>
                    </div>
                  ) : (
                    <div className="ca-card-price">{formatMoney(item.priceCents)}</div>
                  )}
                </div>
              </div>
            );
            })}
            {qualifiedGiftProduct && (
              <div className="grid grid-cols-[86px_1fr_auto] gap-4 border-b border-[var(--ca-border)] py-5">
                {qualifiedGiftProduct.imageUrl ? (
                  <img
                    src={qualifiedGiftProduct.imageUrl}
                    alt={qualifiedGiftProduct.name}
                    className="h-[108px] w-[86px] object-cover border border-[var(--ca-border)] bg-white"
                  />
                ) : (
                  <div className="h-[108px] w-[86px] border border-[var(--ca-border)] bg-[var(--ca-paper)]" />
                )}
                <div className="min-w-0">
                  <h3 className="ca-card-title text-[1.08rem] leading-snug">
                    {qualifiedGiftProduct.name}
                  </h3>
                  {qualifiedGiftProduct.description ? (
                    <p className="ca-copy mt-1 line-clamp-2 text-xs">{qualifiedGiftProduct.description}</p>
                  ) : null}
                  <p className="ca-copy mt-2 text-xs">Qty: 1</p>
                </div>
                <div className="text-right text-sm font-medium uppercase tracking-[0.18em] text-emerald-700">Free</div>
              </div>
            )}
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-[var(--ca-border)] bg-white p-5 space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-[var(--ca-muted)]">
                <span>Subtotal</span>
                <span className="font-medium text-[var(--ca-ink)]">${(effectiveSubtotal / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[var(--ca-muted)]">
                <span>Shipping</span>
                <span className="font-medium text-[var(--ca-ink)]">{formatShipping(shippingCents)}</span>
              </div>
              <div className="border-t border-[var(--ca-border)] pt-3 flex justify-between font-serif text-xl text-[var(--ca-ink)]">
                <span>Total</span>
                <span>${(totalCents / 100).toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={handleCheckout}
              className="ca-button ca-button-filled w-full"
            >
              Checkout
            </button>
            <button
              type="button"
              onClick={() => {
                setCartDrawerOpen(false);
                navigate('/shop');
              }}
              className="ca-button ca-button-ghost w-full"
            >
              Continue Shopping
            </button>
          </div>
        )}
      </div>
    </>
  );
}
