import { useRef, useState } from 'react';

interface Props {
  initialValue?: string;
  onSearch: (query: string) => void;
  placeholder?: string;
}

export default function SearchBar({ initialValue = '', onSearch, placeholder = 'Search plants…' }: Props) {
  const [value, setValue] = useState(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setValue(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSearch(next), 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearTimeout(timerRef.current);
    onSearch(value);
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit} role="search">
      <input
        type="search"
        className="search-bar__input"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label="Search plants"
      />
      <button type="submit" className="search-bar__btn" aria-label="Search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    </form>
  );
}
