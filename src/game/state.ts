import type {
  AvatarId,
  ColourId,
  Effect,
  GamePack,
  Question,
  RoundType,
  Settings,
  Track,
} from './types';

export type Phase =
  | 'LOBBY'
  | 'ROUND_INTRO'
  | 'QUESTION'
  | 'REVEAL'
  | 'ROUND_RESULTS'
  | 'GAME_RESULTS';

export const ALLOWED_TRANSITIONS: Record<Phase, Phase[]> = {
  LOBBY: ['ROUND_INTRO', 'GAME_RESULTS'],
  ROUND_INTRO: ['QUESTION', 'ROUND_RESULTS', 'GAME_RESULTS'],
  QUESTION: ['REVEAL', 'GAME_RESULTS'],
  REVEAL: ['QUESTION', 'ROUND_RESULTS', 'GAME_RESULTS'],
  ROUND_RESULTS: ['ROUND_INTRO', 'GAME_RESULTS'],
  GAME_RESULTS: ['LOBBY', 'ROUND_INTRO'],
};

export interface EnginePlayer {
  id: string;
  name: string;
  colour: ColourId;
  avatar: AvatarId;
  connected: boolean;
  ready: boolean;
  joinedAt: number;
  streak: number;
}

export interface ScoreEvent {
  playerId: string;
  delta: number;
  reason: string;
  at: number;
}

// ---------- Per-question state, one shape per round family ----------

interface QBase {
  /** Unique id for this live question instance (phones echo it back). */
  qid: string;
  question: Question | null;
  startedAt: number;
  /** Game-clock deadline for the question, null when frozen. */
  deadline: number | null;
  durationMs: number;
  deltas: Record<string, number>;
  correct: Record<string, boolean>;
  done: boolean;
}

export interface AnswerQState extends QBase {
  kind: 'multipleChoice' | 'fastestFinger';
  answers: Record<string, { optionId: string; seq: number; at: number }>;
}

export interface BuzzQState extends QBase {
  kind: 'nameThatTune' | 'stealPoints';
  stage: 'open' | 'answering' | 'choosing';
  activeId: string | null;
  activeDeadline: number | null;
  /** Main deadline remaining while frozen during an answer. */
  remainingMs: number | null;
  lockedOut: string[];
  buzzOrder: string[];
  winnerId: string | null;
  stolen: { from: string; amount: number } | null;
  audioPlaying: boolean;
}

export interface BombQState extends QBase {
  kind: 'passTheBomb';
  holder: string;
  fuseAt: number;
  stage: 'answering' | 'passing' | 'feedback';
  feedbackUntil: number | null;
  lastResult: { playerId: string; correct: boolean } | null;
  subQuestion: Question;
  pool: Question[];
  poolIndex: number;
  passes: number;
  exploded: string | null;
}

export interface BingoCell {
  trackId: string;
  title: string;
  artist: string;
}

export interface BingoQState extends QBase {
  kind: 'musicBingo';
  pool: Track[];
  cards: Record<string, BingoCell[]>;
  marks: Record<string, number[]>;
  misses: Record<string, number[]>;
  playOrder: string[];
  clipIndex: number;
  clipEndsAt: number | null;
  gapUntil: number | null;
  lineWinner: string | null;
  fullWinner: string | null;
  linesAwarded: Record<string, number>;
}

export type QState = AnswerQState | BuzzQState | BombQState | BingoQState;

export interface RevealResult {
  playerId: string;
  correct: boolean | null;
  delta: number;
}

export interface RevealInfo {
  headline: string;
  correctOptionId: string | null;
  correctText: string | null;
  explanation: string | null;
  trackTitle: string | null;
  artist: string | null;
  results: RevealResult[];
  playedTracks?: { title: string; artist: string }[];
}

export interface RoundSummary {
  roundIndex: number;
  type: RoundType;
  deltas: Record<string, number>;
}

export interface GameState {
  roomCode: string;
  seq: number;
  phase: Phase;
  settings: Settings;
  players: EnginePlayer[];
  pack: GamePack | null;
  roundIndex: number;
  questionIndex: number;
  q: QState | null;
  reveal: RevealInfo | null;
  /** Game-clock deadline for auto-advancing intro/reveal/results phases. */
  phaseDeadline: number | null;
  paused: boolean;
  pausedAt: number | null;
  /** Total wall-clock ms spent paused; gameClock = wallNow - pausedTotal. */
  pausedTotal: number;
  scoreEvents: ScoreEvent[];
  processed: string[];
  lastBuzzSeq: Record<string, number>;
  roundSummaries: RoundSummary[];
  gameNumber: number;
}

export interface ReduceResult {
  state: GameState;
  effects: Effect[];
}
