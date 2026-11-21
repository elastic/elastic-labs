import { readFileSync } from 'fs';
import path from 'path';

const MAX_TERM_LENGTH = 200;

export function sanitizeTerm(term) {
  if (typeof term !== 'string') {
    return null;
  }

  const trimmed = term.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, MAX_TERM_LENGTH);
}

export function loadQueryTemplate(filename) {
  const filePath = path.join(process.cwd(), 'queries', filename);
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

export function buildQuery(template, term) {
  const safeTerm = sanitizeTerm(term);
  if (!safeTerm) {
    throw new Error('Search term is required');
  }

  const json = JSON.stringify(template).replaceAll('{{term}}', safeTerm.replace(/\\/g, '\\\\').replace(/"/g, '\\"'));
  const query = JSON.parse(json);
  return { ...query, track_total_hits: true };
}
