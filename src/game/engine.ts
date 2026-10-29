import { makeCtx, type Ctx, type Rng } from './ctx';
import { HANDLERS } from './rounds';
import { sanitiseName, uniqueName } from './names';
import { ALLOWED_TRANSITIONS, type GameState, type Phase, type ReduceResult } from './state';
import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  type ActionEnvelope,
  type EngineEvent,
  type HostCommand,
  type Settings,
} from './types';

const INTRO_MS = 6000;
const REVEAL_MS = 7000;
const BINGO_REVEAL_MS = 12_000;
const ROUND_RESULTS_MS = 9000;
const PROCESSED_KEEP = 500;

export function createGame(roomCode: string, settings: Partial<Settings> = {}): GameState {
  return {
    roomCode,
    seq: 0,
    phase: 'LOBBY',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    players: [],
    pack: null,
    roundIndex: 0,
    questionIndex: 0,
    q: null,
    reveal: null,
    phaseDeadline: null,
    paused: false,
    pausedAt: null,
    pausedTotal: 0,
    scoreEvents: [],
    processed: [],
    lastBuzzSeq: {},
    roundSummaries: [],
    gameNumber: 0,
  };
}

export function gameClock(s: GameState, wallNow: number): number {
  return (s.paused && s.pausedAt !== null ? s.pausedAt : wallNow) - s.pausedTotal;
}

/** Convert a game-clock timestamp to wall-clock time for display. */
export function toWall(s: GameState, gameTime: number | null): number | null {
  return gameTime === null ? null : gameTime + s.pausedTotal;
}

export function canTransition(from: Phase, to: Phase): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function setPhase(ctx: Ctx, to: Phase) {
  if (!canTransition(ctx.s.phase, to)) {
    throw new Error(`Illegal phase transition ${ctx.s.phase} -> ${to}`);
  }
  ctx.s.phase = to;
}

export function roundQuestionCount(s: GameState, roundIndex: number, ctx: Ctx): number {
  const plan = s.pack?.rounds[roundIndex];
  if (!plan) return 0;
  return HANDLERS[plan.type].questionCount(plan, ctx);
}

// ---------- phase steps ----------

function enterRound(ctx: Ctx, from: number) {
  const s = ctx.s;
  const total = s.pack?.rounds.length ?? 0;
  let idx = from;
  while (idx < total && roundQuestionCount(s, idx, ctx) === 0) idx++;
  if (idx >= total) {
    endGame(ctx);
    return;
  }
  setPhase(ctx, 'ROUND_INTRO');
  s.roundIndex = idx;
  s.questionIndex = 0;
  s.q = null;
  s.reveal = null;
  s.phaseDeadline = ctx.now + INTRO_MS;
  s.roundSummaries.push({ roundIndex: idx, type: s.pack!.rounds[idx].type, deltas: {} });
  ctx.sfx('roundIntro');
}

function startQuestion(ctx: Ctx) {
  const s = ctx.s;
  const plan = s.pack!.rounds[s.roundIndex];
  setPhase(ctx, 'QUESTION');
  s.reveal = null;
  s.phaseDeadline = null;
  s.q = HANDLERS[plan.type].start(ctx, plan, s.questionIndex);
}

function finaliseQuestion(ctx: Ctx) {
  const s = ctx.s;
  if (!s.q) return;
  const plan = s.pack!.rounds[s.roundIndex];
  s.reveal = HANDLERS[plan.type].reveal(ctx, s.q);
  const summary = s.roundSummaries[s.roundSummaries.length - 1];
  if (summary) {
    for (const [pid, d] of Object.entries(s.q.deltas)) {
      summary.deltas[pid] = (summary.deltas[pid] ?? 0) + d;
    }
  }
  setPhase(ctx, 'REVEAL');
  s.phaseDeadline = ctx.now + (plan.type === 'musicBingo' ? BINGO_REVEAL_MS : REVEAL_MS);
  ctx.fx.push({ type: 'stopAudio' });
  ctx.sfx('reveal');
}

