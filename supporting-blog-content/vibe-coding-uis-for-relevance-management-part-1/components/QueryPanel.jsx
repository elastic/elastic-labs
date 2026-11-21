'use client';

import { EuiLoadingSpinner } from '@elastic/eui';
import ResultCard from './ResultCard';
import QueryPreviewButton from './QueryPreviewButton';
import { formatEsTotal } from '@/lib/searchTotals';

export const PAGE_SIZE = 10;
const COL_SIZE = 5;

const VARIANTS = {
  old: {
    label: 'Old Query',
    accentClass: 'query-panel--old',
  },
  new: {
    label: 'New Query',
    accentClass: 'query-panel--new',
  },
};

export default function QueryPanel({
  variant = 'old',
  title,
  hits,
  total,
  took,
  page,
  isLoading,
  hasSearched,
}) {
  const config = VARIANTS[variant] || VARIANTS.old;
  const panelTitle = title || config.label;
  const resultTotalLabel = total != null ? formatEsTotal(total) : null;
  const pageHits = hits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const leftHits = pageHits.slice(0, COL_SIZE);
  const rightHits = pageHits.slice(COL_SIZE, PAGE_SIZE);

  return (
    <section className={`query-panel ${config.accentClass}`}>
      <div className="query-panel__head">
        <div className="query-panel__title-row">
          <div className="query-panel__title-group">
            <h2>{panelTitle}</h2>
            <QueryPreviewButton variant={variant} />
          </div>
          <div className="query-panel__head-right">
            {took != null && resultTotalLabel != null && (
              <div className="query-panel__stats">
                <span className="query-panel__stat">
                  Total Results: <strong>{resultTotalLabel}</strong>
                </span>
                <span className="query-panel__stat">
                  Query Time: <strong>{took}ms</strong>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={`query-panel__results${pageHits.length > 0 ? ' query-panel__results--filled' : ''}`}
      >
        {isLoading ? (
          <div className="query-panel__centered">
            <EuiLoadingSpinner size="l" />
          </div>
        ) : !hasSearched ? (
          <div className="query-panel__centered query-panel__placeholder">
            <p>Enter a search term or press Random button</p>
          </div>
        ) : pageHits.length === 0 ? (
          <div className="query-panel__centered query-panel__placeholder">
            <p>No results in top 100</p>
          </div>
        ) : (
          <>
            <div className="query-panel__results-col">
              {leftHits.map((hit) => (
                <div key={hit.id} className="query-panel__result-row">
                  <ResultCard hit={hit} />
                </div>
              ))}
            </div>
            <div className="query-panel__results-col">
              {rightHits.map((hit) => (
                <div key={hit.id} className="query-panel__result-row">
                  <ResultCard hit={hit} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
