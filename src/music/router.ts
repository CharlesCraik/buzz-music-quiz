import { env } from '../lib/env';
import { ManualProvider } from './manual';
import { MockToneProvider } from './mockTones';
import type { MusicProvider } from './provider';
import { SpotifySdkProvider } from './spotifySdk';

export type SpotifyMode = 'sdk' | 'manual';

/**
 * Routes each clip to the right provider: built-in mock tracks to the tone
 * synth, Spotify URIs to the Web Playback SDK (or manual mode as fallback).
 * Playback failures never throw into the game loop.
 */
export class MusicRouter {
  readonly mock = new MockToneProvider();
  readonly manual = new ManualProvider();
  readonly sdk: SpotifySdkProvider | null = env.spotifyWebPlayback ? new SpotifySdkProvider() : null;
  mode: SpotifyMode = env.spotifyWebPlayback ? 'sdk' : 'manual';
  private active: MusicProvider | null = null;
  onError: (msg: string) => void = () => {};

  private pick(uri: string): MusicProvider {
    if (uri.startsWith('mock:')) return this.mock;
    if (this.mode === 'sdk' && this.sdk && this.sdk.state().status === 'ready') return this.sdk;
    return this.manual;
  }

  private async safe(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      this.onError(e instanceof Error ? e.message : String(e));
    }
  }

  play(uri: string, startMs: number, durationMs: number) {
    const p = this.pick(uri);
    const prev = this.active;
    this.active = p;
    return this.safe(async () => {
      if (prev && prev !== p) await prev.stop();
      await p.play(uri, startMs, durationMs);
    });
  }
  pause() {
    return this.safe(async () => this.active?.pause());
  }
  resume() {
    return this.safe(async () => this.active?.resume());
  }
  stop() {
    return this.safe(async () => this.active?.stop());
  }
}
