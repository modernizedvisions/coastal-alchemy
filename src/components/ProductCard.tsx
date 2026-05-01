import { ShoppingCart } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Product } from '../lib/types';
import type { CategoryOptionGroup } from '../lib/categoryOptions';
import { resolveCategoryOptionGroup } from '../lib/categoryOptions';
import { useCartStore } from '../store/cartStore';
import { useUIStore } from '../store/uiStore';
import { ProgressiveImage } from './ui/ProgressiveImage';
import { buildOptimizedImageSrc } from '../lib/imageOptimize';
import { getDiscountedCents, isPromotionEligible, usePromotions } from '../lib/promotions';
import { mapProductToAnalyticsItem, trackAddToCart, trackSelectItem } from '../lib/analytics';

interface ProductCardProps {
  product: Product;
  categoryOptionLookup?: Map<string, CategoryOptionGroup>;
  itemListName?: string;
}

export function ProductCard({ product, categoryOptionLookup, itemListName }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const qtyInCart = useCartStore((state) => {
    const found = state.items.find((i) => i.productId === product.id);
    return found?.quantity ?? 0;
  });
  const isOneOffInCart = useCartStore((state) => state.isOneOffInCart);
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);
  const navigate = useNavigate();
  const { promotion } = usePromotions();
  const resolvedItemListName = itemListName || 'Shop Products';

  const inCart = qtyInCart > 0;
  const maxQty = product.quantityAvailable ?? null;
  const isAtMax = maxQty !== null && qtyInCart >= maxQty;
  const isDisabled = (product.oneoff && inCart) || (maxQty !== null && qtyInCart >= maxQty);
  const isSold = product.isSold || (product.quantityAvailable !== undefined && product.quantityAvailable <= 0);
  const isPurchaseReady = !!product.priceCents && !isSold;
  const rawSrc = product.imageUrl || product.imageUrls?.[0] || '';
  const { primarySrc, fallbackSrc } = buildOptimizedImageSrc(rawSrc, 'thumb');

  const handleAddToCart = () => {
    if (!product.priceCents || isSold) return;
    if (product.oneoff && isOneOffInCart(product.id)) return;
    if (maxQty !== null && qtyInCart >= maxQty) {
      if (typeof window !== 'undefined') {
        alert(`Only ${maxQty} available.`);
      }
      return;
    }

    const previousQty = useCartStore.getState().getQuantityForProduct(product.id);
    addItem({
      productId: product.id,
      name: product.name,
      priceCents: product.priceCents,
      quantity: 1,
      imageUrl: product.thumbnailUrl || product.imageUrl,
      oneoff: product.oneoff,
      quantityAvailable: product.quantityAvailable ?? null,
      stripeProductId: product.stripeProductId ?? null,
      stripePriceId: product.stripePriceId ?? null,
      category: product.category ?? null,
      categories: product.categories ?? null,
      shippingOverrideEnabled: product.shippingOverrideEnabled ?? false,
      shippingOverrideAmountCents: product.shippingOverrideAmountCents ?? null,
    });
    const nextQty = useCartStore.getState().getQuantityForProduct(product.id);
    const addedQuantity = Math.max(0, nextQty - previousQty);
    if (addedQuantity > 0) {
      trackAddToCart([
        mapProductToAnalyticsItem(product, {
          quantity: addedQuantity,
          itemListName: resolvedItemListName,
        }),
      ]);
    }
    setCartDrawerOpen(true);
  };

  const handleSelectItem = () => {
    trackSelectItem(
      resolvedItemListName,
      mapProductToAnalyticsItem(product, {
        itemListName: resolvedItemListName,
      })
    );
  };

  const basePriceCents = product.priceCents ?? null;
  const promoEligible = isPromotionEligible(promotion, product);
  const discountedCents =
    basePriceCents !== null && promoEligible && promotion
      ? getDiscountedCents(basePriceCents, promotion.percentOff)
      : basePriceCents;
  const priceLabel = basePriceCents !== null ? `$${(basePriceCents / 100).toFixed(2)}` : '';
  const discountedLabel =
    discountedCents !== null ? `$${(discountedCents / 100).toFixed(2)}` : '';

  const productHref = `/product/${product.id}`;
  const categoryKey = product.category || product.type || '';
  const optionGroup = categoryOptionLookup ? resolveCategoryOptionGroup(categoryKey, categoryOptionLookup) : null;
  const requiresOption = !!optionGroup;

  return (
    <article className="group ca-shop-card">
      <div className="ca-card-media relative">
        {inCart && (
          <span className="absolute right-3 top-3 z-10 bg-[var(--ca-navy)] px-3 py-1 text-[0.62rem] font-medium uppercase tracking-[0.2em] text-white">
            Added
          </span>
        )}
        <Link
          to={productHref}
          aria-label={`View ${product.name}`}
          onClick={handleSelectItem}
          className="block h-full w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-deep-ocean focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          {rawSrc ? (
            <ProgressiveImage
              src={primarySrc}
              fallbackSrc={fallbackSrc}
              timeoutMs={2500}
              alt={product.name}
              className="h-full w-full"
              imgClassName="h-full w-full object-cover"
              width={640}
              height={640}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--ca-muted)]">
              No image
            </div>
          )}
        </Link>
      </div>
      <div className="ca-shop-card-body">
        <div className="flex flex-col gap-2">
          <div className="ca-card-meta">{product.category || product.type || 'Coastal Piece'}</div>
          <Link to={productHref} onClick={handleSelectItem} className="ca-card-title transition hover:text-[var(--ca-navy)]">
            {product.name}
          </Link>
          {product.description && (
            <p className="ca-copy ca-shop-description my-0 text-[0.92rem]">
              {product.description}
            </p>
          )}
        </div>

        {isSold && (
          <div className="mt-3">
            <span className="inline-flex border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-rose-700">
              Sold
            </span>
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-4 pt-5">
          {promoEligible && discountedCents !== basePriceCents && basePriceCents !== null ? (
            <div className="whitespace-nowrap">
              <div className="text-xs text-[var(--ca-muted)] line-through">{priceLabel}</div>
              <div className="ca-card-price">{discountedLabel}</div>
            </div>
          ) : (
            <span className="ca-card-price whitespace-nowrap">{priceLabel}</span>
          )}
          <button
            onClick={() => {
              if (requiresOption) {
                handleSelectItem();
                navigate(productHref);
                return;
              }
              handleAddToCart();
            }}
            disabled={!requiresOption && (isDisabled || !isPurchaseReady)}
            className="ca-button ca-button-filled ca-shop-add-button disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={requiresOption ? 'Choose options' : 'Add to Cart'}
          >
            {requiresOption ? (
              <span>Choose Options</span>
            ) : inCart && product.oneoff ? (
              <span>Added</span>
            ) : (
              <>
                <ShoppingCart className="h-3.5 w-3.5" />
                <span>Add to Cart</span>
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
