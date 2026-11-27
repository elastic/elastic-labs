/** Credentials for login — wire to your API when ready. */
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

/** Shape you can map from your auth API response later. */
export interface AuthSession {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

export interface AuthApiError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

export type AuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AuthApiError };

export interface PublicUserRef {
  id: string;
  displayName: string;
}

export interface PhotoSummary {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  uploader: PublicUserRef;
  uploadedAt: string;
  commentCount: number;
}

export interface Comment {
  id: string;
  photoId: string;
  body: string;
  createdAt: string;
  author: PublicUserRef;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface PhotoDetail extends PhotoSummary {
  comments: Paginated<Comment>;
}

export interface CreateCommentRequest {
  body: string;
}