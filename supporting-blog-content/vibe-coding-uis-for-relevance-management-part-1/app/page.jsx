'use client';

import { useState, useCallback, useMemo } from 'react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import QueryPanel, { PAGE_SIZE } from '@/components/QueryPanel';
import CompareColumns from '@/components/CompareColumns';
import { pickRandomSearchTerm } from '@/data/popular-search-terms';

export default function HomePage() {
  const [term, setTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState(null);
  const [oldHits, setOldHits] = useState([]);
  const [newHits, setNewHits] = useState([]);
  const [oldTook, setOldTook] = useState(null);
  const [newTook, setNewTook] = useState(null);
  const [oldTotal, setOldTotal] = useState(null);
  const [newTotal, setNewTotal] = useState(null);
  const [resultsPage, setResultsPage] = useState(1);

  const totalPages = useMemo(() => {
    const maxHits = Math.max(oldHits.length, newHits.length);
    return Math.ceil(maxHits / PAGE_SIZE) || 1;
  }, [oldHits.length, newHits.length]);

  const runSearchWithTerm = useCallback(async (searchTerm) => {
    const query = searchTerm.trim();
    if (!query) {
      setError('Enter a search term or press Random button.');
      return;
    }

    setTerm(query);
    setIsLoading(true);
    setError(null);
    setResultsPage(1);

    try {
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: query }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }

      setOldHits(data.oldQuery.hits);
      setNewHits(data.newQuery.hits);
      setOldTook(data.oldQuery.took);
      setNewTook(data.newQuery.took);
      setOldTotal(data.oldQuery.total ?? null);
      setNewTotal(data.newQuery.total ?? null);
      setHasSearched(true);
    } catch (err) {
      setError(err.message);
      setOldHits([]);
      setNewHits([]);
      setOldTotal(null);
      setNewTotal(null);
      setHasSearched(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runSearch = useCallback(() => {
    runSearchWithTerm(term);
  }, [term, runSearchWithTerm]);

  const runRandomSearch = useCallback(() => {
    runSearchWithTerm(pickRandomSearchTerm());
  }, [runSearchWithTerm]);

  const goToPreviousPage = useCallback(() => {
    setResultsPage((page) => Math.max(1, page - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setResultsPage((page) => Math.min(totalPages, page + 1));
  }, [totalPages]);

  return (
    <div className="sa-shell">
      <SiteHeader
        value={term}
        onChange={setTerm}
        onSearch={runSearch}
        onRandom={runRandomSearch}
        onPreviousPage={goToPreviousPage}
        onNextPage={goToNextPage}
        isLoading={isLoading}
        canPaginate={hasSearched && totalPages > 1}
        isFirstPage={resultsPage <= 1}
        isLastPage={resultsPage >= totalPages}
      />

      <main className="sa-main">
        {error && (
          <p className="sa-error-inline" role="alert">{error}</p>
        )}

        <CompareColumns
          oldPanel={
            <QueryPanel
              variant="old"
              hits={oldHits}
              total={oldTotal}
              took={oldTook}
              page={resultsPage}
              isLoading={isLoading}
              hasSearched={hasSearched}
            />
          }
          newPanel={
            <QueryPanel
              variant="new"
              hits={newHits}
              total={newTotal}
              took={newTook}
              page={resultsPage}
              isLoading={isLoading}
              hasSearched={hasSearched}
            />
          }
        />
      </main>

      <SiteFooter />
    </div>
  );
}
