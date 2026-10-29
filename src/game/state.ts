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

export type AudioStatus = 'none' | 'loading' | 'playing' | 'failed';

interface QBase {
  /**
   * Audio gate: timers for audio questions only start once the host reports
   * the clip is actually playing ('loading' -> 'playing').
   */
  audio: AudioStatus;
  audioKey: string | null;
  audioSince: number | null;
  audioError: string | null;
  /** False until the play effect has actually been sent (clips are sent after a short "question on screen" delay). */
  audioRequested: boolean;
  clip: { uri: string; startMs: number; durationMs: number } | null;
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
  kind: 'multipleChoice' | 'fastestFinger' | 'introSprint' | 'whoSings' | 'decadeDash';
  answers: Record<string, { optionId: string; seq: number; at: number }>;
}

export interface BuzzQState extends QBase {
  kind: 'nameThatTune' | 'stealPoints';
  stage: 'loading' | 'open' | 'answering' | 'choosing';
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

export interface ChairsQState extends QBase {
  kind: 'musicalChairs';
  stage: 'loading' | 'dancing' | 'sit' | 'result';
  pool: Track[];
  lap: number;
  alive: string[];
  seated: string[];
  out: { playerId: string; lap: number; reason: 'early' | 'slow' }[];
  lastOut: string[];
  /** Hidden: when the music stops. */
  stopAt: number | null;
  sitDeadline: number | null;
  resultUntil: number | null;
}

export interface MashQState extends QBase {
  kind: 'beatMash';
  stage: 'loading' | 'mashing' | 'done';
  counts: Record<string, number>;
}

export interface SurvivalQState extends QBase {
  kind: 'lastStanding';
  stage: 'answering' | 'result';
  pool: Question[];
  poolIndex: number;
  subNumber: number;
  lives: Record<string, number>;
  answers: Record<string, { optionId: string; seq: number }>;
  lastResult: Record<string, boolean> | null;
  lastNote: string | null;
  /** True when nobody answered correctly, so no lives were taken. */
  amnesty: boolean;
  resultUntil: number | null;
  winner: string | null;
}

export type QState =
  | AnswerQState
  | BuzzQState
  | BombQState
  | BingoQState
  | ChairsQState
  | MashQState
  | SurvivalQState;

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
