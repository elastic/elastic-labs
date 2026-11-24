import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { getPool, toIso } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import {
  bufferToDataUrl,
  isAllowedMime,
  makeThumbnail,
} from '../utils/images.js';

function mapSummary(row) {
  return {
    id: row.id,
    author: row.author,
    thumbnailBase64: row.thumbnail_base64,
    createdAt: toIso(row.created_at),
  };
}

function mapDetail(row) {
  return {
    id: row.id,
    author: row.author,
    base64: row.base64,
    createdAt: toIso(row.created_at),
  };
}

async function getOwnedPicture(pool, pictureId, userId) {
  const [rows] = await pool.query(
    `SELECT * FROM pictures WHERE id = ? AND owner_user_id = ? AND deleted = 0`,
    [pictureId, userId],
  );
  return rows[0] || null;
}

export const picsRouter = Router();
picsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

picsRouter.get('/pics', async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, author, thumbnail_base64, created_at
     FROM pictures
     WHERE owner_user_id = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [req.auth.userId],
  );
  res.json(rows.map(mapSummary));
});

picsRouter.get('/pics/:id', async (req, res) => {
  const pool = getPool();
  const row = await getOwnedPicture(pool, req.params.id, req.auth.userId);
  if (!row) {
    return res.status(404).json({ message: 'Not found' });
  }
  res.json(mapDetail(row));
});

picsRouter.post('/pics', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      message: 'Validation error',
      errors: [{ field: 'image', message: 'the image field is required' }],
    });
  }
  const mime = req.file.mimetype;
  if (!isAllowedMime(mime)) {
    return res.status(400).json({
      message: 'Validation error',
      errors: [{ field: 'image', message: 'the image field has an invalid type' }],
    });
  }

  const base64 = await bufferToDataUrl(req.file.buffer, mime);
  const thumbnailBase64 = await makeThumbnail(req.file.buffer, mime);
  const id = crypto.randomUUID();
  const pool = getPool();

  await pool.query(
    `INSERT INTO pictures (id, owner_user_id, author, base64, thumbnail_base64)
     VALUES (?, ?, ?, ?, ?)`,
    [id, req.auth.userId, req.auth.username, base64, thumbnailBase64],
  );

  res.status(201).json({
    id,
    author: req.auth.username,
    thumbnailBase64,
    createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
  });
});

picsRouter.delete('/pics/:id', async (req, res) => {
  const pool = getPool();
  const row = await getOwnedPicture(pool, req.params.id, req.auth.userId);
  if (!row) {
    return res.status(404).json({ message: 'Not found' });
  }
  await pool.query(`UPDATE pictures SET deleted = 1 WHERE id = ?`, [req.params.id]);
  res.status(204).send();
});

picsRouter.get('/users/:userId/pics', async (req, res) => {
  const pool = getPool();
  const [userRows] = await pool.query(`SELECT id FROM users WHERE id = ?`, [
    req.params.userId,
  ]);
  if (userRows.length === 0) {
    return res.status(404).json({ message: 'Not found' });
  }

  const [rows] = await pool.query(
    `SELECT id, author, thumbnail_base64, created_at
     FROM pictures
     WHERE owner_user_id = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [req.params.userId],
  );
  res.json(rows.map(mapSummary));
});

picsRouter.get('/users/:userId/pics/:picId', async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT p.* FROM pictures p
     JOIN users u ON u.id = p.owner_user_id
     WHERE p.id = ? AND p.owner_user_id = ? AND p.deleted = 0`,
    [req.params.picId, req.params.userId],
  );
  if (rows.length === 0) {
    return res.status(404).json({ message: 'Not found' });
  }
  res.json(mapDetail(rows[0]));
});

export { getOwnedPicture };
