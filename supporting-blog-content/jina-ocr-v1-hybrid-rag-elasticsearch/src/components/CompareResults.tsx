import { Link } from 'react-router-dom';
import type { CompareResponse, Product } from '../types/product';

interface Props {
  data: CompareResponse;
  q: string;
}

type Delta =
  | { kind: 'new' }
  | { kind: 'dropped' }
  | { kind: 'same' }
  | { kind: 'moved'; by: number };

function deltaFor(p: Product, index: number, otherPos: Map<string, number>, direction: 'hybrid' | 'fulltext'): Delta {
  const other = otherPos.get(p.id);
  if (other === undefined) return { kind: direction === 'hybrid' ? 'new' : 'dropped' };
  const by = other - (index + 1); // positive = ranks higher here than in the other list
  if (by === 0) return { kind: 'same' };
  return { kind: 'moved', by };
}

function Row({ p, index, delta }: { p: Product; index: number; delta: Delta }) {
  const m = p.match;
  const kind = m?.lexical_rank && m?.semantic_rank ? 'both' : m?.lexical_rank ? 'keyword' : m?.semantic_rank ? 'meaning' : null;
  return (
    <li className={`compare-row compare-row--${delta.kind}`}>
      <span className="compare-row__rank">{index + 1}</span>
      {p.images?.[0] ? (
        <img className="compare-row__thumb" src={p.images[0]} alt="" loading="lazy" />
      ) : (
        <span className="compare-row__thumb compare-row__thumb--empty" />
      )}
      <div className="compare-row__body">
        <Link to={`/product/${p.id}`} className="compare-row__name">{p.name}</Link>
        {kind && (
          <span className={`match-badge match-badge--${kind}`}>
            {kind === 'both' ? 'Keyword + meaning' : kind === 'keyword' ? 'Keyword' : 'Meaning'}
          </span>
        )}
      </div>
      <span className="compare-row__delta">
        {delta.kind === 'new' && <em className="delta delta--new">only here</em>}
        {delta.kind === 'dropped' && <em className="delta delta--dropped">not in hybrid</em>}
        {delta.kind === 'moved' && (
          <em className={`delta ${delta.by > 0 ? 'delta--up' : 'delta--down'}`}>
            {delta.by > 0 ? '▲' : '▼'} {Math.abs(delta.by)}
          </em>
        )}
      </span>
    </li>
  );
}

export default function CompareResults({ data, q }: Props) {
  const ft = data.fulltext.products;
  const hy = data.hybrid.products;
  const ftPos = new Map(ft.map((p, i) => [p.id, i + 1]));
  const hyPos = new Map(hy.map((p, i) => [p.id, i + 1]));
  const { surfaced_by_hybrid, dropped_by_hybrid, reordered } = data.summary;

  return (
    <div className="compare">
      <p className="compare__summary">
        For <strong>“{q}”</strong>: hybrid surfaced <strong>{surfaced_by_hybrid}</strong> plant{surfaced_by_hybrid === 1 ? '' : 's'} full-text
        missed, reordered <strong>{reordered}</strong>, and dropped <strong>{dropped_by_hybrid}</strong> keyword-only match
        {dropped_by_hybrid === 1 ? '' : 'es'}.
      </p>

      <div className="compare__columns">
        <section className="compare__col">
          <header className="compare__head">
            <h2>Full-text</h2>
            <span>{ft.length} result{ft.length === 1 ? '' : 's'} · BM25 keyword scoring</span>
          </header>
          {ft.length === 0 ? (
            <p className="compare__empty">No keyword matches. Full-text needs the words to appear in the text.</p>
          ) : (
            <ol className="compare__list">
              {ft.map((p, i) => (
                <Row key={p.id} p={p} index={i} delta={deltaFor(p, i, hyPos, 'fulltext')} />
              ))}
            </ol>
          )}
        </section>

        <section className="compare__col compare__col--hybrid">
          <header className="compare__head">
            <h2>Hybrid</h2>
            <span>{hy.length} result{hy.length === 1 ? '' : 's'} · keyword + semantic, fused with RRF</span>
          </header>
          {hy.length === 0 ? (
            <p className="compare__empty">No results.</p>
          ) : (
            <ol className="compare__list">
              {hy.map((p, i) => (
                <Row key={p.id} p={p} index={i} delta={deltaFor(p, i, ftPos, 'hybrid')} />
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
