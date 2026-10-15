import { useEffect, useRef, useState } from 'react';
import {
  listDocuments,
  subscribeProgress,
  uploadDocument,
  type DocEntry,
  type ProgressEvent,
} from '../lib/docsApi';

interface PageLog {
  page: number;
  chars: number;
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [pageLog, setPageLog] = useState<PageLog[]>([]);
  const [tablePreview, setTablePreview] = useState<{ page: number; html: string } | null>(null);
  const [doneInfo, setDoneInfo] = useState<{ index: string; pages: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => {
    listDocuments().then(setDocs).catch(() => {});
    return () => unsubscribe.current?.();
  }, []);

  function reset() {
    setStatusLines([]);
    setTotalPages(0);
    setCompleted(0);
    setPageLog([]);
    setTablePreview(null);
    setDoneInfo(null);
    setError(null);
  }

  async function handleFile(file: File) {
    reset();
    setRunning(true);
    try {
      const { jobId } = await uploadDocument(file);
      unsubscribe.current = subscribeProgress(jobId, (event: ProgressEvent) => {
        if (event.type === 'status') setStatusLines((s) => [...s, event.message]);
        if (event.type === 'rendered') {
          setTotalPages(event.total);
          setStatusLines((s) => [...s, `${event.total} page${event.total > 1 ? 's' : ''} rendered — sending to jina-ocr-v1 on Elastic Inference Service…`]);
        }
        if (event.type === 'page') {
          setCompleted(event.completed);
          setPageLog((log) => [...log, { page: event.page, chars: event.chars }].slice(-8));
        }
        if (event.type === 'table_preview') setTablePreview({ page: event.page, html: event.html });
        if (event.type === 'done') {
          setDoneInfo({ index: event.index, pages: event.pages });
          setRunning(false);
          listDocuments().then(setDocs).catch(() => {});
        }
        if (event.type === 'error') {
          setError(event.message);
          setRunning(false);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setRunning(false);
    }
  }

  const pct = totalPages ? Math.round((completed / totalPages) * 100) : 0;

  return (
    <div className="docs-page">
      <section className="docs-intro">
        <h1>Plant Documents</h1>
        <p>
          Upload a plant guide, care sheet, or catalog — PDF or photo. Every page is parsed by
          jina-ocr-v1 running on Elastic Inference Service (tables included), then indexed into
          Elasticsearch for hybrid search. Ask it questions with the leaf chat in the corner.
        </p>
      </section>

      <div
        className={`dropzone${dragging ? ' dropzone--active' : ''}${running ? ' dropzone--disabled' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!running) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!running && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
        }}
        onClick={() => !running && fileInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !running && fileInput.current?.click()}
      >
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="m9 15 3 3 3-3" />
        </svg>
        <p className="dropzone__title">{running ? 'Parsing in progress…' : 'Drop a PDF or image here'}</p>
        <p className="dropzone__hint">or click to browse — the index will be named after your file</p>
      </div>

      {(statusLines.length > 0 || totalPages > 0) && (
        <section className="pipeline">
          {statusLines.map((line, i) => (
            <p key={i} className="pipeline__status">{line}</p>
          ))}

          {totalPages > 0 && (
            <>
              <div className="pipeline__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="pipeline__bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="pipeline__count">
                {completed} / {totalPages} pages parsed ({pct}%)
              </p>
              <ul className="pipeline__log" aria-live="polite">
                {pageLog.map((entry) => (
                  <li key={entry.page}>
                    page {entry.page} → {entry.chars.toLocaleString()} characters of Markdown
                  </li>
                ))}
              </ul>
            </>
          )}

          {tablePreview && (
            <div className="table-preview">
              <h3>Table extracted from page {tablePreview.page}</h3>
              <p className="table-preview__caption">
                jina-ocr-v1 reconstructed this as a structured HTML table — values, rows, and headers intact:
              </p>
              <div
                className="table-preview__table"
                dangerouslySetInnerHTML={{ __html: tablePreview.html }}
              />
            </div>
          )}

          {doneInfo && (
            <div className="pipeline__done">
              <h3>Parsing complete — check your Elastic indices!</h3>
              <p>
                All {doneInfo.pages} pages are now in the <code>{doneInfo.index}</code> index, chunked and
                embedded by the semantic_text field. Open the leaf chat in the corner and ask it anything.
              </p>
            </div>
          )}

          {error && (
            <div className="pipeline__error">
              <p>The pipeline stopped: {error}</p>
            </div>
          )}
        </section>
      )}

      <section className="docs-list">
        <h2>Parsed documents</h2>
        {docs.length === 0 ? (
          <p className="docs-list__empty">Nothing parsed yet. Your first upload will appear here.</p>
        ) : (
          <table className="docs-table">
            <thead>
              <tr><th>Document</th><th>Index</th><th>Pages</th><th>Ingested</th></tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.index}>
                  <td>{d.title}</td>
                  <td><code>{d.index}</code></td>
                  <td>{d.page_count}</td>
                  <td>{new Date(d.ingested_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
