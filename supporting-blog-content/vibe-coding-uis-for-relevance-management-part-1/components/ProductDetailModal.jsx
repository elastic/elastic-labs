'use client';

import { useCallback, useEffect } from 'react';

const FIELD_LABELS = {
  id: 'Product ID',
  name: 'Name',
  description: 'Description',
  category: 'Category',
  brand: 'Brand',
  image_url: 'Image URL',
};

const SEARCH_META_KEYS = new Set(['rank', 'score', 'delta', 'isNew']);

function labelForField(key) {
  return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFieldValue(key, value) {
  if (value == null || value === '') {
    return null;
  }

  if (key === 'image_url') {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="product-detail-modal__link">
        {value}
      </a>
    );
  }

  if (typeof value === 'number' && key === 'score') {
    return value.toFixed(2);
  }

  return String(value);
}

function formatRankChange(hit) {
  if (hit.isNew) {
    return 'New in this query';
  }

  if (!hit.delta) {
    return '—';
  }

  if (hit.delta.direction === 'same') {
    return 'Rank unchanged';
  }

  return hit.delta.label;
}

function getProductFields(hit) {
  return Object.entries(hit)
    .filter(([key, value]) => !SEARCH_META_KEYS.has(key) && value != null && value !== '')
    .sort(([a], [b]) => {
      const order = ['id', 'name', 'category', 'brand', 'description', 'image_url'];
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
}

function ProductImage({ imageUrl, name }) {
  if (!imageUrl) {
    return <div className="product-detail-modal__image product-detail-modal__image--placeholder" aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external Amazon CDN URLs
    <img src={imageUrl} alt={name} className="product-detail-modal__image" />
  );
}

export default function ProductDetailModal({ hit, onClose }) {
  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  if (!hit) {
    return null;
  }

  const productFields = getProductFields(hit);

  return (
    <div className="query-preview-modal product-detail-modal" role="presentation" onClick={close}>
      <div
        className="query-preview-modal__dialog product-detail-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="query-preview-modal__head">
          <div>
            <h3 id="product-detail-title">{hit.name || 'Product details'}</h3>
            {hit.id && <p className="query-preview-modal__file">{hit.id}</p>}
          </div>
          <button
            type="button"
            className="query-preview-modal__close"
            onClick={close}
            aria-label="Close product details"
          >
            ×
          </button>
        </div>

        <div className="product-detail-modal__body">
          <div className="product-detail-modal__hero">
            <ProductImage imageUrl={hit.image_url} name={hit.name} />
            <dl className="product-detail-modal__fields">
              <div className="product-detail-modal__field">
                <dt>Rank</dt>
                <dd>#{hit.rank}</dd>
              </div>
              <div className="product-detail-modal__field">
                <dt>Relevance score</dt>
                <dd>{hit.score?.toFixed(2)}</dd>
              </div>
              <div className="product-detail-modal__field">
                <dt>Rank change</dt>
                <dd>{formatRankChange(hit)}</dd>
              </div>
            </dl>
          </div>

          <dl className="product-detail-modal__fields product-detail-modal__fields--all">
            {productFields.map(([key, value]) => {
              const formatted = formatFieldValue(key, value);
              if (formatted == null) {
                return null;
              }

              return (
                <div key={key} className="product-detail-modal__field">
                  <dt>{labelForField(key)}</dt>
                  <dd>{formatted}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </div>
  );
}
