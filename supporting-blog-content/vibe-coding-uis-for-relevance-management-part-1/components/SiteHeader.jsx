'use client';

import Image from 'next/image';
import SearchBar from './SearchBar';

export default function SiteHeader({
  value,
  onChange,
  onSearch,
  onRandom,
  onPreviousPage,
  onNextPage,
  isLoading,
  canPaginate,
  isFirstPage,
  isLastPage,
}) {
  return (
    <header className="sa-header">
      <div className="sa-header__top">
        <a
          href="https://www.elastic.co/"
          className="sa-header__brand"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Elastic"
        >
          <Image
            src="/icons/elastic-logo.svg"
            alt="Elastic"
            width={688}
            height={236}
            className="sa-header__brand-logo sa-header__brand-logo--elastic"
            priority
          />
        </a>

        <h1 className="sa-header__title">Elasticsearch Query Comparer</h1>
      </div>

      <div className="sa-header__toolbar">
        <SearchBar
          value={value}
          onChange={onChange}
          onSearch={onSearch}
          onRandom={onRandom}
          onPreviousPage={onPreviousPage}
          onNextPage={onNextPage}
          isLoading={isLoading}
          canPaginate={canPaginate}
          isFirstPage={isFirstPage}
          isLastPage={isLastPage}
        />
      </div>
    </header>
  );
}
