export interface TrackMetadata {
  provider: 'spotify' | 'mock';
  providerTrackId: string;
  uri: string;
  title: string;
  artists: string[];
  album: string | null;
  releaseDate: string | null;
  durationMs: number | null;
  externalUrl: string | null;
  artworkUrl: string | null;
}

export type ProviderState =
  | { status: 'idle' }
  | { status: 'connecting'; detail?: string }
  | { status: 'ready'; detail?: string }
  | { status: 'needs-gesture'; detail: string }
  | { status: 'error'; detail: string };

/** Result of a play request. `started` means the clip is confirmed audible. */
export type PlayResult = { ok: true } | { ok: false; error: string };

/**
 * Playback adapter. Game logic only ever talks to this interface, so
 * Spotify can be swapped for mock tones or manual companion mode.
 */
export interface MusicProvider {
  readonly id: 'spotify-sdk' | 'manual' | 'mock';
  readonly label: string;
  readonly canPlay: boolean;
  state(): ProviderState;
  onState(cb: (s: ProviderState) => void): () => void;
  /** Resolves once the clip is actually playing (or fails with a reason). */
  play(uri: string, startMs: number, durationMs: number): Promise<PlayResult>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  /** Silently load a clip so a later play() of the same uri starts instantly. */
  preload?(uri: string, startMs: number): Promise<void>;
  /** Must be called from a user gesture (click/key) to unlock browser autoplay. */
  activate?(): Promise<void>;
}

export class Emitter<T> {
  private subs = new Set<(v: T) => void>();
  on(cb: (v: T) => void) {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }
  emit(v: T) {
    this.subs.forEach((cb) => cb(v));
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
