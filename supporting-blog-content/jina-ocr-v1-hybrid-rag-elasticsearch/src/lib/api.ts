import type { CompareResponse, Product, SearchParams, SearchResponse } from '../types/product';

const API_BASE = '/api';

export async function searchProducts(params: SearchParams): Promise<SearchResponse> {
  const query = new URLSearchParams();

  if (params.q) query.append('q', params.q);
  if (params.category) query.append('category', params.category);
  if (params.sunlight) query.append('sunlight', params.sunlight);
  if (params.water_needs) query.append('water_needs', params.water_needs);

  query.append('size', String(params.size ?? 60));
  query.append('from', String(params.from ?? 0));
  query.append('mode', params.mode ?? 'fulltext');

  const res = await fetch(`${API_BASE}/search?${query.toString()}`);
  if (!res.ok) throw new Error('Search failed');

  return res.json();
}

export async function compareSearch(params: SearchParams): Promise<CompareResponse> {
  const query = new URLSearchParams();
  if (params.q) query.append('q', params.q);
  if (params.category) query.append('category', params.category);
  if (params.sunlight) query.append('sunlight', params.sunlight);
  if (params.water_needs) query.append('water_needs', params.water_needs);
  const res = await fetch(`${API_BASE}/search/compare?${query.toString()}`);
  if (!res.ok) throw new Error('Compare failed');
  return res.json();
}

export async function getProduct(id: string): Promise<Product> {
  const res = await fetch(`${API_BASE}/products/${id}`);
  if (!res.ok) throw new Error('Failed to fetch product');

  return res.json();
}

export async function getFeaturedProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/featured`);
  if (!res.ok) throw new Error('Failed to fetch featured');

  return res.json();
}