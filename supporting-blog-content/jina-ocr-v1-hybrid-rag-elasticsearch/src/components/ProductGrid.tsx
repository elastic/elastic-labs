import ProductCard from './ProductCard';
import type { Product } from '../types/product';

interface Props {
  products: Product[];
  loading?: boolean;
}

export default function ProductGrid({ products, loading = false }: Props) {
  if (loading) {
    return (
      <div className="product-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="product-card product-card--skeleton" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="product-grid__empty">
        <p>No plants found. Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <div className="product-grid">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
