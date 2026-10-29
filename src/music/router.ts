import { env } from '../lib/env';
import { ManualProvider } from './manual';
import { audioCtx, MockToneProvider } from './mockTones';
import type { MusicProvider } from './provider';
import { SpotifySdkProvider } from './spotifySdk';

export type SpotifyMode = 'sdk' | 'manual';
export type PlayOutcome = { status: 'started' } | { status: 'manual' } | { status: 'failed'; error: string };

/**
 * Routes each clip to the right provider: built-in mock tracks to the tone
 * synth, Spotify URIs to the Web Playback SDK (or manual companion mode).
 *
 * All commands run through one queue so stop/play/pause can never race
 * each other (e.g. a late "stop" cutting off the next clip).
 */
export class MusicRouter {
  readonly mock = new MockToneProvider();
  readonly manual = new ManualProvider();
  readonly sdk: SpotifySdkProvider | null = env.spotifyWebPlayback ? new SpotifySdkProvider() : null;
  mode: SpotifyMode = env.spotifyWebPlayback ? 'sdk' : 'manual';
  private active: MusicProvider | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  private pick(uri: string): MusicProvider {
    if (uri.startsWith('mock:')) return this.mock;
    if (this.mode === 'sdk' && this.sdk) return this.sdk;
    return this.manual;
  }

  private enqueue<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    const run = this.queue.then(fn).catch(() => fallback);
    this.queue = run;
    return run;
  }

  /** Call from any user gesture on the host page: unlocks browser audio for both providers. */
  unlock() {
    void audioCtx()
      .resume()
      .catch(() => undefined);
    const st = this.sdk?.state().status;
    if (this.mode === 'sdk' && this.sdk && st !== 'ready' && st !== 'error') void this.sdk.activate();
  }

  play(uri: string, startMs: number, durationMs: number): Promise<PlayOutcome> {
    return this.enqueue<PlayOutcome>(async () => {
      const p = this.pick(uri);
      if (this.active && this.active !== p) await this.active.stop();
      this.active = p;
      const res = await p.play(uri, startMs, durationMs);
      if (res.ok) return { status: 'started' };
      if (res.error === 'MANUAL') return { status: 'manual' };
      return { status: 'failed', error: res.error };
    }, { status: 'failed', error: 'Playback error' });
  }

  pause() {
    return this.enqueue(async () => this.active?.pause(), undefined);
  }
  resume() {
    return this.enqueue(async () => this.active?.resume(), undefined);
  }
  stop() {
    return this.enqueue(async () => this.active?.stop(), undefined);
  }
}
