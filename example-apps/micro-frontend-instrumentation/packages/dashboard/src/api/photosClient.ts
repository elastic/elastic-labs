import type { Paginated, PhotoSummary } from "@mfe/contracts";

const API_BASE_URL = (
  process.env.API_URL ??
  process.env.AUTH_API_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

export interface PhotosApiError {
  code: string;
  message: string;
}

export type PhotosResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PhotosApiError };

export async function fetchPhotoPage(
  page: number,
  pageSize: number
): Promise<PhotosResult<Paginated<PhotoSummary>>> {
  const url = new URL(`${API_BASE_URL}/photos`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));

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

  let payload: Paginated<PhotoSummary> | PhotosApiError | null = null;
  try {
    payload = (await response.json()) as Paginated<PhotoSummary> | PhotosApiError;
  } catch {
    payload = null;
  }

  if (response.ok && payload && "items" in payload) {
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