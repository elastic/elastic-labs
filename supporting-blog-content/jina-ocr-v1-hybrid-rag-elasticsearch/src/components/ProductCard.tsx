import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../types/product';

interface Props {
  product: Product;
}

const SUNLIGHT_LABEL: Record<string, string> = {
  full_sun: '☀️ Full Sun',
  partial_shade: '⛅ Partial',
  full_shade: '🌥️ Shade',
};

const WATER_LABEL: Record<string, string> = {
  low: '💧 Low',
  medium: '💧💧 Medium',
  high: '💧💧💧 High',
};

function MatchStrip({ product }: { product: Product }) {
  const m = product.match;
  if (!m) return null;
  const kind = m.lexical_rank && m.semantic_rank ? 'both' : m.lexical_rank ? 'keyword' : m.semantic_rank ? 'meaning' : null;
  if (!kind) return null;
  const label = kind === 'both' ? 'Keyword + meaning' : kind === 'keyword' ? 'Keyword match' : 'Meaning match';
  return (
    <div className="match-strip">
      <span className={`match-badge match-badge--${kind}`}>{label}</span>
      {product.snippet && (
        <p
          className={`match-snippet match-snippet--${product.snippet.source}`}
          dangerouslySetInnerHTML={{ __html: product.snippet.text }}
        />
      )}
    </div>
  );
}

export default function ProductCard({ product }: Props) {
  const [imgError, setImgError] = useState(false);
  const hasImage = !imgError && product.images?.[0];

  const category = product.category || 'general';

  return (
    <Link to={`/product/${product.id}`} className="product-card">
      <div className="product-card__image">
        {hasImage ? (
          <img
            src={product.images[0]}
            alt={product.name}
            className="product-card__img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="product-card__placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
            </svg>
          </div>
        )}
      </div>

      <div className="product-card__body">
        <span className="product-card__category">{category}</span>
        <h3 className="product-card__name">{product.name} <br></br>{product.sku && <small>{product.sku}</small>}</h3>
        <p className="product-card__price">${product.price?.toFixed(2)}</p>

        {/* Short description */}
        <p className="product-card__description">
          {product.description}
        </p>

        <div className="product-card__attrs">
          {product.sunlight && (
            <span className="product-card__attr">
              {SUNLIGHT_LABEL[product.sunlight] ?? product.sunlight}
            </span>
          )}
          {product.water_needs && (
            <span className="product-card__attr">
              {WATER_LABEL[product.water_needs] ?? product.water_needs}
            </span>
          )}
        </div>

        <MatchStrip product={product} />
      </div>
    </Link>
  );
}