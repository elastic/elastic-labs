'use client';

import { useState, useCallback, useEffect } from 'react';
import oldQueryTemplate from '@/queries/old-query.json';
import newQueryTemplate from '@/queries/new-query.json';

const TEMPLATES = {
  old: {
    label: 'Old Query',
    filename: 'queries/old-query.json',
    template: oldQueryTemplate,
  },
  new: {
    label: 'New Query',
    filename: 'queries/new-query.json',
    template: newQueryTemplate,
  },
};

export default function QueryPreviewButton({ variant }) {
  const [open, setOpen] = useState(false);
  const config = TEMPLATES[variant] || TEMPLATES.old;

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        className="query-preview-btn"
        onClick={() => setOpen(true)}
        aria-label={`View ${config.label} JSON (${config.filename})`}
        title={`View ${config.filename}`}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15.5h8v1.5H8V15.5zm0-3h8v1.5H8V12.5zm0-3h5v1.5H8V9.5z"
          />
        </svg>
      </button>

      {open && (
        <div className="query-preview-modal" role="presentation" onClick={close}>
          <div
            className="query-preview-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`query-preview-title-${variant}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="query-preview-modal__head">
              <div>
                <h3 id={`query-preview-title-${variant}`}>{config.label}</h3>
                <p className="query-preview-modal__file">{config.filename}</p>
              </div>
              <button
                type="button"
                className="query-preview-modal__close"
                onClick={close}
                aria-label="Close query preview"
              >
                ×
              </button>
            </div>

            <pre className="query-preview-modal__code">
              <code>{JSON.stringify(config.template, null, 2)}</code>
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
