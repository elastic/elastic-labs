const API_BASE = import.meta.env.VITE_PUBLIC_API_PREFIX || '/api';
const TOKEN_KEY = 'elaspic_token';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

async function parseJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await parseJson(res);
  if (!res.ok) {
    const err = new Error(data?.message || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { res, data };
}

export const api = {
  register: (body) => apiFetch('/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => apiFetch('/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => apiFetch('/logout', { method: 'POST' }),
  me: () => apiFetch('/me'),
  users: () => apiFetch('/users'),
  pics: () => apiFetch('/pics'),
  pic: (id) => apiFetch(`/pics/${id}`),
  uploadPic: (file) => {
    const fd = new FormData();
    fd.append('image', file);
    return apiFetch('/pics', { method: 'POST', body: fd });
  },
  deletePic: (id) => apiFetch(`/pics/${id}`, { method: 'DELETE' }),
  userPics: (userId) => apiFetch(`/users/${userId}/pics`),
  userPic: (userId, picId) => apiFetch(`/users/${userId}/pics/${picId}`),
  comments: (picId) => apiFetch(`/pics/${picId}/comments`),
  postComment: (picId, comment) =>
    apiFetch(`/pics/${picId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),
  putComment: (picId, commentId, comment) =>
    apiFetch(`/pics/${picId}/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ comment }),
    }),
  deleteComment: (picId, commentId) =>
    apiFetch(`/pics/${picId}/comments/${commentId}`, { method: 'DELETE' }),
  userComments: (userId, picId) =>
    apiFetch(`/users/${userId}/pics/${picId}/comments`),
  postUserComment: (userId, picId, comment) =>
    apiFetch(`/users/${userId}/pics/${picId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),
  putUserComment: (userId, picId, commentId, comment) =>
    apiFetch(`/users/${userId}/pics/${picId}/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ comment }),
    }),
  deleteUserComment: (userId, picId, commentId) =>
    apiFetch(`/users/${userId}/pics/${picId}/comments/${commentId}`, {
      method: 'DELETE',
    }),
};
