import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSearchMode } from '../contexts/SearchModeContext';
import ProductGrid from '../components/ProductGrid';
import CompareResults from '../components/CompareResults';
import { compareSearch, searchProducts } from '../lib/api';
import type { CompareResponse, Product, SearchStats } from '../types/product';

const CATEGORY_OPTIONS = ['Wildflowers', 'Trees', 'Shrubs', 'Grasses', 'Ferns', 'Succulents'];
const SUNLIGHT_OPTIONS = ['Full Sun', 'Partial Shade', 'Full Shade'];
const WATER_OPTIONS = ['Low', 'Medium', 'High'];

// Queries chosen to make the modes diverge: intent and paraphrase that the
// catalog text never states verbatim.
const TRY_QUERIES = [
  'something for a shady wet corner',
  'attracts hummingbirds',
  'survives the heat with almost no watering',
  'privacy hedge that stays green all year',
  'red yucca',
  'monarch butterflies',
];

export default function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const sunlight = searchParams.get('sunlight') ?? '';
  const water_needs = searchParams.get('water_needs') ?? '';
  const { mode } = useSearchMode();

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [compare, setCompare] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const queryKey = `${q}|${category}|${sunlight}|${water_needs}|${mode}`;
  const loading = loadedKey !== queryKey;

  // Compare needs a query; with no query, both modes are identical browse lists.
  const compareMode = mode === 'compare' && q.length > 0;

  useEffect(() => {
    let cancelled = false;
    const done = () => { if (!cancelled) setLoadedKey(queryKey); };
    const fail = () => {
      if (cancelled) return;
      setError('Search failed. Make sure the server is running: npm run server');
      done();
    };

    if (compareMode) {
      compareSearch({ q, category, sunlight, water_needs })
        .then((data) => {
          if (cancelled) return;
          setCompare(data);
          setError(null);
          done();
        })
        .catch(fail);
    } else {
      const apiMode = mode === 'hybrid' ? 'hybrid' : 'fulltext';
      searchProducts({ q, category, sunlight, water_needs, mode: apiMode })
        .then((data) => {
          if (cancelled) return;
          setProducts(data.products);
          setTotal(data.total);
          setStats(data.stats ?? null);
          setCompare(null);
          setError(null);
          done();
        })
        .catch(fail);
    }
    return () => { cancelled = true; };
  }, [q, category, sunlight, water_needs, mode, compareMode, queryKey]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const setQuery = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('q', value);
    setSearchParams(next);
  };

  const modeLabel = mode === 'hybrid' ? 'Hybrid' : mode === 'compare' ? 'Compare' : 'Full-text';

  return (
    <div className="search-results">
      <aside className="search-results__sidebar">
        <FilterGroup label="Category" options={CATEGORY_OPTIONS} value={category} onChange={(v) => setFilter('category', v)} />
        <FilterGroup label="Sunlight" options={SUNLIGHT_OPTIONS} value={sunlight} onChange={(v) => setFilter('sunlight', v)} />
        <FilterGroup label="Water Needs" options={WATER_OPTIONS} value={water_needs} onChange={(v) => setFilter('water_needs', v)} />

        <div className="try-queries">
          <h3 className="filter-group__label">Try a query</h3>
          <p className="try-queries__hint">Phrased the way shoppers talk, not the way the catalog is written.</p>
          <ul className="try-queries__list">
            {TRY_QUERIES.map((tq) => (
              <li key={tq}>
                <button type="button" className={`try-query${q === tq ? ' try-query--active' : ''}`} onClick={() => setQuery(tq)}>
                  {tq}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="search-results__main">
        <div className="search-results__header">
          <h1 className="search-results__title">
            {q ? `Results for "${q}"` : 'All Plants'}
          </h1>
          {!loading && !compareMode && (
            <span className="search-results__count">
              {total} plant{total !== 1 ? 's' : ''} · {modeLabel}
            </span>
          )}
        </div>

        {!loading && !compareMode && q && stats && (
          <p className="search-results__stats">
            {mode === 'hybrid' ? (
              <>
                <strong>{stats.both}</strong> matched by keyword and meaning,{' '}
                <strong>{stats.semantic_only}</strong> by meaning only,{' '}
                <strong>{stats.lexical_only}</strong> by keyword only.
              </>
            ) : (
              <>
                Keyword scoring only. <strong>{stats.semantic_only}</strong> plant{stats.semantic_only === 1 ? '' : 's'} that
                semantic search would also find {stats.semantic_only === 1 ? 'is' : 'are'} not shown here. Switch to Hybrid or Compare.
              </>
            )}
          </p>
        )}

        {mode === 'compare' && !q && !loading && (
          <p className="search-results__stats">Enter a query, or pick one on the left, to compare full-text and hybrid side by side.</p>
        )}

        {!loading && error ? (
          <div className="error-banner">{error}</div>
        ) : compareMode && compare && !loading ? (
          <CompareResults data={compare} q={q} />
        ) : (
          <ProductGrid products={products} loading={loading} />
        )}
      </div>
    </div>
  );
}

interface FilterGroupProps {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

function FilterGroup({ label, options, value, onChange }: FilterGroupProps) {
  return (
    <div className="filter-group">
      <h3 className="filter-group__label">{label}</h3>
      <ul className="filter-group__options">
        <li>
          <label className="filter-option">
            <input type="radio" name={label} checked={value === ''} onChange={() => onChange('')} />
            All
          </label>
        </li>
        {options.map((opt) => (
          <li key={opt}>
            <label className="filter-option">
              <input type="radio" name={label} checked={value === opt} onChange={() => onChange(opt)} />
              {opt}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
