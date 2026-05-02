import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Minus, Plus, ShoppingCart } from 'lucide-react';
import { fetchCategories, fetchProductById, fetchRelatedProducts } from '../lib/publicApi';
import { Category, Product } from '../lib/types';
import { useCartStore } from '../store/cartStore';
import { useUIStore } from '../store/uiStore';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { getDiscountedCents, isPromotionEligible, usePromotions } from '@/lib/promotions';
import {
  buildCategoryOptionLookup,
  flattenSelectedOptionsLabel,
  formatChoiceLabel,
  resolveCategoryOptionGroups,
  selectedOptionsPriceIncreaseCents,
} from '../lib/categoryOptions';
import { CANONICAL_ORIGIN, toAbsoluteAssetUrl, toCanonicalUrl, useJsonLd, useSeo } from '../lib/seo';
import {
  mapProductToAnalyticsItem,
  trackAddToCart,
  trackSelectItem,
  trackViewItem,
  trackViewItemList,
} from '../lib/analytics';
import { ProductMediaGallery } from '../components/product/ProductMediaGallery';

export function ProductDetailPage() {
  const { productId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const relatedRef = useRef<HTMLDivElement | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedOptionsByGroup, setSelectedOptionsByGroup] = useState<Record<string, string>>({});
  const [optionValidationMessage, setOptionValidationMessage] = useState<string | null>(null);
  const addItem = useCartStore((state) => state.addItem);
  const isOneOffInCart = useCartStore((state) => state.isOneOffInCart);
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);
  const { promotion } = usePromotions();

  useEffect(() => {
    const load = async () => {
      if (!productId) return;
      setLoadingProduct(true);
      const found = await fetchProductById(productId);
      setProduct(found);
      setLoadingProduct(false);

      if (found) {
        setLoadingRelated(true);
        fetchRelatedProducts(found.type, found.id).then((items) => {
          setRelated(items);
          setLoadingRelated(false);
        });
      }
    };
    load();
  }, [productId]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const data = await fetchCategories();
        setCategories(data);
      } catch (error) {
        console.error('Failed to load categories', error);
      }
    };
    void loadCategories();
  }, []);

  const images = useMemo(() => {
    if (!product) return [];
    if (product.imageUrls && product.imageUrls.length > 0) return product.imageUrls;
    return product.imageUrl ? [product.imageUrl] : [];
  }, [product]);

  useEffect(() => {
    setQuantity(1);
    setSelectedOptionsByGroup({});
    setOptionValidationMessage(null);
  }, [productId]);

  const hasPrice = product?.priceCents !== undefined && product?.priceCents !== null;
  const isSold = product?.isSold || (product?.quantityAvailable !== undefined && (product.quantityAvailable ?? 0) <= 0);
  const canPurchase = !!product && hasPrice && !isSold;
  const optionLookup = useMemo(() => buildCategoryOptionLookup(categories), [categories]);
  const optionGroups = useMemo(() => {
    if (!product) return [];
    const categoryKey = product.category || product.type || '';
    return resolveCategoryOptionGroups(categoryKey, optionLookup).filter((group) => group.enabled !== false);
  }, [product, optionLookup]);
  const selectedOptions = useMemo(() => {
    return optionGroups
      .map((group) => {
        const selectedValue = selectedOptionsByGroup[group.id] || '';
        const selected = group.options.find((option) => option.value === selectedValue || option.label === selectedValue);
        if (!selected) return null;
        return {
          groupId: group.id,
          groupLabel: group.label,
          optionId: selected.id,
          optionLabel: selected.label,
          optionValue: selected.value,
          priceIncreaseCents: selected.priceIncreaseCents || 0,
        };
      })
      .filter((option): option is NonNullable<typeof option> => Boolean(option));
  }, [optionGroups, selectedOptionsByGroup]);
  const selectedOptionsKey = flattenSelectedOptionsLabel(selectedOptions);
  const priceIncreaseCents = selectedOptionsPriceIncreaseCents(selectedOptions);
  const missingRequiredGroups = optionGroups.filter((group) => group.required !== false && !selectedOptionsByGroup[group.id]);
  const hasSelectedOption = missingRequiredGroups.length === 0;
  const qtyInCart = useCartStore((state) =>
    product ? state.getQuantityForProduct(product.id, selectedOptionsKey) : 0
  );
  const promoEligible = product ? isPromotionEligible(promotion, product) : false;
  const discountedPriceCents =
    product?.priceCents !== undefined && product?.priceCents !== null
      ? (promoEligible && promotion
          ? getDiscountedCents(product.priceCents + priceIncreaseCents, promotion.percentOff)
          : product.priceCents + priceIncreaseCents)
      : null;
  const configuredPriceCents = discountedPriceCents;
  const maxQty = product?.quantityAvailable ?? null;
  const maxSelectable =
    !product?.oneoff && maxQty !== null ? Math.max(0, maxQty - qtyInCart) : null;
  const showQuantitySelector =
    !!product && !product.oneoff && (maxQty === null || maxQty >= 1);
  const hasSelectableStock =
    !product?.oneoff && maxSelectable !== null ? maxSelectable > 0 : true;
  const effectiveQty = product?.oneoff
    ? 1
    : maxSelectable !== null
    ? Math.min(quantity, maxSelectable)
    : quantity;

  useEffect(() => {
    if (!product || product.oneoff) return;
    if (maxSelectable !== null && maxSelectable > 0) {
      setQuantity((prev) => Math.min(Math.max(prev, 1), maxSelectable));
    }
  }, [product?.id, product?.oneoff, maxSelectable]);

  const handleAddToCart = () => {
    if (!product || !hasPrice || isSold) return;
    if (product.oneoff && isOneOffInCart(product.id)) return;
    if (!hasSelectedOption) {
      setOptionValidationMessage('Please choose all required choices before adding this item to your cart.');
      return;
    }
    if (!product.oneoff && !hasSelectableStock) return;
    const previousQty = useCartStore.getState().getQuantityForProduct(product.id, selectedOptionsKey);
    addItem({
      productId: product.id,
      name: product.name,
      priceCents: (product.priceCents ?? 0) + priceIncreaseCents,
      quantity: effectiveQty,
      imageUrl: product.thumbnailUrl || product.imageUrl,
      oneoff: product.oneoff,
      quantityAvailable: product.quantityAvailable ?? null,
      stripeProductId: product.stripeProductId ?? null,
      stripePriceId: product.stripePriceId ?? null,
      category: product.category ?? null,
      categories: product.categories ?? null,
      shippingOverrideEnabled: product.shippingOverrideEnabled ?? false,
      shippingOverrideAmountCents: product.shippingOverrideAmountCents ?? null,
      optionGroupLabel: selectedOptions[0]?.groupLabel ?? null,
      optionValue: selectedOptionsKey || null,
      selectedOptions,
    });
    const nextQty = useCartStore.getState().getQuantityForProduct(product.id, selectedOptionsKey);
    const addedQuantity = Math.max(0, nextQty - previousQty);
    if (addedQuantity > 0) {
      trackAddToCart([
        mapProductToAnalyticsItem(product, {
          quantity: addedQuantity,
          itemListName: 'Product Detail',
          itemVariant: selectedOptionsKey,
        }),
      ]);
    }
    setCartDrawerOpen(true);
  };

  const formatPrice = (priceCents?: number | null) =>
    priceCents || priceCents === 0 ? `$${(priceCents / 100).toFixed(2)}` : '';
  const seoPathSegment = product?.slug || product?.id || productId || '';
  const canonicalPath = seoPathSegment ? `/product/${encodeURIComponent(seoPathSegment)}` : location.pathname;
  const isMissingProduct = !loadingProduct && !product;
  const seoDescription = isMissingProduct
    ? 'This product is unavailable or no longer exists.'
    : (product?.description || 'View hand-painted shell art details from Coastal Alchemy.').replace(/\s+/g, ' ').trim();

  useSeo({
    title: isMissingProduct
      ? 'Product Not Found | Coastal Alchemy'
      : product?.name
      ? `${product.name} | Coastal Alchemy`
      : 'Product | Coastal Alchemy',
    description: seoDescription,
    canonicalPath,
    ogType: 'product',
    noindex: isMissingProduct,
  });

  const productSchema = useMemo(() => {
    if (!product || isMissingProduct) return null;

    const productUrl = toCanonicalUrl(canonicalPath);
    const primaryImage = product.imageUrls?.[0] || product.imageUrl || '';
    const imageUrl = primaryImage ? toAbsoluteAssetUrl(primaryImage) : `${CANONICAL_ORIGIN}/images/large-shell-frame.png`;
    const availability =
      product.isSold || (product.quantityAvailable !== undefined && product.quantityAvailable <= 0)
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock';

    const schema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: seoDescription,
      image: [imageUrl],
      url: productUrl,
      productID: product.id,
      sku: product.stripeProductId || product.id,
      offers: {
        '@type': 'Offer',
        url: productUrl,
        priceCurrency: 'USD',
        availability,
      },
    };

    if (product.priceCents !== undefined && product.priceCents !== null) {
      (schema.offers as Record<string, unknown>).price = (product.priceCents / 100).toFixed(2);
    }

    return schema;
  }, [canonicalPath, isMissingProduct, product, seoDescription]);

  const breadcrumbSchema = useMemo(() => {
    if (!product || isMissingProduct) return null;

    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: `${CANONICAL_ORIGIN}/`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Shop',
          item: `${CANONICAL_ORIGIN}/shop`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: product.name,
          item: toCanonicalUrl(canonicalPath),
        },
      ],
    };
  }, [canonicalPath, isMissingProduct, product]);

  useJsonLd('product', productSchema);
  useJsonLd('product-breadcrumb', breadcrumbSchema);

  useEffect(() => {
    if (loadingProduct || !product) return;
    trackViewItem(
      mapProductToAnalyticsItem(product, {
        itemListName: 'Product Detail',
      })
    );
  }, [loadingProduct, product]);

  useEffect(() => {
    if (loadingRelated || !related.length) return;
    const listName = 'Related Products';
    trackViewItemList(
      listName,
      related.map((item) =>
        mapProductToAnalyticsItem(item, {
          itemListName: listName,
        })
      )
    );
  }, [loadingRelated, related]);

  if (!loadingProduct && !product) {
    return (
      <div className="ca-page min-h-screen py-16">
        <div className="ca-container text-center space-y-4">
          <h1 className="ca-section-title">Product not found</h1>
          <Link to="/shop" className="ca-button ca-button-ghost inline-flex">
            Back to Shop
          </Link>
        </div>
      </div>
    );
  }

  const handleRelatedSelect = (item: Product) => {
    const listName = 'Related Products';
    trackSelectItem(
      listName,
      mapProductToAnalyticsItem(item, {
        itemListName: listName,
      })
    );
  };

  return (
    <div className="ca-page min-h-screen">
        <section className="ca-section">
          <div className="ca-container">
            <div className="mb-6 flex items-center justify-between">
              <button
                onClick={() => navigate(-1)}
                className="ca-button ca-button-ghost px-4 py-2 text-[10px]"
              >
                Back
              </button>
              <span />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1.05fr,0.95fr] gap-10 lg:gap-14 items-start">
              <ProductMediaGallery
                loading={loadingProduct}
                productName={product?.name || 'Product'}
                imageUrls={images}
                productVideo={product?.productVideo}
              />

              <div className="ca-form-skin space-y-6 border border-[var(--ca-border)] bg-white p-6 sm:p-8">
                <div className="space-y-3">
                  <p className="ca-eyebrow">{product?.category || product?.type || 'Product'}</p>
                  <h1 className="ca-section-title">
                    {loadingProduct ? 'Loading...' : product?.name}
                  </h1>
                  {product?.priceCents !== undefined && product?.priceCents !== null && (
                    <div className="ca-card-price flex items-baseline gap-3 text-[1.45rem]">
                      {promoEligible && discountedPriceCents !== product.priceCents ? (
                        <>
                          <span className="text-sm text-[var(--ca-muted)] line-through">
                            {formatPrice(product.priceCents + priceIncreaseCents)}
                          </span>
                          <span className="text-[1.6rem] text-[var(--ca-ink)]">{formatPrice(configuredPriceCents)}</span>
                        </>
                      ) : (
                        <span>{formatPrice(configuredPriceCents)}</span>
                      )}
                    </div>
                  )}
                  <p className="ca-copy text-base">{product?.description}</p>
                </div>

                {optionGroups.length > 0 && (
                  <div className="border border-[var(--ca-border)] bg-white px-5 py-4 space-y-3">
                    <p className="ca-eyebrow text-[10px]">Choose</p>
                    {optionGroups.map((group) => (
                      <div key={group.id}>
                        <label className="mb-2 block">
                          {group.label}
                          {group.required !== false ? ' *' : ''}
                        </label>
                        <select
                          value={selectedOptionsByGroup[group.id] || ''}
                          onChange={(event) => {
                            setSelectedOptionsByGroup((prev) => ({ ...prev, [group.id]: event.target.value }));
                            setOptionValidationMessage(null);
                          }}
                          className="lux-input mt-1"
                        >
                          <option value="">Select {group.label}</option>
                          {group.options
                            .filter((option) => option.enabled !== false)
                            .map((option) => (
                              <option key={option.id} value={option.value}>
                                {formatChoiceLabel(option.label, option.priceIncreaseCents)}
                              </option>
                            ))}
                        </select>
                      </div>
                    ))}
                    {optionValidationMessage && <p className="text-xs text-rose-700">{optionValidationMessage}</p>}
                  </div>
                )}

                {showQuantitySelector && (
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div className="w-full">
                      <div className="inline-flex w-full items-center justify-between border border-[var(--ca-border)] bg-white px-3 py-2">
                        <button
                          onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                          disabled={quantity <= 1}
                          className="inline-flex h-9 w-9 items-center justify-center text-[var(--ca-ink)] hover:bg-[var(--ca-paper)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center text-sm text-[var(--ca-ink)]">{quantity}</span>
                        <button
                          onClick={() =>
                            setQuantity((prev) =>
                              maxSelectable !== null ? Math.min(prev + 1, Math.max(1, maxSelectable)) : prev + 1
                            )
                          }
                          disabled={maxSelectable !== null && quantity >= maxSelectable}
                          className="inline-flex h-9 w-9 items-center justify-center text-[var(--ca-ink)] hover:bg-[var(--ca-paper)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex w-full items-center justify-center">
                      <span className="ca-card-price text-center text-[1.15rem]">
                        {maxSelectable !== null ? `${maxSelectable} Left In Stock` : 'In Stock'}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <button
                    onClick={handleAddToCart}
                    disabled={
                      !canPurchase ||
                      (product?.oneoff && isOneOffInCart(product.id)) ||
                      (!product?.oneoff && !hasSelectableStock)
                    }
                    className="ca-button ca-button-filled w-full justify-center"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Add to Cart
                  </button>
                  <Link
                    to="/custom-orders"
                    className="ca-button ca-button-ghost w-full justify-center"
                  >
                    Custom Request
                  </Link>
                </div>

                <div className="border border-[var(--ca-border)] bg-white px-5 py-4 space-y-2">
                  <h3 className="ca-card-title">Designed with intention</h3>
                  <p className="ca-copy text-sm">
                    Each shell is hand-finished and composed to reflect coastal calm and personal meaning. Subtle variations in shape, tone, and edge are part of what makes every piece one of a kind.
                  </p>
                </div>

                <div className="border-t border-[var(--ca-border)]" />
                <p className="text-center text-xs uppercase tracking-[0.22em] text-[var(--ca-muted)]">
                  Crafted by hand - Carefully packaged - Ships from Naples
                </p>
              </div>
            </div>
          </div>
        </section>

        {!loadingRelated && related.length > 0 && (
          <section className="ca-section border-t border-[var(--ca-border)]">
            <div className="ca-container">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="ca-eyebrow">More from this collection</p>
                  <h2 className="ca-section-title">Curated for you</h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => relatedRef.current?.scrollBy({ left: -260, behavior: 'smooth' })}
                    className="ca-button ca-button-ghost px-3 py-2"
                    aria-label="Scroll left"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => relatedRef.current?.scrollBy({ left: 260, behavior: 'smooth' })}
                    className="ca-button ca-button-ghost px-3 py-2"
                    aria-label="Scroll right"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div ref={relatedRef} className="flex gap-4 overflow-x-auto pb-2">
                {related.map((item) => (
                  <div
                    key={item.id}
                    className="ca-card w-64 flex-shrink-0"
                  >
                    <div className="ca-card-media aspect-square">
                      <ProgressiveImage
                        src={item.imageUrl || item.imageUrls?.[0]}
                        alt={item.name}
                        className="h-full w-full"
                        imgClassName="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.03]"
                        width={320}
                        height={320}
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <div className="p-4 space-y-2">
                      <h3 className="ca-card-title truncate">{item.name}</h3>
                      {item.priceCents !== undefined && item.priceCents !== null && (
                        <div className="ca-card-price text-sm">
                          {isPromotionEligible(promotion, item) ? (
                            <div className="flex items-baseline gap-2">
                              <span className="text-xs text-[var(--ca-muted)] line-through">
                                {formatPrice(item.priceCents)}
                              </span>
                              <span>{formatPrice(getDiscountedCents(item.priceCents, promotion?.percentOff || 0))}</span>
                            </div>
                          ) : (
                            <span>{formatPrice(item.priceCents)}</span>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            handleRelatedSelect(item);
                            navigate(`/product/${item.id}`);
                          }}
                          className="ca-button ca-button-ghost w-full justify-center"
                        >
                          View
                        </button>
                        <button
                          onClick={() => {
                            const relatedCategoryKey = item.category || item.type || '';
                            const relatedOptionGroups = resolveCategoryOptionGroups(relatedCategoryKey, optionLookup);
                            const relatedRequiresOption = relatedOptionGroups.length > 0;
                            if (relatedRequiresOption) {
                              handleRelatedSelect(item);
                              navigate(`/product/${item.id}`);
                              return;
                            }
                            if (!item.priceCents || item.isSold) return;
                            if (item.oneoff && isOneOffInCart(item.id)) return;
                            const previousQty = useCartStore.getState().getQuantityForProduct(item.id);
                            addItem({
                              productId: item.id,
                              name: item.name,
                              priceCents: item.priceCents,
                              quantity: 1,
                              imageUrl: item.thumbnailUrl || item.imageUrl,
                              oneoff: item.oneoff,
                              category: item.category ?? null,
                              categories: item.categories ?? null,
                              shippingOverrideEnabled: item.shippingOverrideEnabled ?? false,
                              shippingOverrideAmountCents: item.shippingOverrideAmountCents ?? null,
                              stripeProductId: item.stripeProductId ?? null,
                              stripePriceId: item.stripePriceId ?? null,
                            });
                            const nextQty = useCartStore.getState().getQuantityForProduct(item.id);
                            const addedQuantity = Math.max(0, nextQty - previousQty);
                            if (addedQuantity > 0) {
                              trackAddToCart([
                                mapProductToAnalyticsItem(item, {
                                  quantity: addedQuantity,
                                  itemListName: 'Related Products',
                                }),
                              ]);
                            }
                            setCartDrawerOpen(true);
                          }}
                          disabled={
                            !item.priceCents ||
                            item.isSold ||
                            (item.oneoff && isOneOffInCart(item.id))
                          }
                          className="ca-button ca-button-filled w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ShoppingCart className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

      {canPurchase && (
        <div className="fixed md:hidden bottom-0 inset-x-0 z-40 px-3 pb-4">
          <div className="flex items-center gap-3 border border-[var(--ca-border)] bg-white p-3 shadow-2xl">
            {product?.priceCents !== undefined && product?.priceCents !== null && (
              <div className="flex-1">
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--ca-muted)]">Total</p>
                <p className="ca-card-price text-lg">
                  {promoEligible && discountedPriceCents !== product.priceCents
                    ? formatPrice(configuredPriceCents)
                    : formatPrice(configuredPriceCents)}
                </p>
              </div>
            )}
            <button
              onClick={handleAddToCart}
              disabled={
                !canPurchase ||
                (product?.oneoff && isOneOffInCart(product.id)) ||
                (!product?.oneoff && maxQty !== null && effectiveQty > maxQty)
              }
              className="ca-button ca-button-filled flex-1 justify-center"
            >
              Add to Cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
