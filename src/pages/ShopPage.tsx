import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchCategories, fetchProducts } from '../lib/publicApi';
import { Category, Product } from '../lib/types';
import { buildCategoryOptionLookup, normalizeCategoryKey } from '../lib/categoryOptions';
import { ProductGrid } from '../components/ProductGrid';
import { mapProductToAnalyticsItem, trackViewItemList } from '../lib/analytics';

const toSlug = (value: string) => normalizeCategoryKey(value);

const ensureCategoryDefaults = (category: Category): Category => ({
  ...category,
  name: category.name || category.slug,
  slug: category.slug || toSlug(category.name || ''),
  showOnHomePage: category.showOnHomePage ?? true,
});

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
  const [searchParams, setSearchParams] = useSearchParams();
  const isDev = import.meta.env?.DEV;

  const categoryList = useMemo(() => {
    return dedupeCategories(categories);
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

  const optionLookup = useMemo(() => buildCategoryOptionLookup(categoryList), [categoryList]);

  const visibleCategories = useMemo(
    () => categoryList.filter((category) => (groupedProducts[category.slug] || []).length > 0),
    [categoryList, groupedProducts]
  );

  const displayedProducts = useMemo(() => {
    if (!activeCategorySlug) return products;
    return groupedProducts[activeCategorySlug] || [];
  }, [activeCategorySlug, groupedProducts, products]);

  const activeCategoryName = useMemo(() => {
    if (!activeCategorySlug) return 'All Products';
    return visibleCategories.find((category) => category.slug === activeCategorySlug)?.name || 'Shop Products';
  }, [activeCategorySlug, visibleCategories]);

  useEffect(() => {
    if (!visibleCategories.length) return;
    const typeParam = searchParams.get('type');
    const normalized = typeParam ? toSlug(typeParam) : '';
    if (!normalized || normalized === 'all') {
      if (activeCategorySlug) setActiveCategorySlug('');
      return;
    }
    const match = visibleCategories.find(
      (c) => toSlug(c.slug) === normalized || toSlug(c.name) === normalized
    );

    if (match) {
      if (activeCategorySlug !== match.slug) setActiveCategorySlug(match.slug);
      return;
    }

    if (activeCategorySlug) setActiveCategorySlug('');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('type');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, visibleCategories, activeCategorySlug, setSearchParams]);

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
    if (!displayedProducts.length) return;
      trackViewItemList(
        activeCategoryName,
        displayedProducts.map((item) =>
          mapProductToAnalyticsItem(item, {
            itemListName: activeCategoryName,
          })
        )
      );
  }, [activeCategoryName, displayedProducts, isLoading]);

  const handleCategorySelect = (slug?: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (!slug) {
      if (activeCategorySlug) setActiveCategorySlug('');
      nextParams.delete('type');
      setSearchParams(nextParams, { replace: true });
      return;
    }
    if (activeCategorySlug !== slug) setActiveCategorySlug(slug);
    nextParams.set('type', slug);
    setSearchParams(nextParams, { replace: true });
  };

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
          <div className="ca-tag-row">
            <button
              type="button"
              onClick={() => handleCategorySelect(undefined)}
              className={`ca-tag ${!activeCategorySlug ? 'is-active' : ''}`}
            >
              All
            </button>
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
          </div>

          {isLoading ? (
            <div className="py-12 text-center">
              <p className="ca-copy">Loading products...</p>
            </div>
          ) : visibleCategories.length === 0 ? (
            <div className="border border-dashed border-[var(--ca-border)] bg-white py-12 text-center">
              <p className="ca-copy">No categories yet.</p>
            </div>
          ) : displayedProducts.length === 0 ? (
            <div className="border border-dashed border-[var(--ca-border)] bg-white py-12 text-center">
              <p className="ca-copy">No products found.</p>
            </div>
          ) : (
            <ProductGrid
              products={displayedProducts}
              categoryOptionLookup={optionLookup}
              itemListName={activeCategoryName}
            />
          )}
        </div>
      </section>
    </div>
  );
}
