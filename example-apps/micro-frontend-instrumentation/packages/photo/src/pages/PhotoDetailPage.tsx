import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Comment, PhotoDetail } from "@mfe/contracts";
import { createPhotoComment, fetchPhotoDetail } from "../api/photosClient";
import { readSession } from "../session";

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function PhotoDetailPage() {
  const { photoId: photoIdParam } = useParams();
  const photoId = photoIdParam ?? "";

  const [detail, setDetail] = useState<PhotoDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState(() => readSession());

  const [commentBody, setCommentBody] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    const result = await fetchPhotoDetail(id);
    setLoading(false);
    if (!result.ok) {
      setDetail(null);
      setComments([]);
      setError(result.error.message);
      return;
    }
    setDetail(result.data);
    setComments(result.data.comments.items);
  }, []);

  useEffect(() => {
    if (!photoId) {
      setLoading(false);
      setError("Photo id is missing.");
      return;
    }
    void loadDetail(photoId);
  }, [photoId, loadDetail]);

  useEffect(() => {
    function syncSession() {
      setSession(readSession());
    }
    syncSession();
    window.addEventListener("storage", syncSession);
    window.addEventListener("focus", syncSession);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("focus", syncSession);
    };
  }, []);

  async function onSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!photoId || !session) {
      return;
    }
    setSubmitError(null);
    setFieldErrors({});
    setSubmitting(true);
    const result = await createPhotoComment(
      photoId,
      commentBody,
      session.accessToken
    );
    setSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error.message);
      setFieldErrors(result.error.fieldErrors ?? {});
      return;
    }

    setCommentBody("");
    setComments((prev) => [...prev, result.data]);
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            commentCount: prev.commentCount + 1,
            comments: {
              ...prev.comments,
              totalCount: prev.comments.totalCount + 1,
              items: [...prev.comments.items, result.data],
            },
          }
        : prev
    );
  }

  return (
    <article className="photo-detail">
      <nav className="photo-detail-nav">
        <Link to="/dashboard">← Back to photos</Link>
      </nav>

      {loading ? (
        <p className="photo-detail-status" role="status">
          Loading photo…
        </p>
      ) : null}

      {!loading && error ? (
        <p className="photo-detail-error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && detail ? (
        <>
          <header className="photo-detail-header">
            <h1>{detail.title}</h1>
            <p className="photo-detail-meta">
              <span>{detail.uploader.displayName}</span>
              <span aria-hidden="true"> · </span>
              <time dateTime={detail.uploadedAt}>
                {formatTimestamp(detail.uploadedAt)}
              </time>
            </p>
          </header>

          <figure className="photo-detail-figure">
            <img src={detail.imageUrl} alt={detail.title} />
          </figure>

          <section className="photo-detail-comments" aria-labelledby="comments-heading">
            <h2 id="comments-heading">
              Comments ({detail.commentCount})
            </h2>

            {comments.length === 0 ? (
              <p className="photo-detail-comments-empty">No comments yet.</p>
            ) : (
              <ul className="comment-list">
                {comments.map((comment) => (
                  <li key={comment.id} className="comment-item">
                    <p className="comment-body">{comment.body}</p>
                    <p className="comment-meta">
                      <span>{comment.author.displayName}</span>
                      <span aria-hidden="true"> · </span>
                      <time dateTime={comment.createdAt}>
                        {formatTimestamp(comment.createdAt)}
                      </time>
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {session ? (
              <form className="comment-form" onSubmit={(e) => void onSubmitComment(e)}>
                <label htmlFor="comment-body">Add a comment</label>
                <textarea
                  id="comment-body"
                  name="body"
                  rows={4}
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  disabled={submitting}
                  placeholder="Write your comment…"
                />
                {fieldErrors.body ? (
                  <span className="field-error">{fieldErrors.body}</span>
                ) : null}
                {submitError ? (
                  <p className="comment-form-error" role="alert">
                    {submitError}
                  </p>
                ) : null}
                <button type="submit" disabled={submitting || !commentBody.trim()}>
                  {submitting ? "Posting…" : "Post comment"}
                </button>
              </form>
            ) : (
              <p className="photo-detail-login-prompt">
                <Link
                  to={`/auth/login?returnTo=${encodeURIComponent(
                    `/photo/${photoId}`
                  )}`}
                >
                  Log in to comment
                </Link>
              </p>
            )}
          </section>
        </>
      ) : null}
    </article>
  );
}