function afterReveal(ctx: Ctx) {
  const s = ctx.s;
  if (s.questionIndex + 1 < roundQuestionCount(s, s.roundIndex, ctx)) {
    s.questionIndex += 1;
    startQuestion(ctx);
    return;
  }
  setPhase(ctx, 'ROUND_RESULTS');
  s.q = null;
  s.phaseDeadline = ctx.now + ROUND_RESULTS_MS;
  ctx.sfx('fanfare');
}

function endGame(ctx: Ctx) {
  const s = ctx.s;
  if (s.phase !== 'GAME_RESULTS') setPhase(ctx, 'GAME_RESULTS');
  s.q = null;
  s.phaseDeadline = null;
  s.paused = false;
  s.pausedAt = null;
  ctx.fx.push({ type: 'stopAudio' });
  ctx.sfx('fanfare');
}

function advance(ctx: Ctx) {
  const s = ctx.s;
  switch (s.phase) {
    case 'ROUND_INTRO':
      startQuestion(ctx);
      break;
    case 'REVEAL':
      afterReveal(ctx);
      break;
    case 'ROUND_RESULTS':
      enterRound(ctx, s.roundIndex + 1);
      break;
    default:
      break;
  }
}

function resetScores(s: GameState) {
  s.scoreEvents = [];
  s.roundSummaries = [];
  s.lastBuzzSeq = {};
  for (const p of s.players) p.streak = 0;
}

// ---------- commands ----------

function hostCommand(ctx: Ctx, cmd: HostCommand, wallNow: number) {
  const s = ctx.s;
  if (cmd === 'pause') {
    if (s.paused || s.phase === 'LOBBY' || s.phase === 'GAME_RESULTS') return;
    s.paused = true;
    s.pausedAt = wallNow;
    ctx.fx.push({ type: 'pauseAudio' });
    return;
  }
  if (cmd === 'resume') {
    if (!s.paused || s.pausedAt === null) return;
    s.pausedTotal += wallNow - s.pausedAt;
    s.paused = false;
    s.pausedAt = null;
    if (s.phase === 'QUESTION' && audioShouldBePlaying(s)) ctx.fx.push({ type: 'resumeAudio' });
    return;
  }
  if (cmd === 'end') {
    if (s.phase === 'LOBBY') return;
    endGame(ctx);
    return;
  }
  if (cmd === 'toLobby' || cmd === 'playAgain') {
    if (s.phase !== 'GAME_RESULTS') return;
    s.phase = 'LOBBY';
    s.reveal = null;
    s.q = null;
    resetScores(s);
    for (const p of s.players) p.ready = false;
    return;
  }
  if (s.paused) return;

  if (cmd === 'start') {
    if (s.phase !== 'LOBBY' || !s.pack || s.players.length === 0) return;
    resetScores(s);
    s.gameNumber += 1;
    ctx.sfx('start');
    enterRound(ctx, 0);
    return;
  }
  if (cmd === 'skip') {
    if (s.phase === 'QUESTION' && s.q) {
      s.q.done = true;
      finaliseQuestion(ctx);
    } else if (s.phase === 'ROUND_INTRO' || s.phase === 'REVEAL') {
      // Skip the rest of this round.
      s.q = null;
      setPhase(ctx, 'ROUND_RESULTS');
      s.phaseDeadline = ctx.now + ROUND_RESULTS_MS;
    }
    return;
  }
  if (cmd === 'next') advance(ctx);
}

function audioShouldBePlaying(s: GameState): boolean {
  const q = s.q;
  if (!q || q.done) return false;
  if (q.kind === 'nameThatTune') return q.audioPlaying;
  if (q.kind === 'musicBingo') return q.clipEndsAt !== null;
  return false;
}

