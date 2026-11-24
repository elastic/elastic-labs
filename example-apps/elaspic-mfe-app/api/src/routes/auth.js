import { Router } from 'express';
import crypto from 'crypto';
import { getPool } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import {
  validateLoginBody,
  validateRegisterBody,
} from '../utils/validation.js';
import {
  generateSalt,
  generateSessionToken,
  hashPassword,
  verifyPassword,
} from '../utils/password.js';

export const authRouter = Router();

authRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

authRouter.post('/register', async (req, res) => {
  const { errors, username, email, password } = validateRegisterBody(req.body);
  if (errors.length) {
    return res.status(400).json({ message: 'Validation error', errors });
  }

  const pool = getPool();
  const id = crypto.randomUUID();
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);

  try {
    await pool.query(
      `INSERT INTO users (id, username, email, salt, password_hash) VALUES (?, ?, ?, ?, ?)`,
      [id, username, email, salt, passwordHash],
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'username or email already registered' });
    }
    throw err;
  }

  res.status(201).json({ id, username });
});

authRouter.post('/login', async (req, res) => {
  const { errors, username, password } = validateLoginBody(req.body);
  if (errors.length) {
    return res.status(400).json({ message: 'Validation error', errors });
  }

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, salt, password_hash FROM users WHERE username = ?`,
    [username],
  );
  if (rows.length === 0) {
    return res.status(401).json({ message: 'invalid username or password' });
  }

  const user = rows[0];
  const ok = await verifyPassword(password, user.salt, user.password_hash);
  if (!ok) {
    return res.status(401).json({ message: 'invalid username or password' });
  }

  const token = generateSessionToken();
  const ttl = config.sessionTtlSeconds;
  await pool.query(
    `INSERT INTO session_tokens (token, user_id, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL ? SECOND))`,
    [token, user.id, ttl],
  );

  res.json({ token });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  const pool = getPool();
  await pool.query(`DELETE FROM session_tokens WHERE token = ?`, [req.auth.token]);
  res.status(204).send();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ id: req.auth.userId, username: req.auth.username });
});

authRouter.get('/users', requireAuth, async (_req, res) => {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, username FROM users ORDER BY username ASC`,
  );
  res.json(rows);
});
