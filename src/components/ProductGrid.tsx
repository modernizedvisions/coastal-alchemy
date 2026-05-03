import { Product } from '../lib/types';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  products: Product[];
  itemListName?: string;
}

export function ProductGrid({ products, itemListName }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="ca-copy">No products found</p>
      </div>
    );
  }

  return (
    <div className="product-grid ca-shop-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          itemListName={itemListName}
        />
      ))}
    </div>
  );
}