function playerAction(ctx: Ctx, env: ActionEnvelope) {
  const s = ctx.s;
  if (s.processed.includes(env.id)) return;
  s.processed.push(env.id);
  if (s.processed.length > PROCESSED_KEEP) s.processed.splice(0, s.processed.length - PROCESSED_KEEP);

  const a = env.action;
  const existing = s.players.find((p) => p.id === env.playerId);

  if (a.kind === 'join') {
    if (existing) {
      existing.connected = true;
      return;
    }
    if (s.players.length >= MAX_PLAYERS) return;
    if (s.phase !== 'LOBBY' && !s.settings.allowLateJoin) return;
    const taken = new Set(s.players.map((p) => p.colour));
    const colour = taken.has(a.colour)
      ? (['tomato', 'tangerine', 'sunflower', 'lime', 'teal', 'sky', 'grape', 'bubblegum'] as const).find(
          (c) => !taken.has(c),
        ) ?? a.colour
      : a.colour;
    s.players.push({
      id: env.playerId,
      name: uniqueName(
        sanitiseName(a.name),
        s.players.map((p) => p.name),
      ),
      colour,
      avatar: a.avatar,
      connected: true,
      ready: false,
      joinedAt: ctx.now,
      streak: 0,
    });
    ctx.sfx('join');
    if (s.q && s.pack) {
      HANDLERS[s.pack.rounds[s.roundIndex].type].onLateJoin?.(ctx, s.q, env.playerId);
    }
    return;
  }

  if (!existing) return;

  if (a.kind === 'ready') {
    existing.ready = a.ready;
    return;
  }
  if (a.kind === 'leave') {
    if (s.phase === 'LOBBY') s.players = s.players.filter((p) => p.id !== existing.id);
    else existing.connected = false;
    return;
  }

  if (s.phase !== 'QUESTION' || s.paused || !s.q || !s.pack) return;
  if (a.kind === 'buzz') {
    // Belt-and-braces against duplicate buzzes from the same player.
    const last = s.lastBuzzSeq[env.playerId];
    if (last !== undefined && last >= env.seq) return;
    s.lastBuzzSeq[env.playerId] = env.seq;
  }
  HANDLERS[s.pack.rounds[s.roundIndex].type].action(ctx, s.q, env);
}

// ---------- reducer ----------

/**
 * Pure-ish reducer: returns a new state plus side-effects to run on the host.
 * `wallNow` is the host's Date.now(); `rng` is injectable for tests.
 */
export function reduce(
  state: GameState,
  event: EngineEvent,
  wallNow: number,
  rng: Rng = Math.random,
): ReduceResult {
  const s: GameState = structuredClone(state);
  const ctx = makeCtx(s, gameClock(s, wallNow), rng);

  switch (event.type) {
    case 'loadPack':
      if (s.phase === 'LOBBY' || s.phase === 'GAME_RESULTS') s.pack = event.pack;
      break;
    case 'settings':
      if (s.phase === 'LOBBY') s.settings = { ...s.settings, ...event.settings };
      break;
    case 'presence':
      for (const p of s.players) p.connected = event.online.includes(p.id);
      break;
    case 'kick':
      if (s.phase === 'LOBBY') s.players = s.players.filter((p) => p.id !== event.playerId);
      else {
        const p = s.players.find((pl) => pl.id === event.playerId);
        if (p) p.connected = false;
      }
      break;
    case 'action':
      playerAction(ctx, event.env);
      break;
    case 'host':
      hostCommand(ctx, event.cmd, wallNow);
      break;
    case 'tick':
      if (s.paused) break;
      if (s.phase === 'QUESTION' && s.q && s.pack) {
        HANDLERS[s.pack.rounds[s.roundIndex].type].tick(ctx, s.q);
      } else if (
        s.settings.autoAdvance &&
        s.phaseDeadline !== null &&
        ctx.now >= s.phaseDeadline
      ) {
        advance(ctx);
      }
      break;
  }

  if (s.phase === 'QUESTION' && s.q?.done) finaliseQuestion(ctx);

  s.seq = state.seq + 1;
  return { state: s, effects: ctx.fx };
}
