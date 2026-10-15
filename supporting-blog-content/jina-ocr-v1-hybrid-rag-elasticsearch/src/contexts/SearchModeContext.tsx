import { createContext, useContext, useState } from 'react';

export type SearchMode = 'fulltext' | 'hybrid' | 'compare';

interface SearchModeContextType {
  mode: SearchMode;
  setMode: (mode: SearchMode) => void;
}

const SearchModeContext = createContext<SearchModeContextType>({
  mode: 'fulltext',
  setMode: () => {},
});

export function SearchModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<SearchMode>('fulltext');
  return (
    <SearchModeContext.Provider value={{ mode, setMode }}>
      {children}
    </SearchModeContext.Provider>
  );
}

export function useSearchMode() {
  return useContext(SearchModeContext);
}
