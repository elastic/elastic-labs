'use client';

import { useState } from 'react';
import ProductDetailModal from './ProductDetailModal';

function DeltaBadge({ delta, isNew }) {
  if (isNew) {
    return <span className="result-badge result-badge--new">New</span>;
  }

  if (!delta) {
    return null;
  }

  if (delta.direction === 'same') {
    return <span className="result-badge result-badge--same">Rank unchanged</span>;
  }

  const className = delta.direction === 'up'
    ? 'result-badge result-badge--up'
    : 'result-badge result-badge--down';

  return <span className={className}>{delta.label}</span>;
}

function ProductImage({ imageUrl, name }) {
  const [hasError, setHasError] = useState(false);

  if (!imageUrl || hasError) {
    return <div className="result-card__image result-card__image--placeholder" aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external Amazon CDN URLs
    <img
      src={imageUrl}
      alt={name}
      loading="lazy"
      onError={() => setHasError(true)}
      className="result-card__image"
    />
  );
}

export default function ResultCard({ hit }) {
  const [detailOpen, setDetailOpen] = useState(false);

  const openDetails = () => setDetailOpen(true);
  const closeDetails = () => setDetailOpen(false);

  return (
    <>
      <article
        className="result-card result-card--clickable"
        role="button"
        tabIndex={0}
        aria-label={`View details for ${hit.name}`}
        onClick={openDetails}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openDetails();
          }
        }}
      >
        <ProductImage imageUrl={hit.image_url} name={hit.name} />
        <div className="result-card__content">
          <p className="result-card__rank-line">
            <span className="result-card__rank">#{hit.rank}:</span>
            <DeltaBadge delta={hit.delta} isNew={hit.isNew} />
          </p>
          <p className="result-card__title">{hit.name}</p>
          <p className="result-card__sub">{hit.category} · {hit.brand}</p>
          <p className="result-card__sub">score {hit.score.toFixed(2)}</p>
        </div>
      </article>

      {detailOpen && <ProductDetailModal hit={hit} onClose={closeDetails} />}
    </>
  );
}
