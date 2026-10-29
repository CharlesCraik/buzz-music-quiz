import { baseResults, shuffle, type Ctx, type RoundHandler } from '../ctx';
import { cappedPenalty } from '../scoring';
import type { BingoCell, BingoQState } from '../state';
import type { Track } from '../types';

export const CARD_SIZE = 9;
export const BINGO_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
export const BINGO_POINTS = { tick: 50, miss: 25, line: 50, firstLine: 200, fullCard: 500 };

const INTRO_GAP_MS = 2000;
const BETWEEN_CLIPS_MS = 3000;

export function completedLines(marks: number[]): number {
  return BINGO_LINES.filter((line) => line.every((c) => marks.includes(c))).length;
}

function toCell(t: Track): BingoCell {
  return { trackId: t.id, title: t.title, artist: t.artists.join(', ') };
}

function dealCard(ctx: Ctx, pool: Track[]): BingoCell[] {
  return shuffle(pool, ctx.rng).slice(0, CARD_SIZE).map(toCell);
}

export function playedIds(q: BingoQState): string[] {
  return q.playOrder.slice(0, q.clipIndex + 1);
}

export const musicBingo: RoundHandler<BingoQState> = {
  questionCount(plan) {
    return plan.tracks.length >= CARD_SIZE ? 1 : 0;
  },

  start(ctx, plan) {
    const pool = plan.tracks;
    const cards: Record<string, BingoCell[]> = {};
    const marks: Record<string, number[]> = {};
    const misses: Record<string, number[]> = {};
    for (const p of ctx.s.players) {
      cards[p.id] = dealCard(ctx, pool);
      marks[p.id] = [];
      misses[p.id] = [];
    }
    const clips = Math.min(Math.max(1, ctx.s.settings.bingoClips), pool.length);
    return {
      kind: 'musicBingo',
      qid: ctx.newId(),
      question: null,
      startedAt: ctx.now,
      deadline: null,
      durationMs: ctx.t(ctx.s.settings.bingoClipMs),
      deltas: {},
      correct: {},
      done: false,
      pool,
      cards,
      marks,
      misses,
      playOrder: shuffle(pool, ctx.rng)
        .slice(0, clips)
        .map((t) => t.id),
      clipIndex: -1,
      clipEndsAt: null,
      gapUntil: ctx.now + INTRO_GAP_MS,
      lineWinner: null,
      fullWinner: null,
      linesAwarded: {},
    };
  },

  onLateJoin(ctx, q, playerId) {
    if (q.cards[playerId]) return;
    q.cards[playerId] = dealCard(ctx, q.pool);
    q.marks[playerId] = [];
    q.misses[playerId] = [];
  },

  action(ctx, q, env) {
    const a = env.action;
    const pid = env.playerId;
    if (q.done || a.kind !== 'tick' || a.qid !== q.qid) return;
    const card = q.cards[pid];
    if (!card || a.cell < 0 || a.cell >= card.length) return;
    const marks = q.marks[pid];
    if (marks.includes(a.cell)) return;

    const cell = card[a.cell];
    if (!playedIds(q).includes(cell.trackId)) {
      if (q.misses[pid].includes(a.cell)) return;
      q.misses[pid].push(a.cell);
      ctx.award(pid, cappedPenalty(ctx.s, pid, BINGO_POINTS.miss), 'bingo miss');
      ctx.sfx('wrong');
      return;
    }

    marks.push(a.cell);
    q.misses[pid] = q.misses[pid].filter((c) => c !== a.cell);
    ctx.award(pid, BINGO_POINTS.tick, 'bingo tick');
    ctx.sfx('lockIn');

    const lines = completedLines(marks);
    const before = q.linesAwarded[pid] ?? 0;
    if (lines > before) {
      q.linesAwarded[pid] = lines;
      ctx.award(pid, BINGO_POINTS.line * (lines - before), 'bingo line');
      if (!q.lineWinner) {
        q.lineWinner = pid;
        ctx.award(pid, BINGO_POINTS.firstLine, 'first line');
      }
      ctx.sfx('bingo');
    }
    if (marks.length === card.length && !q.fullWinner) {
      q.fullWinner = pid;
      ctx.award(pid, BINGO_POINTS.fullCard, 'full card');
      q.done = true;
    }
  },

  tick(ctx, q) {
    if (q.done) return;
    if (q.clipEndsAt !== null && ctx.now >= q.clipEndsAt) {
      q.clipEndsAt = null;
      q.deadline = null;
      q.gapUntil = ctx.now + BETWEEN_CLIPS_MS;
      ctx.fx.push({ type: 'stopAudio' });
      return;
    }
    if (q.gapUntil !== null && ctx.now >= q.gapUntil) {
      q.gapUntil = null;
      q.clipIndex += 1;
      if (q.clipIndex >= q.playOrder.length) {
        q.clipIndex = q.playOrder.length - 1;
        q.done = true;
        return;
      }
      const track = q.pool.find((t) => t.id === q.playOrder[q.clipIndex]);
      if (track) {
        const len = track.durationMs ?? 180_000;
        const startMs = Math.max(0, Math.min(len - q.durationMs - 5000, Math.round(len * 0.3)));
        ctx.fx.push({ type: 'play', uri: track.uri, startMs, durationMs: q.durationMs });
      }
      q.clipEndsAt = ctx.now + q.durationMs;
      q.deadline = q.clipEndsAt;
    }
  },

  reveal(ctx, q) {
    const full = ctx.s.players.find((p) => p.id === q.fullWinner);
    const line = ctx.s.players.find((p) => p.id === q.lineWinner);
    return {
      headline: full
        ? `FULL HOUSE! ${full.name} wins Bingo!`
        : line
          ? `${line.name} got the first line!`
          : 'No lines this time!',
      correctOptionId: null,
      correctText: null,
      explanation: null,
      trackTitle: null,
      artist: null,
      results: baseResults(ctx, q),
      playedTracks: playedIds(q)
        .map((id) => q.pool.find((t) => t.id === id))
        .filter((t): t is Track => !!t)
        .map((t) => ({ title: t.title, artist: t.artists.join(', ') })),
    };
  },
};
