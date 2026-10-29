import type { EnginePlayer, GameState, QState, RevealInfo } from './state';
import type { ActionEnvelope, Effect, RoundPlan, SfxName } from './types';

export type Rng = () => number;

/** Mutable helper passed to round handlers during a single reduce step. */
export interface Ctx {
  s: GameState;
  /** Game clock (wall time minus paused time). */
  now: number;
  rng: Rng;
  fx: Effect[];
  award(playerId: string, delta: number, reason: string): void;
  sfx(name: SfxName): void;
  connected(): EnginePlayer[];
  /** Scale a duration by the accessibility timer multiplier. */
  t(ms: number): number;
  newId(): string;
}

export function makeCtx(s: GameState, now: number, rng: Rng): Ctx {
  const fx: Effect[] = [];
  let idCounter = 0;
  return {
    s,
    now,
    rng,
    fx,
    award(playerId, delta, reason) {
      if (!delta) return;
      s.scoreEvents.push({ playerId, delta, reason, at: now });
      if (s.q) s.q.deltas[playerId] = (s.q.deltas[playerId] ?? 0) + delta;
    },
    sfx(name) {
      fx.push({ type: 'sfx', name });
    },
    connected() {
      return s.players.filter((p) => p.connected);
    },
    t(ms) {
      return Math.round(ms * s.settings.timerMultiplier);
    },
    newId() {
      idCounter += 1;
      return `q${s.gameNumber}-${s.roundIndex}-${s.questionIndex}-${Math.floor(rng() * 1e9).toString(36)}${idCounter}`;
    },
  };
}

export interface RoundHandler<Q extends QState = QState> {
  /** Number of "questions" this round runs for the given plan. */
  questionCount(plan: RoundPlan, ctx: Ctx): number;
  start(ctx: Ctx, plan: RoundPlan, questionIndex: number): Q;
  action(ctx: Ctx, q: Q, env: ActionEnvelope): void;
  tick(ctx: Ctx, q: Q): void;
  reveal(ctx: Ctx, q: Q): RevealInfo;
  /** Called when a player joins mid-question (e.g. deal a bingo card). */
  onLateJoin?(ctx: Ctx, q: Q, playerId: string): void;
  /** The clip requested by this question is now audible (or the host skipped the music): start timers. */
  onAudioStarted?(ctx: Ctx, q: Q): void;
}

/** Audio fields for a question with no music. */
export function noAudio() {
  return {
    audio: 'none' as const,
    audioKey: null,
    audioSince: null,
    audioError: null,
    audioRequested: false,
    clip: null,
  };
}

/** How long a question is on screen before its music is requested. */
export const QUESTION_SHOW_MS = 1500;

/**
 * Ask the host to play a clip; the question waits in 'loading' until the host confirms.
 * By default the request is held for QUESTION_SHOW_MS so the question is on screen
 * before any music is heard (the engine tick sends it).
 */
export function requestClip(
  ctx: Ctx,
  q: QState,
  uri: string,
  startMs: number,
  durationMs: number,
  delayMs = QUESTION_SHOW_MS,
) {
  q.clip = { uri, startMs, durationMs };
  q.audio = 'loading';
  q.audioError = null;
  q.audioKey = `${q.qid}:${ctx.newId()}`;
  q.audioSince = ctx.now + delayMs;
  q.audioRequested = false;
  if (delayMs <= 0) sendClip(ctx, q);
}

/** Emit the play effect for a pending clip. */
export function sendClip(ctx: Ctx, q: QState) {
  if (!q.clip || !q.audioKey) return;
  q.audioRequested = true;
  q.audioSince = ctx.now;
  ctx.fx.push({ type: 'play', key: q.audioKey, uri: q.clip.uri, startMs: q.clip.startMs, durationMs: q.clip.durationMs });
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function baseResults(ctx: Ctx, q: QState) {
  return ctx.s.players.map((p) => ({
    playerId: p.id,
    correct: p.id in q.correct ? q.correct[p.id] : null,
    delta: q.deltas[p.id] ?? 0,
  }));
}

export function optionText(q: QState): string | null {
  const question = q.question;
  if (!question) return null;
  return question.options.find((o) => o.id === question.correctOptionId)?.text ?? null;
}

/** Update streaks based on the question's correctness map. */
export function applyStreaks(ctx: Ctx, q: QState) {
  for (const p of ctx.s.players) {
    if (q.correct[p.id] === true) p.streak += 1;
    else if (q.correct[p.id] === false) p.streak = 0;
  }
}
