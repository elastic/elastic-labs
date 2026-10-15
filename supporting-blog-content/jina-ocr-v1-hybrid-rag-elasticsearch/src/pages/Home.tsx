import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCarousel from '../components/ProductCarousel';
import { getFeaturedProducts } from '../lib/api';
import type { Product } from '../types/product';

const CATEGORIES = [
  { name: 'Wildflowers', slug: 'wildflowers', bg: '#f5ecd8' },
  { name: 'Trees', slug: 'trees', bg: '#daecd8' },
  { name: 'Shrubs', slug: 'shrubs', bg: '#d8ece4' },
  { name: 'Grasses', slug: 'grasses', bg: '#eaecd8' },
  { name: 'Ferns', slug: 'ferns', bg: '#d8ecde' },
  { name: 'Succulents', slug: 'succulents', bg: '#ece0d8' },
];

export default function Home() {
  const [featured, setFeatured] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFeaturedProducts()
      .then(setFeatured)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="home">
      <section className="hero">
        <div className="hero__content">
          <h1>Discover Texas<br />Native Plants</h1>
          <p className="hero__subtitle">
            Browse drought-tolerant, wildlife-friendly plants grown right here in Texas.
          </p>
          <Link to="/search" className="btn btn--primary btn--lg">
            Browse All Plants
          </Link>
        </div>
      </section>

      <div className="home__body">
        <ProductCarousel title="Featured Plants" products={featured} loading={loading} />

        <section className="category-section">
          <h2 className="section-title">Browse by Category</h2>
          <div className="category-grid">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                to={`/category/${cat.slug}`}
                className="category-tile"
                style={{ '--tile-bg': cat.bg } as React.CSSProperties}
              >
                <span className="category-tile__name">{cat.name}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
