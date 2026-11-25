import React, { useCallback, useEffect, useState } from "react";
import type { PhotoSummary } from "@mfe/contracts";
import { fetchPhotoPage } from "../api/photosClient";

const PAGE_SIZE = 20;

function formatUploadedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function PhotoGalleryPage() {
  const [photos, setPhotos] = useState<PhotoSummary[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (nextPage: number, append: boolean) => {
    const result = await fetchPhotoPage(nextPage, PAGE_SIZE);
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }

    setError(null);
    setPage(result.data.page);
    setTotalPages(result.data.totalPages);
    setPhotos((current) =>
      append ? [...current, ...result.data.items] : result.data.items
    );
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadFirst() {
      setInitialLoading(true);
      const result = await fetchPhotoPage(1, PAGE_SIZE);
      if (cancelled) {
        return;
      }
      setInitialLoading(false);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setPhotos(result.data.items);
      setPage(result.data.page);
      setTotalPages(result.data.totalPages);
    }

    void loadFirst();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onLoadMore() {
    if (loadingMore || page >= totalPages) {
      return;
    }
    setLoadingMore(true);
    await loadPage(page + 1, true);
    setLoadingMore(false);
  }

  const hasMore = totalPages > 0 && page < totalPages;

  return (
    <section className="photo-gallery">
      <header className="photo-gallery-header">
        <h1>Photos</h1>
        <p className="photo-gallery-lead">
          Community uploads — newest first. Sign in from the shell to comment on
          a photo (detail view coming next).
        </p>
      </header>

      {initialLoading ? (
        <p className="photo-gallery-status" role="status">
          Loading photos…
        </p>
      ) : null}

      {!initialLoading && error ? (
        <p className="photo-gallery-error" role="alert">
          {error}
        </p>
      ) : null}

      {!initialLoading && !error && photos.length === 0 ? (
        <div className="photo-gallery-empty">
          <p>No photos yet.</p>
          <p className="photo-gallery-empty-hint">
            When photos are uploaded they will appear here.
          </p>
        </div>
      ) : null}

      {!initialLoading && photos.length > 0 ? (
        <>
          <ul className="photo-grid">
            {photos.map((photo) => (
              <li key={photo.id} className="photo-card">
                <a
                  href={photo.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="photo-card-media"
                >
                  <img
                    src={photo.thumbnailUrl}
                    alt={photo.title}
                    loading="lazy"
                    width={400}
                    height={267}
                  />
                </a>
                <div className="photo-card-body">
                  <h2 className="photo-card-title">{photo.title}</h2>
                  <p className="photo-card-meta">
                    <span>{photo.uploader.displayName}</span>
                    <span aria-hidden="true"> · </span>
                    <time dateTime={photo.uploadedAt}>
                      {formatUploadedAt(photo.uploadedAt)}
                    </time>
                  </p>
                  <p className="photo-card-comments">
                    {photo.commentCount === 1
                      ? "1 comment"
                      : `${photo.commentCount} comments`}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {hasMore ? (
            <div className="photo-gallery-more">
              <button
                type="button"
                className="photo-gallery-more-btn"
                onClick={() => void onLoadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}