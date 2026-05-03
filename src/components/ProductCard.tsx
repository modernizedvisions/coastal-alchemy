import { Link } from 'react-router-dom';
import { Product } from '../lib/types';
import { ProgressiveImage } from './ui/ProgressiveImage';
import { buildOptimizedImageSrc } from '../lib/imageOptimize';
import { getDiscountedCents, isPromotionEligible, usePromotions } from '../lib/promotions';
import { mapProductToAnalyticsItem, trackSelectItem } from '../lib/analytics';

interface ProductCardProps {
  product: Product;
  itemListName?: string;
}

export function ProductCard({ product, itemListName }: ProductCardProps) {
  const { promotion } = usePromotions();
  const resolvedItemListName = itemListName || 'Shop Products';
  const isSold = product.isSold || (product.quantityAvailable !== undefined && product.quantityAvailable <= 0);
  const rawSrc = product.imageUrl || product.imageUrls?.[0] || '';
  const { primarySrc, fallbackSrc } = buildOptimizedImageSrc(rawSrc, 'thumb');

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

  return (
    <article className="group ca-shop-card">
      <div className="ca-card-media relative">
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

        <div className="ca-shop-card-actions mt-auto pt-5">
          <div className="ca-shop-price-wrap">
            {promoEligible && discountedCents !== basePriceCents && basePriceCents !== null ? (
              <>
                <div className="text-xs text-[var(--ca-muted)] line-through">{priceLabel}</div>
                <div className="ca-card-price">{discountedLabel}</div>
              </>
            ) : (
              <span className="ca-card-price whitespace-nowrap">{priceLabel}</span>
            )}
          </div>
          <Link
            to={productHref}
            onClick={handleSelectItem}
            className="ca-button ca-button-filled ca-shop-view-button"
          >
            View Piece →
          </Link>
        </div>
      </div>
    </article>
  );
}
