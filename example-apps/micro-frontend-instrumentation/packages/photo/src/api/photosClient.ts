import type { Comment, PhotoDetail } from "@mfe/contracts";

const API_BASE_URL = (
  process.env.API_URL ??
  process.env.AUTH_API_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

export interface PhotosApiError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

export type PhotosResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PhotosApiError };

export async function fetchPhotoDetail(
  photoId: string,
  commentPage = 1,
  commentPageSize = 100
): Promise<PhotosResult<PhotoDetail>> {
  const url = new URL(`${API_BASE_URL}/photos/${encodeURIComponent(photoId)}`);
  url.searchParams.set("commentPage", String(commentPage));
  url.searchParams.set("commentPageSize", String(commentPageSize));

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
  } catch {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: `Could not reach API at ${API_BASE_URL}.`,
      },
    };
  }

  let payload: PhotoDetail | PhotosApiError | null = null;
  try {
    payload = (await response.json()) as PhotoDetail | PhotosApiError;
  } catch {
    payload = null;
  }

  if (response.ok && payload && "comments" in payload) {
    return { ok: true, data: payload };
  }

  if (payload && "code" in payload && "message" in payload) {
    return { ok: false, error: payload };
  }

  return {
    ok: false,
    error: {
      code: response.status === 404 ? "PHOTO_NOT_FOUND" : "UNKNOWN_ERROR",
      message:
        response.status === 404
          ? "Photo not found."
          : `Request failed (${response.status}).`,
    },
  };
}

export async function createPhotoComment(
  photoId: string,
  body: string,
  accessToken: string
): Promise<PhotosResult<Comment>> {
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/photos/${encodeURIComponent(photoId)}/comments`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ body }),
      }
    );
  } catch {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: `Could not reach API at ${API_BASE_URL}.`,
      },
    };
  }

  let payload: Comment | PhotosApiError | null = null;
  try {
    payload = (await response.json()) as Comment | PhotosApiError;
  } catch {
    payload = null;
  }

  if (response.ok && payload && "body" in payload && "author" in payload) {
    return { ok: true, data: payload };
  }

  if (payload && "code" in payload && "message" in payload) {
    return { ok: false, error: payload };
  }

  return {
    ok: false,
    error: {
      code: "UNKNOWN_ERROR",
      message: `Request failed (${response.status}).`,
    },
  };
}