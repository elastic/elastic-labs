import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Link } from 'react-router-dom';
import { askGarden, listDocuments, type ChatScope, type DocEntry, type Passage, type ProductHit } from '../lib/docsApi';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  passages?: Passage[];
  products?: ProductHit[];
  error?: string;
}

const SUGGESTIONS = [
  'What should I plant in a shady, wet corner?',
  'Which plants attract hummingbirds?',
  'Low-water options for full sun',
];

const SUN_LABEL: Record<string, string> = { full_sun: 'Full sun', partial_shade: 'Partial shade', full_shade: 'Shade' };
const WATER_LABEL: Record<string, string> = { low: 'Low water', medium: 'Medium water', high: 'High water' };

function inline(text: string, keyBase: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={`${keyBase}-${i}`}>{part.slice(1, -1)}</em>;
    return <span key={`${keyBase}-${i}`}>{part}</span>;
  });
}

function Answer({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length) {
      blocks.push(<ul key={`ul-${blocks.length}`}>{list.map((item, i) => <li key={i}>{inline(item, `li-${blocks.length}-${i}`)}</li>)}</ul>);
      list = [];
    }
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^[-*•]\s+/.test(line)) { list.push(line.replace(/^[-*•]\s+/, '')); continue; }
    flushList();
    if (line) blocks.push(<p key={`p-${blocks.length}`}>{inline(line, `p-${blocks.length}`)}</p>);
  }
  flushList();
  return <div className="doc-chat__answer">{blocks}</div>;
}

export default function DocChat() {
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [scope, setScope] = useState<ChatScope>('all');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) listDocuments().then(setDocs).catch(() => {});
  }, [open]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: question }, { role: 'assistant', text: '' }]);

    try {
      await askGarden(scope, question, (event) => {
        setMessages((m) => {
          const next = [...m];
          const last = { ...next[next.length - 1] };
          if (event.type === 'sources') last.passages = event.passages;
          if (event.type === 'recommended') last.products = event.products;
          if (event.type === 'delta') last.text += event.text;
          if (event.type === 'error') last.error = event.message;
          next[next.length - 1] = last;
          return next;
        });
      });
    } catch (err) {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: 'assistant',
          text: '',
          error: err instanceof Error ? err.message : 'Chat failed. Is the server running?',
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  const scopeHint =
    scope === 'all' ? 'Answers draw on the plant catalog and every uploaded guide.'
    : scope === 'catalog' ? 'Answers draw on the plant catalog only.'
    : 'Answers draw on this document only, with page citations.';

  return (
    <>
      <button
        className="doc-chat__launcher"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close plant advisor' : 'Open plant advisor'}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
          </svg>
        )}
      </button>

      {open && (
        <div className="doc-chat" role="dialog" aria-label="Plant advisor">
          <div className="doc-chat__head">
            <strong>Plant advisor</strong>
            <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Answer scope">
              <option value="all">Everything</option>
              <option value="catalog">Plant catalog only</option>
              {docs.map((d) => (
                <option key={d.index} value={d.index}>{d.title} ({d.page_count}p)</option>
              ))}
            </select>
          </div>
          <p className="doc-chat__scope-hint">{scopeHint}</p>

          <div className="doc-chat__thread" ref={threadRef}>
            {messages.length === 0 && (
              <div className="doc-chat__empty">
                <p>Ask a gardening question. Answers are grounded in the guides you've uploaded and point to plants you can actually buy.</p>
                <div className="doc-chat__suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)} disabled={busy}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) =>
              msg.role === 'user' ? (
                <div key={i} className="doc-chat__user">{msg.text}</div>
              ) : (
                <div key={i} className="doc-chat__assistant">
                  {msg.error ? (
                    <p className="doc-chat__error">Could not answer: {msg.error}</p>
                  ) : (
                    <>
                      {msg.text ? (
                        <Answer text={msg.text} />
                      ) : (
                        <p className="doc-chat__answer">{busy && i === messages.length - 1 ? 'Searching…' : ''}</p>
                      )}

                      {msg.products && msg.products.length > 0 && (
                        <details className="doc-chat__recs">
                          <summary>See recommendations ({msg.products.length})</summary>
                        <div className="doc-chat__products">
                          {msg.products.map((p) => (
                            <Link key={p.id} to={`/product/${p.id}`} className="chat-product" onClick={() => setOpen(false)}>
                              {p.image_url ? (
                                <img src={p.image_url} alt="" className="chat-product__img" loading="lazy" />
                              ) : (
                                <span className="chat-product__img chat-product__img--empty" />
                              )}
                              <span className="chat-product__body">
                                <span className="chat-product__name">{p.name}</span>
                                <span className="chat-product__meta">
                                  {SUN_LABEL[p.sun] ?? p.sun} · {WATER_LABEL[p.water] ?? p.water}
                                </span>
                                <span className="chat-product__price">${p.price?.toFixed(2)}</span>
                              </span>
                            </Link>
                          ))}
                        </div>
                        </details>
                      )}

                      {msg.passages && msg.passages.length > 0 && (
                        <details className="doc-chat__sources">
                          <summary>{msg.passages.length} source{msg.passages.length > 1 ? 's' : ''}</summary>
                          {msg.passages.map((p, j) => (
                            <div key={j} className="doc-chat__passage">
                              <div className="doc-chat__passage-head">
                                <span className="doc-chat__doc">{p.doc ?? 'Reference'}</span>
                                {p.page && <span className="doc-chat__page">p. {p.page}</span>}
                                <span className="doc-chat__kind">{p.kind === 'semantic' ? 'by meaning' : 'by exact terms'}</span>
                              </div>
                              <p>{p.text.replace(/<!--\s*page\s+\d+\s*-->/g, '').trim()}</p>
                            </div>
                          ))}
                        </details>
                      )}
                    </>
                  )}
                </div>
              )
            )}
          </div>

          <form
            className="doc-chat__composer"
            onSubmit={(e) => { e.preventDefault(); ask(input); }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about plants"
              disabled={busy}
              aria-label="Ask about plants"
            />
            <button type="submit" className="btn btn--primary" disabled={busy || !input.trim()}>
              {busy ? '…' : 'Ask'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
