import sharp from 'sharp';
import { config } from '../config.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isAllowedMime(mime) {
  return ALLOWED.has(mime);
}

export function mimeToDataPrefix(mime) {
  return `data:${mime};base64,`;
}

export async function bufferToDataUrl(buffer, mime) {
  const b64 = buffer.toString('base64');
  return `${mimeToDataPrefix(mime)}${b64}`;
}

export async function makeThumbnail(buffer, mime) {
  const pipeline = sharp(buffer).rotate().resize({
    width: config.thumbnailMaxEdge,
    height: config.thumbnailMaxEdge,
    fit: 'inside',
    withoutEnlargement: true,
  });

  if (mime === 'image/png') {
    const out = await pipeline.png().toBuffer();
    return bufferToDataUrl(out, 'image/png');
  }
  if (mime === 'image/webp') {
    const out = await pipeline.webp({ quality: config.thumbnailQuality }).toBuffer();
    return bufferToDataUrl(out, 'image/webp');
  }
  const out = await pipeline.jpeg({ quality: config.thumbnailQuality }).toBuffer();
  return bufferToDataUrl(out, 'image/jpeg');
}
