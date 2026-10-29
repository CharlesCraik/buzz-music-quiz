// Core game model shared by host engine, transports and UI.

export const ROUND_TYPES = [
  'multipleChoice',
  'fastestFinger',
  'nameThatTune',
  'introSprint',
  'whoSings',
  'decadeDash',
  'stealPoints',
  'passTheBomb',
  'musicBingo',
] as const;
export type RoundType = (typeof ROUND_TYPES)[number];

export const COLOURS = [
  'tomato',
  'tangerine',
  'sunflower',
  'lime',
  'teal',
  'sky',
  'grape',
  'bubblegum',
] as const;
export type ColourId = (typeof COLOURS)[number];

export const AVATARS = [
  'vinyl',
  'cassette',
  'headphones',
  'mic',
  'boombox',
  'guitar',
  'drum',
  'keytar',
] as const;
export type AvatarId = (typeof AVATARS)[number];

export const MAX_PLAYERS = 8;
export const MAX_NAME_LENGTH = 16;

export interface AnswerOption {
  id: string;
  text: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  id: string;
  category: string;
  difficulty: Difficulty;
  questionType: 'multipleChoice' | 'nameThatTune' | 'artistOrSong' | 'decade';
  prompt: string;
  options: AnswerOption[];
  correctOptionId: string;
  acceptedAnswers: string[];
  explanation: string;
  trackTitle: string | null;
  artist: string | null;
  releaseYear: number | null;
  spotifyUri: string | null;
  sourceNotes: string;
  verificationStatus: 'unverified' | 'verified';
  /** Audio clip to play while the question is live (Name That Tune). */
  clip?: { uri: string; startMs: number } | null;
}

export interface Track {
  id: string;
  uri: string;
  title: string;
  artists: string[];
  album?: string | null;
  year?: number | null;
  durationMs?: number | null;
  artworkUrl?: string | null;
}

export interface RoundPlan {
  type: RoundType;
  questions: Question[];
  tracks: Track[];
}

export interface GamePack {
  id: string;
  title: string;
  source: 'sample' | 'playlist' | 'category';
  rounds: RoundPlan[];
}

export interface Settings {
  answerTimeMs: number;
  buzzAnswerTimeMs: number;
  clipMs: number;
  points: number;
  wrongPenalty: number;
  speedBonus: boolean;
  stealAmount: number;
  bombPenalty: number;
  bombsPerRound: number;
  bombFuseMinMs: number;
  bombFuseMaxMs: number;
  bingoClips: number;
  bingoClipMs: number;
  questionsPerRound: number;
  autoAdvance: boolean;
  timerMultiplier: number;
  reducedMotion: boolean;
  highContrast: boolean;
  allowLateJoin: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  answerTimeMs: 20_000,
  buzzAnswerTimeMs: 8_000,
  clipMs: 25_000,
  points: 100,
  wrongPenalty: 50,
  speedBonus: false,
  stealAmount: 150,
  bombPenalty: 200,
  bombsPerRound: 2,
  bombFuseMinMs: 25_000,
  bombFuseMaxMs: 50_000,
  bingoClips: 10,
  bingoClipMs: 15_000,
  questionsPerRound: 5,
  autoAdvance: true,
  timerMultiplier: 1,
  reducedMotion: false,
  highContrast: false,
  allowLateJoin: true,
};

// ---------- Player actions (phone -> host) ----------

export type PlayerAction =
  | { kind: 'join'; name: string; colour: ColourId; avatar: AvatarId }
  | { kind: 'ready'; ready: boolean }
  | { kind: 'answer'; qid: string; optionId: string }
  | { kind: 'buzz'; qid: string }
  | { kind: 'target'; qid: string; targetId: string }
  | { kind: 'tick'; qid: string; cell: number }
  | { kind: 'leave' };

export interface ActionEnvelope {
  /** Globally unique id, used for idempotency. */
  id: string;
  playerId: string;
  /** Ordering number assigned by the server/transport (DB bigserial). */
  seq: number;
  action: PlayerAction;
}

export type HostCommand =
  | 'start'
  | 'next'
  | 'pause'
  | 'resume'
  | 'skip'
  | 'end'
  | 'toLobby'
  | 'playAgain'
  /** Re-send the current clip after a failure. */
  | 'retryAudio'
  /** Start the timer without (or with manually started) music. */
  | 'audioStarted';

export type EngineEvent =
  | { type: 'action'; env: ActionEnvelope }
  | { type: 'host'; cmd: HostCommand }
  /** Music provider report for a clip started with a `play` effect (matched by key). */
  | { type: 'audio'; key: string; status: 'started' | 'failed'; detail?: string }
  | { type: 'kick'; playerId: string }
  | { type: 'tick' }
  | { type: 'presence'; online: string[] }
  | { type: 'loadPack'; pack: GamePack }
  | { type: 'settings'; settings: Partial<Settings> };

// ---------- Effects (engine -> host side-effects) ----------

export type SfxName =
  | 'join'
  | 'start'
  | 'roundIntro'
  | 'tick'
  | 'buzz'
  | 'lockIn'
  | 'correct'
  | 'wrong'
  | 'reveal'
  | 'steal'
  | 'pass'
  | 'boom'
  | 'bingo'
  | 'fanfare';

export type Effect =
  /** Start a clip. The host must answer with an `audio` event carrying the same key. */
  | { type: 'play'; key: string; uri: string; startMs: number; durationMs: number }
  /** Load a clip silently so the next `play` of the same uri starts instantly. */
  | { type: 'preload'; uri: string; startMs: number }
  | { type: 'pauseAudio' }
  | { type: 'resumeAudio' }
  | { type: 'stopAudio' }
  | { type: 'sfx'; name: SfxName };
