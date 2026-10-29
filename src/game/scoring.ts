import type { GameState, ScoreEvent } from './state';

export function totals(events: ScoreEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) out[e.playerId] = (out[e.playerId] ?? 0) + e.delta;
  return out;
}

export function scoreOf(s: GameState, playerId: string): number {
  let sum = 0;
  for (const e of s.scoreEvents) if (e.playerId === playerId) sum += e.delta;
  return sum;
}

/** Penalty that never takes a player below zero (family friendly). */
export function cappedPenalty(s: GameState, playerId: string, penalty: number): number {
  return -Math.min(penalty, Math.max(0, scoreOf(s, playerId)));
}

export interface Standing {
  playerId: string;
  score: number;
  rank: number;
}

/** Dense-ish ranking: ties share a rank. */
export function standings(s: GameState): Standing[] {
  const t = totals(s.scoreEvents);
  const rows = s.players
    .map((p) => ({ playerId: p.id, score: t[p.id] ?? 0, joinedAt: p.joinedAt }))
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  let rank = 0;
  let prev: number | null = null;
  return rows.map((r, i) => {
    if (r.score !== prev) rank = i + 1;
    prev = r.score;
    return { playerId: r.playerId, score: r.score, rank };
  });
}
