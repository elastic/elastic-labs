import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getProduct } from '../lib/api';
import type { Product } from '../types/product';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [imgError, setImgError] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const loading = loadedId !== id;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    getProduct(id)
      .then((data) => {
        if (cancelled) return;
        setProduct(data);
        setLoadedId(id);
      })
      .catch(() => {
        if (!cancelled) navigate('/search', { replace: true });
      });

    return () => { cancelled = true; };
  }, [id, navigate]);

  if (loading) return <div className="detail-loading">Loading…</div>;
  if (!product) return null;

  const hasImage = !imgError && product.images?.[0];

  // FIX: handle categories array safely
  const category = product.category || 'general';

  return (
    <div className="product-detail">
      <p className="product-detail__breadcrumb">
        <Link to="/">Home</Link>
        {' / '}
        <Link to={`/category/${category.toLowerCase()}`}>{category}</Link>
        {' / '}
        {product.name}
      </p>

      <div className="product-detail__body">
        <div className="product-detail__image-wrap">
          {hasImage ? (
            <img
              src={product.images[0]}
              alt={product.name}
              className="product-detail__img"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="product-detail__placeholder">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#7a9a6f" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
                <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
              </svg>
            </div>
          )}
        </div>

        <div className="product-detail__info">
          <span className="product-detail__category">{category}</span>
          <h1 className="product-detail__name">{product.name}</h1>
          <p className="product-detail__price">${product.price?.toFixed(2)}</p>

          <div className="product-detail__badges">
            {product.sunlight && <InfoBadge label="Sunlight" value={product.sunlight} />}
            {product.water_needs && <InfoBadge label="Water" value={product.water_needs} />}
            {product.region && <InfoBadge label="Region" value={product.region} />}
          </div>

          <p className="product-detail__description">
             {product.description}
          </p>

          {product.tags?.length > 0 && (
            <div className="product-detail__tags">
              {product.tags.map((tag) => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          )}

          {product.long_description && (
            <p className="product-detail__long">
              <strong>Description</strong><br></br>
              {product.long_description}
            </p>
          )}

          <button className="btn btn--outline" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-badge">
      <span className="info-badge__label">{label}</span>
      <span className="info-badge__value">{value}</span>
    </div>
  );
}