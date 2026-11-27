export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

export interface AuthSuccessBody {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

export interface StoredUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
}