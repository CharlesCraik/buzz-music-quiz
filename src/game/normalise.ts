/** Normalise free-text answers for matching against accepted answers. */
export function normaliseAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*[([].*?[)\]]\s*/g, ' ')
    .replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/^(the|a|an) /, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesAccepted(answer: string, accepted: string[]): boolean {
  const n = normaliseAnswer(answer);
  if (!n) return false;
  return accepted.some((a) => normaliseAnswer(a) === n);
}
