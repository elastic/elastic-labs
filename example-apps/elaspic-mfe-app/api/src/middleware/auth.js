import { getPool } from '../db.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const token = header.slice(7).trim();
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT u.id, u.username
     FROM session_tokens st
     JOIN users u ON u.id = st.user_id
     WHERE st.token = ? AND st.expires_at > NOW(3)`,
    [token],
  );
  if (rows.length === 0) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  req.auth = { token, userId: rows[0].id, username: rows[0].username };
  next();
}
