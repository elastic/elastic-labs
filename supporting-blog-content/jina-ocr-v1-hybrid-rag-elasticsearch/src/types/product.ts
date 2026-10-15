export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  long_description?: string;
  price: number;
  images: string[];
  tags: string[];
  region: string;
  sunlight: string;
  water_needs: string;
  sku: string;
  /** Present on search results with a query: why this plant matched. */
  match?: { lexical_rank: number | null; semantic_rank: number | null };
  snippet?: { source: 'keyword' | 'semantic'; text: string } | null;
}

export interface SearchStats {
  both: number;
  lexical_only: number;
  semantic_only: number;
}

export interface CompareResponse {
  fulltext: SearchResponse;
  hybrid: SearchResponse;
  summary: { surfaced_by_hybrid: number; dropped_by_hybrid: number; reordered: number };
}

export interface SearchResponse {
  total: number;
  products: Product[];
  mode?: 'fulltext' | 'hybrid';
  stats?: SearchStats | null;
}

export interface SearchParams {
  q?: string;
  category?: string;
  sunlight?: string;
  water_needs?: string;
  size?: number;
  from?: number;
  mode?: 'fulltext' | 'hybrid';
}

/* What a product looks like, what requests include, and what comes back from search. */