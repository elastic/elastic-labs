'use client';

import { useState, useCallback, useEffect } from 'react';
import indexDefinition from '@/data/index-mapping.json';

const INDEX_NAME = process.env.NEXT_PUBLIC_ELASTICSEARCH_INDEX || 'amazon-electronics';
const MAPPING_FILE = 'data/index-mapping.json';

const TABS = {
  settings: {
    label: 'Settings',
    content: indexDefinition.settings,
  },
  mappings: {
    label: 'Mappings',
    content: indexDefinition.mappings,
  },
};

export default function IndexSettingsButton() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('settings');

  const close = useCallback(() => {
    setOpen(false);
    setActiveTab('settings');
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

  const tab = TABS[activeTab] || TABS.settings;

  return (
    <>
      <button
        type="button"
        className="index-settings-btn"
        onClick={() => setOpen(true)}
        aria-label="View index settings and mappings"
        title="Index settings & mappings"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.488.488 0 0 0-.47-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
          />
        </svg>
      </button>

      {open && (
        <div className="query-preview-modal" role="presentation" onClick={close}>
          <div
            className="query-preview-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="index-settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="query-preview-modal__head">
              <div>
                <h3 id="index-settings-title">Index configuration</h3>
                <p className="query-preview-modal__file">
                  {INDEX_NAME} · {MAPPING_FILE}
                </p>
              </div>
              <button
                type="button"
                className="query-preview-modal__close"
                onClick={close}
                aria-label="Close index configuration"
              >
                ×
              </button>
            </div>

            <div className="query-preview-modal__tabs">
              {Object.entries(TABS).map(([key, { label }]) => (
                <button
                  key={key}
                  type="button"
                  className={`query-preview-modal__tab${activeTab === key ? ' is-active' : ''}`}
                  onClick={() => setActiveTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <pre className="query-preview-modal__code">
              <code>{JSON.stringify(tab.content, null, 2)}</code>
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
