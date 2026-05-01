import { Product } from '../lib/types';
import type { CategoryOptionGroup } from '../lib/categoryOptions';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: Product[];
  categoryOptionLookup?: Map<string, CategoryOptionGroup>;
  itemListName?: string;
}

export function ProductGrid({ products, categoryOptionLookup, itemListName }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No products found</p>
      </div>
    );
  }

  return (
    <div className="product-grid ca-grid ca-grid-3">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          categoryOptionLookup={categoryOptionLookup}
          itemListName={itemListName}
        />
      ))}
    </div>
  );
}
