import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { config } from '../config.js';

export function generateSalt() {
  return crypto.randomBytes(24).toString('base64url');
}

export async function hashPassword(password, salt) {
  return bcrypt.hash(password + salt, config.bcryptRounds);
}

export async function verifyPassword(password, salt, passwordHash) {
  return bcrypt.compare(password + salt, passwordHash);
}

export function generateSessionToken() {
  return crypto.randomBytes(48).toString('hex');
}
