import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useSearchMode } from '../contexts/SearchModeContext';
import SearchBar from './SearchBar';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentQuery = searchParams.get('q') ?? '';
  const { mode, setMode } = useSearchMode();

  const handleSearch = (query: string) => {
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    } else {
      navigate('/search');
    }
  };

  return (
    <header className="header">
      <div className="header__inner">
        <Link to="/" className="header__logo">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
          </svg>
          <span>Texas Native Plants</span>
        </Link>

        {/* key={pathname} remounts SearchBar with correct initial value on page change */}
        <SearchBar
          key={location.pathname}
          initialValue={currentQuery}
          onSearch={handleSearch}
          placeholder="Search native plants…"
        />

        <nav className="header__nav">
          <Link to="/" className="header__nav-link">Home</Link>
          <Link to="/search" className="header__nav-link">All Plants</Link>
          <Link to="/documents" className="header__nav-link">Documents</Link>
        </nav>

        <div className="search-mode-toggle" role="group" aria-label="Search mode">
          <button
            className={`search-mode-toggle__btn${mode === 'fulltext' ? ' search-mode-toggle__btn--active' : ''}`}
            onClick={() => setMode('fulltext')}
          >
            Full-text
          </button>
          <button
            className={`search-mode-toggle__btn${mode === 'hybrid' ? ' search-mode-toggle__btn--active' : ''}`}
            onClick={() => setMode('hybrid')}
          >
            Hybrid
          </button>
          <button
            className={`search-mode-toggle__btn${mode === 'compare' ? ' search-mode-toggle__btn--active' : ''}`}
            onClick={() => setMode('compare')}
          >
            Compare
          </button>
        </div>
      </div>
    </header>
  );
}
