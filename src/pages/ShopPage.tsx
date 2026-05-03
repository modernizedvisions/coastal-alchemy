import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchCategories, fetchProducts } from '../lib/publicApi';
import { Category, Product } from '../lib/types';
import { normalizeCategoryKey } from '../lib/categoryOptions';
import { ProductGrid } from '../components/ProductGrid';
import { mapProductToAnalyticsItem, trackViewItemList } from '../lib/analytics';

const toSlug = (value: string) => normalizeCategoryKey(value);

const ensureCategoryDefaults = (category: Category): Category => ({
  ...category,
  name: category.name || category.slug,
  slug: category.slug || toSlug(category.name || ''),
  subtitle: category.subtitle || '',
  showOnHomePage: category.showOnHomePage ?? true,
});

const getCategorySortOrder = (category: Category) =>
  Number.isFinite(category.sortOrder as number) ? Number(category.sortOrder) : Number.MAX_SAFE_INTEGER;

const sortCategoriesByAdminOrder = (categories: Category[]): Category[] =>
  categories
    .map((category, index) => ({ category, index }))
    .sort((a, b) => {
      const orderDelta = getCategorySortOrder(a.category) - getCategorySortOrder(b.category);
      if (orderDelta !== 0) return orderDelta;
      if (getCategorySortOrder(a.category) !== Number.MAX_SAFE_INTEGER) return a.index - b.index;
      return a.category.name.localeCompare(b.category.name);
    })
    .map(({ category }) => category);

