const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegisterBody(body) {
  const errors = [];
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!username) {
    errors.push({ field: 'username', message: 'the username field is required' });
  } else if (username.length > 64 || !USERNAME_RE.test(username)) {
    errors.push({ field: 'username', message: 'the username field contains invalid chars' });
  }

  if (!email) {
    errors.push({ field: 'email', message: 'the email field is required' });
  } else if (!EMAIL_RE.test(email)) {
    errors.push({ field: 'email', message: 'the email field is not an email' });
  }

  if (!password) {
    errors.push({ field: 'password', message: 'the password field is required' });
  } else if (password.length < 10) {
    errors.push({ field: 'password', message: 'the password field is too short' });
  }

  return { errors, username, email, password };
}

export function validateLoginBody(body) {
  const errors = [];
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!username) {
    errors.push({ field: 'username', message: 'the username field is required' });
  } else if (!USERNAME_RE.test(username)) {
    errors.push({ field: 'username', message: 'the username field contains invalid chars' });
  }

  if (!password) {
    errors.push({ field: 'password', message: 'the password field is required' });
  }

  return { errors, username, password };
}

export function validateCommentBody(body) {
  const errors = [];
  const raw = typeof body?.comment === 'string' ? body.comment : '';
  const comment = raw.trim();

  if (!comment) {
    errors.push({ field: 'comment', message: 'the comment field is required' });
  } else if (comment.length > 2000) {
    errors.push({ field: 'comment', message: 'the comment field is too long' });
  }

  return { errors, comment };
}
