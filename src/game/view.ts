import { roundQuestionCount, toWall } from './engine';
import { makeCtx } from './ctx';
import { ROUND_INFO } from './rounds';
import { playedIds } from './rounds/musicBingo';
import { scoreOf, standings, type Standing } from './scoring';
import type { AudioStatus, BingoCell, GameState, Phase, RevealInfo } from './state';
import type { AnswerOption, AvatarId, ColourId, RoundType, Settings } from './types';

/**
 * Everything phones and the TV render. Built only from information that is safe
 * to show to every player: never contains correct answers before REVEAL,
 * the bomb fuse, or upcoming bingo tracks.
 */
export interface PublicPlayer {
  id: string;
  name: string;
  colour: ColourId;
  avatar: AvatarId;
  score: number;
  connected: boolean;
  ready: boolean;
  streak: number;
}

export interface PublicQuestion {
  qid: string;
  kind: RoundType;
  number: number;
  total: number;
  prompt: string | null;
  category: string | null;
  options: AnswerOption[];
  /** Wall-clock deadline (host clock) for the visible timer. */
  deadline: number | null;
  durationMs: number;
  answered: string[];
  audioPlaying: boolean;
  /** 'loading' = waiting for the music to start; timers have not started yet. */
  audio: AudioStatus;
  audioError: string | null;
  buzz?: {
    stage: 'loading' | 'open' | 'answering' | 'choosing';
    activeId: string | null;
    activeDeadline: number | null;
    lockedOut: string[];
    buzzOrder: string[];
    targets: string[];
  };
  bomb?: {
    holder: string;
    stage: 'answering' | 'passing' | 'feedback';
    lastResult: { playerId: string; correct: boolean } | null;
    passes: number;
    targets: string[];
  };
  chairs?: {
    stage: 'loading' | 'dancing' | 'sit' | 'result';
    lap: number;
    alive: string[];
    seated: string[];
    out: { playerId: string; lap: number; reason: 'early' | 'slow' }[];
    lastOut: string[];
    chairs: number;
  };
  mash?: { stage: 'loading' | 'mashing' | 'done'; counts: Record<string, number> };
  survival?: {
    stage: 'answering' | 'result';
    subNumber: number;
    lives: Record<string, number>;
    lastResult: Record<string, boolean> | null;
    lastNote: string | null;
    amnesty: boolean;
    /** Only sent once the question is resolved. */
    correctOptionId: string | null;
  };
  bingo?: {
    cards: Record<string, BingoCell[]>;
    marks: Record<string, number[]>;
    misses: Record<string, number[]>;
    clipNumber: number;
    totalClips: number;
    playing: boolean;
    lineWinner: string | null;
  };
}

export interface PublicState {
  seq: number;
  roomCode: string;
  phase: Phase;
  paused: boolean;
  hostNow: number;
  settings: Pick<Settings, 'reducedMotion' | 'highContrast' | 'autoAdvance'>;
  players: PublicPlayer[];
  hasPack: boolean;
  round: {
    index: number;
    total: number;
    type: RoundType;
    title: string;
    tagline: string;
    rules: string;
  } | null;
  question: PublicQuestion | null;
  reveal: RevealInfo | null;
  standings: Standing[];
  roundDeltas: Record<string, number> | null;
}

const ANSWER_KINDS = ['multipleChoice', 'fastestFinger', 'introSprint', 'whoSings', 'decadeDash'] as const;
export function isAnswerKind(k: RoundType): k is (typeof ANSWER_KINDS)[number] {
  return (ANSWER_KINDS as readonly string[]).includes(k);
}

