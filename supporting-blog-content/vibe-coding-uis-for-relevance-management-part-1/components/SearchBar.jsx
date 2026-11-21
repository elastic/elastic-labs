'use client';

import IndexSettingsButton from './IndexSettingsButton';

export default function SearchBar({
  value,
  onChange,
  onSearch,
  onRandom,
  onPreviousPage,
  onNextPage,
  isLoading,
  canPaginate = false,
  isFirstPage = true,
  isLastPage = true,
}) {
  return (
    <div className="sa-search-row">
      <div className="sa-search__field">
        <svg className="sa-search__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input
          type="text"
          className="sa-search__input"
          placeholder="Search..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSearch();
            }
          }}
          aria-label="Search term"
          disabled={isLoading}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
        />
      </div>

      <button
        type="button"
        className="sa-btn sa-btn--primary"
        onClick={onSearch}
        disabled={isLoading}
      >
        {isLoading ? <span className="sa-spinner" aria-hidden="true" /> : 'Search'}
      </button>

      <button
        type="button"
        className="sa-btn sa-btn--secondary"
        onClick={onRandom}
        disabled={isLoading}
        aria-label="Search a random popular term"
      >
        Random
      </button>

      <button
        type="button"
        className="sa-btn sa-btn--secondary sa-btn--nav"
        onClick={onPreviousPage}
        disabled={!canPaginate || isFirstPage || isLoading}
        aria-label="Previous page"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
        </svg>
        <span className="sa-btn__label">Previous page</span>
      </button>

      <button
        type="button"
        className="sa-btn sa-btn--secondary sa-btn--nav"
        onClick={onNextPage}
        disabled={!canPaginate || isLastPage || isLoading}
        aria-label="Next page"
      >
        <span className="sa-btn__label">Next page</span>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z" />
        </svg>
      </button>

      <IndexSettingsButton />
    </div>
  );
}
