import mysql from 'mysql2/promise';
import { config } from './config.js';

let pool;

export async function initDb() {
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      pool = mysql.createPool({
        ...config.mysql,
        waitForConnections: true,
        connectionLimit: 10,
        dateStrings: true,
      });
      await pool.query('SELECT 1');
      return pool;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export function getPool() {
  if (!pool) throw new Error('Database not initialized');
  return pool;
}

export function toIso(dt) {
  if (!dt) return null;
  const d = dt instanceof Date ? dt : new Date(dt);
  if (Number.isNaN(d.getTime())) return String(dt);
  return d.toISOString().replace(/\.\d{3}Z$/, (m) => m.slice(0, 4) + 'Z');
}
