import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSearchMode } from '../contexts/SearchModeContext';
import ProductGrid from '../components/ProductGrid';
import { searchProducts } from '../lib/api';
import type { Product } from '../types/product';

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>();
  const displayName = category ? category.charAt(0).toUpperCase() + category.slice(1) : '';
  const { mode } = useSearchMode();

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Include mode in the key so switching modes re-fetches
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const queryKey = `${displayName}|${mode}`;
  const loading = loadedKey !== queryKey;

  useEffect(() => {
    if (!displayName) return;
    let cancelled = false;
    searchProducts({ category: displayName, mode: mode === 'hybrid' ? 'hybrid' : 'fulltext' })
      .then((data) => {
        if (cancelled) return;
        setProducts(data.products);
        setTotal(data.total);
        setError(null);
        setLoadedKey(`${displayName}|${mode}`);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load category. Make sure the server is running: npm run server');
        setLoadedKey(`${displayName}|${mode}`);
      });
    return () => { cancelled = true; };
  }, [displayName, mode]);

  return (
    <div className="category-page">
      <div className="category-page__hero">
        <p className="category-page__breadcrumb">
          <Link to="/">Home</Link> / {displayName}
        </p>
        <h1>{displayName}</h1>
        {!loading && <p className="category-page__count">{total} plant{total !== 1 ? 's' : ''}</p>}
      </div>
      <div className="category-page__body">
        {!loading && error ? (
          <div className="error-banner">{error}</div>
        ) : (
          <ProductGrid products={products} loading={loading} />
        )}
      </div>
    </div>
  );
}
