import { useRef } from 'react';
import ProductCard from './ProductCard';
import type { Product } from '../types/product';

interface Props {
  title: string;
  products: Product[];
  loading?: boolean;
}

export default function ProductCarousel({ title, products, loading = false }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    trackRef.current?.scrollBy({ left: dir === 'left' ? -280 : 280, behavior: 'smooth' });
  };

  return (
    <section className="carousel">
      <div className="carousel__header">
        <h2 className="carousel__title">{title}</h2>
        <div className="carousel__controls">
          <button className="carousel__btn" onClick={() => scroll('left')} aria-label="Scroll left">‹</button>
          <button className="carousel__btn" onClick={() => scroll('right')} aria-label="Scroll right">›</button>
        </div>
      </div>
      <div className="carousel__track" ref={trackRef}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="carousel__item product-card product-card--skeleton" />
            ))
          : products.map((p) => (
              <div key={p.id} className="carousel__item">
                <ProductCard product={p} />
              </div>
            ))}
      </div>
    </section>
  );
}
