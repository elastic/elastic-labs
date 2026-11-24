import { Router } from 'express';
import crypto from 'crypto';
import { getPool, toIso } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateCommentBody } from '../utils/validation.js';
import { getOwnedPicture } from './pics.js';

function mapComment(row) {
  return {
    id: row.id,
    author: row.author,
    picture: row.picture_id,
    comment: row.comment_text,
    createdAt: toIso(row.created_at),
  };
}

async function getPictureForUser(pool, pictureId, ownerUserId) {
  const [rows] = await pool.query(
    `SELECT id FROM pictures WHERE id = ? AND owner_user_id = ? AND deleted = 0`,
    [pictureId, ownerUserId],
  );
  return rows[0] || null;
}

export const commentsRouter = Router();
commentsRouter.use(requireAuth);

// Own pictures: /pics/:pictureId/comments
commentsRouter.get('/pics/:pictureId/comments', async (req, res) => {
  const pool = getPool();
  const pic = await getOwnedPicture(pool, req.params.pictureId, req.auth.userId);
  if (!pic) {
    return res.status(404).json({ message: 'Not found' });
  }
  const [rows] = await pool.query(
    `SELECT id, author, picture_id, comment_text, created_at
     FROM comments
     WHERE picture_id = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [req.params.pictureId],
  );
  res.json(rows.map(mapComment));
});

commentsRouter.post('/pics/:pictureId/comments', async (req, res) => {
  const pool = getPool();
  const pic = await getOwnedPicture(pool, req.params.pictureId, req.auth.userId);
  if (!pic) {
    return res.status(404).json({ message: 'Not found' });
  }
  const { errors, comment } = validateCommentBody(req.body);
  if (errors.length) {
    return res.status(400).json({ message: 'Validation error', errors });
  }

  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO comments (id, picture_id, author, comment_text) VALUES (?, ?, ?, ?)`,
    [id, req.params.pictureId, req.auth.username, comment],
  );

  res.status(201).json({
    id,
    author: req.auth.username,
    picture: req.params.pictureId,
    comment,
    createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
  });
});

commentsRouter.put('/pics/:pictureId/comments/:commentId', async (req, res) => {
  const pool = getPool();
  const pic = await getOwnedPicture(pool, req.params.pictureId, req.auth.userId);
  if (!pic) {
    return res.status(404).json({ message: 'Not found' });
  }
  const { errors, comment } = validateCommentBody(req.body);
  if (errors.length) {
    return res.status(400).json({ message: 'Validation error', errors });
  }

  const [rows] = await pool.query(
    `SELECT id FROM comments
     WHERE id = ? AND picture_id = ? AND author = ? AND deleted = 0`,
    [req.params.commentId, req.params.pictureId, req.auth.username],
  );
  if (rows.length === 0) {
    return res.status(404).json({ message: 'Not found' });
  }

  await pool.query(`UPDATE comments SET comment_text = ? WHERE id = ?`, [
    comment,
    req.params.commentId,
  ]);

  const [updated] = await pool.query(
    `SELECT id, author, picture_id, comment_text, created_at FROM comments WHERE id = ?`,
    [req.params.commentId],
  );
  res.json(mapComment(updated[0]));
});

commentsRouter.delete('/pics/:pictureId/comments/:commentId', async (req, res) => {
  const pool = getPool();
  const pic = await getOwnedPicture(pool, req.params.pictureId, req.auth.userId);
  if (!pic) {
    return res.status(404).json({ message: 'Not found' });
  }

  const [rows] = await pool.query(
    `SELECT id FROM comments
     WHERE id = ? AND picture_id = ? AND author = ? AND deleted = 0`,
    [req.params.commentId, req.params.pictureId, req.auth.username],
  );
  if (rows.length === 0) {
    return res.status(404).json({ message: 'Not found' });
  }

  await pool.query(
    `UPDATE comments SET deleted = 1, comment_text = NULL WHERE id = ?`,
    [req.params.commentId],
  );
  res.status(204).send();
});

// Other users' pictures
commentsRouter.get('/users/:userId/pics/:picId/comments', async (req, res) => {
  const pool = getPool();
  const pic = await getPictureForUser(pool, req.params.picId, req.params.userId);
  if (!pic) {
    return res.status(404).json({ message: 'Not found' });
  }
  const [rows] = await pool.query(
    `SELECT id, author, picture_id, comment_text, created_at
     FROM comments
     WHERE picture_id = ? AND deleted = 0
     ORDER BY created_at DESC`,
    [req.params.picId],
  );
  res.json(rows.map(mapComment));
});

commentsRouter.post('/users/:userId/pics/:picId/comments', async (req, res) => {
  const pool = getPool();
  const pic = await getPictureForUser(pool, req.params.picId, req.params.userId);
  if (!pic) {
    return res.status(404).json({ message: 'Not found' });
  }
  const { errors, comment } = validateCommentBody(req.body);
  if (errors.length) {
    return res.status(400).json({ message: 'Validation error', errors });
  }

  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO comments (id, picture_id, author, comment_text) VALUES (?, ?, ?, ?)`,
    [id, req.params.picId, req.auth.username, comment],
  );

  res.status(201).json({
    id,
    author: req.auth.username,
    picture: req.params.picId,
    comment,
    createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
  });
});

commentsRouter.put(
  '/users/:userId/pics/:picId/comments/:commentId',
  async (req, res) => {
    const pool = getPool();
    const pic = await getPictureForUser(pool, req.params.picId, req.params.userId);
    if (!pic) {
      return res.status(404).json({ message: 'Not found' });
    }
    const { errors, comment } = validateCommentBody(req.body);
    if (errors.length) {
      return res.status(400).json({ message: 'Validation error', errors });
    }

    const [rows] = await pool.query(
      `SELECT id FROM comments
       WHERE id = ? AND picture_id = ? AND author = ? AND deleted = 0`,
      [req.params.commentId, req.params.picId, req.auth.username],
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Not found' });
    }

    await pool.query(`UPDATE comments SET comment_text = ? WHERE id = ?`, [
      comment,
      req.params.commentId,
    ]);

    const [updated] = await pool.query(
      `SELECT id, author, picture_id, comment_text, created_at FROM comments WHERE id = ?`,
      [req.params.commentId],
    );
    res.json(mapComment(updated[0]));
  },
);

commentsRouter.delete(
  '/users/:userId/pics/:picId/comments/:commentId',
  async (req, res) => {
    const pool = getPool();
    const pic = await getPictureForUser(pool, req.params.picId, req.params.userId);
    if (!pic) {
      return res.status(404).json({ message: 'Not found' });
    }

    const [rows] = await pool.query(
      `SELECT id FROM comments
       WHERE id = ? AND picture_id = ? AND author = ? AND deleted = 0`,
      [req.params.commentId, req.params.picId, req.auth.username],
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Not found' });
    }

    await pool.query(
      `UPDATE comments SET deleted = 1, comment_text = NULL WHERE id = ?`,
      [req.params.commentId],
    );
    res.status(204).send();
  },
);
