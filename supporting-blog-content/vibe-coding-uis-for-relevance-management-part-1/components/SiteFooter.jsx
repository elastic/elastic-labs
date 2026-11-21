'use client';

export default function SiteFooter() {
  return (
    <footer className="sa-footer">
      <span>
        Built by{' '}
        <a href="https://searchali.com" target="_blank" rel="noopener noreferrer">
          SearchAli
        </a>
      </span>
      <span className="sa-footer__sep">·</span>
      <span>Elasticsearch relevance tuning demo</span>
    </footer>
  );
}