const dedupeCategories = (categories: Category[]): Category[] => {
  const seen = new Set<string>();
  const result: Category[] = [];
  categories.forEach((category) => {
    const key = toSlug(category.slug || category.name || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(ensureCategoryDefaults(category));
  });
  return result;
};

const getProductCategoryNames = (product: Product): string[] => {
  const names = new Set<string>();
  const addName = (name?: string | null) => {
    const trimmed = (name || '').trim();
    if (trimmed) names.add(trimmed);
  };

  addName(product.type);
  addName((product as any).category);
  if (Array.isArray(product.categories)) {
    product.categories.forEach((c) => addName(c));
  }
  if (Array.isArray((product as any).categories)) {
    (product as any).categories.forEach((c: unknown) => {
      if (typeof c === 'string') addName(c);
    });
  }

  return Array.from(names);
};

const buildCategoryLookups = (categoryList: Category[]) => {
  const slugLookup = new Map<string, string>();
  const nameLookup = new Map<string, string>();
  categoryList.forEach((cat) => {
    const normalizedSlug = toSlug(cat.slug);
    const normalizedName = toSlug(cat.name);
    if (normalizedSlug) slugLookup.set(normalizedSlug, cat.slug);
    if (normalizedName) nameLookup.set(normalizedName, cat.slug);
  });
  return { slugLookup, nameLookup };
};

const resolveCategorySlugForProduct = (
  product: Product,
  categoryList: Category[],
  lookups: { slugLookup: Map<string, string>; nameLookup: Map<string, string> },
  fallbackSlug?: string
): {
  slug: string | null;
  matchedBy: 'slug' | 'name' | 'fallback' | 'none';
  candidateNames: string[];
  normalizedCandidates: string[];
} => {
  const candidateNames = getProductCategoryNames(product);
  const normalizedCandidates = candidateNames.map((name) => toSlug(name)).filter(Boolean);
  const candidateSet = new Set(normalizedCandidates);

  for (const category of categoryList) {
    const normalizedSlug = toSlug(category.slug);
    const normalizedName = toSlug(category.name);
    if (normalizedSlug && candidateSet.has(normalizedSlug)) {
      return { slug: category.slug, matchedBy: 'slug', candidateNames, normalizedCandidates };
    }
    if (normalizedName && candidateSet.has(normalizedName)) {
      return { slug: category.slug, matchedBy: 'name', candidateNames, normalizedCandidates };
    }
  }

  for (const normalized of normalizedCandidates) {
    if (lookups.slugLookup.has(normalized)) {
      return {
        slug: lookups.slugLookup.get(normalized)!,
        matchedBy: 'slug',
        candidateNames,
        normalizedCandidates,
      };
    }
    if (lookups.nameLookup.has(normalized)) {
      return {
        slug: lookups.nameLookup.get(normalized)!,
        matchedBy: 'name',
        candidateNames,
        normalizedCandidates,
      };
    }
  }

  if (fallbackSlug) return { slug: fallbackSlug, matchedBy: 'fallback', candidateNames, normalizedCandidates };

  return { slug: null, matchedBy: 'none', candidateNames, normalizedCandidates };
};

export function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategorySlug, setActiveCategorySlug] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isDev = import.meta.env?.DEV;

  const categoryList = useMemo(() => {
    return sortCategoriesByAdminOrder(dedupeCategories(categories));
  }, [categories]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const allProducts = await fetchProducts({ visible: true });
      const availableProducts = (allProducts || []).filter((p) => !p.isSold);
      if (isDev) {
        console.log(
          '[ShopPage] product sample (first 3)',
          availableProducts.slice(0, 3).map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            category: (p as any).category ?? null,
            categories: Array.isArray((p as any).categories) ? (p as any).categories : null,
          }))
        );
      }
      setProducts(availableProducts);

      let apiCategories: Category[] = [];
      try {
        apiCategories = await fetchCategories();
      } catch (categoryError) {
        console.error('Error loading categories:', categoryError);
      }

      const orderedCategories = dedupeCategories(apiCategories);
      if (isDev) {
        console.log(
          '[ShopPage] merged category list',
          orderedCategories.map((c) => ({ slug: c.slug, name: c.name }))
        );
      }
      setCategories(orderedCategories);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const groupedProducts = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    if (!categoryList.length) return groups;

    categoryList.forEach((c) => {
      groups[c.slug] = [];
    });

    const lookups = buildCategoryLookups(categoryList);

    products.forEach((product) => {
      const resolution = resolveCategorySlugForProduct(product, categoryList, lookups);
      if (isDev && !resolution.slug) {
        console.log('[ShopPage][category-fallback]', {
          productId: product.id,
          productName: product.name,
          candidateNames: resolution.candidateNames,
          normalizedCandidates: resolution.normalizedCandidates,
          resolvedSlug: resolution.slug,
          matchedBy: resolution.matchedBy,
        });
      }
      const key = resolution.slug;
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(product);
    });

    return groups;
  }, [categoryList, products]);

  const uncategorizedProducts = useMemo(() => {
    if (!products.length) return [];
    const visibleProductIds = new Set(
      Object.values(groupedProducts)
        .flat()
        .map((product) => product.id)
    );
    return products.filter((product) => !visibleProductIds.has(product.id));
  }, [groupedProducts, products]);

  const visibleCategorySections = useMemo(
    () =>
      categoryList
        .map((category) => ({
          category,
          products: groupedProducts[category.slug] || [],
        }))
        .filter((section) => section.products.length > 0),
    [categoryList, groupedProducts]
  );

  const visibleCategories = useMemo(
    () => visibleCategorySections.map((section) => section.category),
    [visibleCategorySections]
  );

  const requestedCategorySlug = useMemo(() => {
    const queryValue = searchParams.get('category') || searchParams.get('type') || '';
    const hashValue = location.hash ? decodeURIComponent(location.hash.replace(/^#/, '')) : '';
    const normalized = toSlug(queryValue || hashValue);
    return normalized === 'all' ? '' : normalized;
  }, [location.hash, searchParams]);

  useEffect(() => {
    if (!visibleCategories.length) return;
    const match = visibleCategories.find(
      (c) => toSlug(c.slug) === requestedCategorySlug || toSlug(c.name) === requestedCategorySlug
    );

    if (match) {
      if (activeCategorySlug !== match.slug) setActiveCategorySlug(match.slug);
      window.requestAnimationFrame(() => {
        document.getElementById(match.slug)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }

    if (requestedCategorySlug && activeCategorySlug) setActiveCategorySlug('');
  }, [requestedCategorySlug, visibleCategories, activeCategorySlug]);

  useEffect(() => {
    if (!categoryList.length) return;
    if (isDev) {
      console.log(
        '[ShopPage] categoryList effect',
        categoryList.map((c) => ({ slug: c.slug, name: c.name }))
      );
    }
  }, [categoryList]);

  useEffect(() => {
    if (isLoading) return;
    visibleCategorySections.forEach(({ category, products: sectionProducts }) => {
      if (!sectionProducts.length) return;
      trackViewItemList(
        category.name,
        sectionProducts.map((item) =>
          mapProductToAnalyticsItem(item, {
            itemListName: category.name,
          })
        )
      );
    });
  }, [visibleCategorySections, isLoading]);

  const handleCategorySelect = (slug: string) => {
    if (activeCategorySlug !== slug) setActiveCategorySlug(slug);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('type');
    nextParams.set('category', slug);
    navigate(
      {
        pathname: location.pathname,
        search: `?${nextParams.toString()}`,
        hash: `#${slug}`,
      },
      { replace: true }
    );
    document.getElementById(slug)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const hasVisibleProducts = visibleCategorySections.length > 0 || uncategorizedProducts.length > 0;

  return (
    <div className="ca-page min-h-screen">
      <header className="ca-page-head">
        <div className="ca-eyebrow mb-4">Shop</div>
        <h1>The Collection</h1>
        <p className="ca-copy mx-auto mt-4 max-w-2xl">
          A rotating selection of one-of-a-kind framed pieces, painted shells, and tabletop accents. New work added throughout the season.
        </p>
      </header>

      <section className="ca-section">
        <div className="ca-container">
          {visibleCategories.length > 0 && (
          <nav className="ca-tag-row" aria-label="Shop categories">
            {visibleCategories.map((category) => {
              const isActive = activeCategorySlug === category.slug;
              return (
                <button
                  key={category.slug}
                  onClick={() => handleCategorySelect(category.slug)}
                  className={`ca-tag ${isActive ? 'is-active' : ''}`}
                >
                  {category.name}
                </button>
              );
            })}
          </nav>
          )}

          {isLoading ? (
            <div className="py-12 text-center">
              <p className="ca-copy">Loading products...</p>
            </div>
          ) : !hasVisibleProducts ? (
            <div className="border border-dashed border-[var(--ca-border)] bg-white py-12 text-center">
              <p className="ca-copy">New pieces are coming soon.</p>
            </div>
          ) : (
            <div className="ca-shop-sections">
              {visibleCategorySections.map(({ category, products: sectionProducts }) => (
                <section id={category.slug} key={category.slug} className="ca-shop-category-section scroll-mt-24">
                  <div className="ca-shop-category-head">
                    <div className="ca-eyebrow mb-3">Collection</div>
                    <h2 className="ca-shop-category-title">{category.name}</h2>
                    {category.subtitle ? (
                      <p className="ca-shop-category-subtitle">{category.subtitle}</p>
                    ) : null}
                  </div>
                  <ProductGrid
                    products={sectionProducts}
                    itemListName={category.name}
                  />
                </section>
              ))}

              {uncategorizedProducts.length > 0 && (
                <section className="ca-shop-category-section">
                  <div className="ca-shop-category-head">
                    <div className="ca-eyebrow mb-3">Collection</div>
                    <h2 className="ca-shop-category-title">More Pieces</h2>
                  </div>
                  <ProductGrid products={uncategorizedProducts} itemListName="More Pieces" />
                </section>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
