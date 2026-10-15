export interface DocEntry {
  index: string;
  title: string;
  page_count: number;
  ingested_at: string;
}

export interface Passage {
  text: string;
  page: string | null;
  kind: 'semantic' | 'lexical';
  doc?: string;
}

export interface ProductHit {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  sun: string;
  water: string;
  image_url?: string;
  category: string;
}

/** 'all' = catalog + every document, 'catalog' = products only, otherwise a document index name. */
export type ChatScope = 'all' | 'catalog' | string;

export type ProgressEvent =
  | { type: 'status'; message: string }
  | { type: 'rendered'; total: number }
  | { type: 'page'; page: number; total: number; completed: number; chars: number }
  | { type: 'table_preview'; page: number; html: string }
  | { type: 'done'; index: string; pages: number; chars: number }
  | { type: 'error'; message: string };

export type ChatEvent =
  | { type: 'sources'; passages: Passage[] }
  | { type: 'recommended'; products: ProductHit[] }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export async function uploadDocument(file: File): Promise<{ jobId: string; index: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/documents/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed (${res.status})`);
  }
  return res.json();
}

export function subscribeProgress(jobId: string, onEvent: (e: ProgressEvent) => void): () => void {
  const source = new EventSource(`/api/documents/progress/${jobId}`);
  source.onmessage = (msg) => {
    const event = JSON.parse(msg.data) as ProgressEvent;
    onEvent(event);
    if (event.type === 'done' || event.type === 'error') source.close();
  };
  source.onerror = () => source.close();
  return () => source.close();
}

export async function listDocuments(): Promise<DocEntry[]> {
  const res = await fetch('/api/documents');
  if (!res.ok) return [];
  return res.json();
}

export async function askGarden(
  scope: ChatScope,
  question: string,
  onEvent: (e: ChatEvent) => void
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, question }),
  });
  if (!res.ok || !res.body) throw new Error(`Chat request failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      onEvent(JSON.parse(line.slice(5).trim()) as ChatEvent);
    }
  }
}