export function toPublic(s: GameState, wallNow: number): PublicState {
  const ctx = makeCtx(s, wallNow, Math.random);
  const plan = s.pack?.rounds[s.roundIndex];
  const showRound = s.phase !== 'LOBBY' && s.phase !== 'GAME_RESULTS' && plan;
  const info = plan ? ROUND_INFO[plan.type] : null;

  let question: PublicQuestion | null = null;
  const q = s.q;
  if (q && plan && (s.phase === 'QUESTION' || s.phase === 'REVEAL')) {
    const base: PublicQuestion = {
      qid: q.qid,
      kind: q.kind,
      number: s.questionIndex + 1,
      total: roundQuestionCount(s, s.roundIndex, ctx),
      prompt: q.question?.prompt ?? null,
      category: q.question?.category ?? null,
      options: q.question?.options ?? [],
      deadline: toWall(s, q.deadline),
      durationMs: q.durationMs,
      answered: [],
      audioPlaying: q.audio === 'playing' && !s.paused,
      audio: q.audio,
      audioError: q.audioError,
    };
    if (isAnswerKind(q.kind) && 'answers' in q) {
      base.answered = Object.keys(q.answers);
    } else if (q.kind === 'nameThatTune' || q.kind === 'stealPoints') {
      base.audioPlaying = q.audioPlaying && !s.paused;
      base.buzz = {
        stage: q.stage,
        activeId: q.activeId,
        activeDeadline: toWall(s, q.activeDeadline),
        lockedOut: q.lockedOut,
        buzzOrder: q.buzzOrder,
        targets:
          q.stage === 'choosing'
            ? s.players.filter((p) => p.id !== q.activeId && scoreOf(s, p.id) > 0).map((p) => p.id)
            : [],
      };
    } else if (q.kind === 'passTheBomb') {
      base.bomb = {
        holder: q.holder,
        stage: q.stage,
        lastResult: q.lastResult,
        passes: q.passes,
        targets: s.players.filter((p) => p.connected && p.id !== q.holder).map((p) => p.id),
      };
    } else if (q.kind === 'musicalChairs') {
      base.chairs = {
        stage: q.stage,
        lap: q.lap,
        alive: q.alive,
        seated: q.seated,
        out: q.out,
        lastOut: q.lastOut,
        chairs: Math.max(1, q.alive.length - 1),
      };
    } else if (q.kind === 'beatMash') {
      base.mash = { stage: q.stage, counts: q.counts };
    } else if (q.kind === 'lastStanding') {
      base.number = q.subNumber;
      base.total = 0;
      base.answered = Object.keys(q.answers);
      base.survival = {
        stage: q.stage,
        subNumber: q.subNumber,
        lives: q.lives,
        lastResult: q.lastResult,
        lastNote: q.lastNote,
        amnesty: q.amnesty,
        correctOptionId: q.stage === 'result' ? (q.question?.correctOptionId ?? null) : null,
      };
    } else if (q.kind === 'musicBingo') {
      base.audioPlaying = q.clipEndsAt !== null && !s.paused;
      base.bingo = {
        cards: q.cards,
        marks: q.marks,
        misses: q.misses,
        clipNumber: Math.max(0, playedIds(q).length),
        totalClips: q.playOrder.length,
        playing: q.clipEndsAt !== null,
        lineWinner: q.lineWinner,
      };
    }
    question = base;
  }

  const summary = s.roundSummaries[s.roundSummaries.length - 1];

  return {
    seq: s.seq,
    roomCode: s.roomCode,
    phase: s.phase,
    paused: s.paused,
    hostNow: wallNow,
    settings: {
      reducedMotion: s.settings.reducedMotion,
      highContrast: s.settings.highContrast,
      autoAdvance: s.settings.autoAdvance,
    },
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      colour: p.colour,
      avatar: p.avatar,
      score: scoreOf(s, p.id),
      connected: p.connected,
      ready: p.ready,
      streak: p.streak,
    })),
    hasPack: !!s.pack,
    round:
      showRound && plan && info
        ? {
            index: s.roundIndex,
            total: s.pack!.rounds.length,
            type: plan.type,
            title: info.title,
            tagline: info.tagline,
            rules: info.rules,
          }
        : null,
    question,
    reveal: s.phase === 'REVEAL' ? s.reveal : null,
    standings: standings(s),
    roundDeltas: s.phase === 'ROUND_RESULTS' && summary ? summary.deltas : null,
  };
}

/** Stable key for "did anything visible change" (ignores hostNow). */
export function publicKey(p: PublicState): string {
  return JSON.stringify({ ...p, hostNow: 0, seq: 0 });
}
