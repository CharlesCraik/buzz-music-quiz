import { MAX_NAME_LENGTH } from './types';

/** Strip control chars/markup-ish characters, collapse whitespace and cap length. */
export function sanitiseName(raw: string): string {
  const cleaned = raw
    .normalize('NFC')
    .replace(/\p{Cc}/gu, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const capped = Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('').trim();
  return capped || 'Player';
}

/** Distinguish duplicates with a small number: "Sam", "Sam 2", "Sam 3". */
export function uniqueName(name: string, existing: string[]): string {
  const lower = new Set(existing.map((n) => n.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  for (let i = 2; i < 100; i++) {
    const suffix = ` ${i}`;
    const base = Array.from(name).slice(0, MAX_NAME_LENGTH - suffix.length).join('');
    const candidate = `${base}${suffix}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
  return name;
}
