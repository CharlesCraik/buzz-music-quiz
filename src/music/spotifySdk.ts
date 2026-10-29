import { Emitter, type MusicProvider, type ProviderState } from './provider';
import { pauseDevice, playOnDevice, transferPlayback } from './spotifyApi';
import { getSpotifyToken } from './spotifyAuth';

/**
 * Spotify Web Playback SDK provider: the host browser tab becomes a Spotify
 * Connect device ("Buzzer Beat TV"). Requires Spotify Premium and a user click
 * to unlock audio. Used privately; no audio is recorded or extracted.
 */

interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  setVolume(v: number): Promise<void>;
  activateElement(): Promise<void>;
  addListener(event: string, cb: (arg: { device_id?: string; message?: string }) => void): void;
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (t: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
  }
}

let sdkLoading: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  sdkLoading ??= new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    s.onerror = () => reject(new Error('Could not load the Spotify player. Check your internet connection.'));
    document.body.appendChild(s);
  });
  return sdkLoading;
}

export class SpotifySdkProvider implements MusicProvider {
  readonly id = 'spotify-sdk' as const;
  readonly label = 'Spotify (this browser)';
  readonly canPlay = true;
  private ev = new Emitter<ProviderState>();
  private st: ProviderState = { status: 'idle' };
  private player: SpotifyPlayer | null = null;
  private deviceId: string | null = null;
  private transferred = false;
  private stopTimer: number | null = null;

  state() {
    return this.st;
  }
  onState(cb: (s: ProviderState) => void) {
    return this.ev.on(cb);
  }
  private set(s: ProviderState) {
    this.st = s;
    this.ev.emit(s);
  }

  /** Load the SDK and register the device. Safe to call repeatedly. */
  async init(): Promise<void> {
    if (this.player) return;
    this.set({ status: 'connecting' });
    try {
      await getSpotifyToken();
      await loadSdk();
    } catch (e) {
      this.set({ status: 'error', detail: e instanceof Error ? e.message : String(e) });
      return;
    }
    const player = new window.Spotify!.Player({
      name: 'Buzzer Beat TV',
      getOAuthToken: (cb) => {
        getSpotifyToken()
          .then(cb)
          .catch(() => this.set({ status: 'error', detail: 'Spotify session expired. Reconnect Spotify.' }));
      },
      volume: 0.8,
    });
    player.addListener('ready', ({ device_id }) => {
      this.deviceId = device_id ?? null;
      this.transferred = false;
      this.set({ status: 'needs-gesture', detail: 'Click "Enable audio" to let the TV play music.' });
    });
    player.addListener('not_ready', () => {
      this.deviceId = null;
      this.set({ status: 'connecting', detail: 'Spotify player reconnecting…' } as ProviderState);
    });
    player.addListener('initialization_error', ({ message }) =>
      this.set({ status: 'error', detail: `This browser can't run the Spotify player: ${message}` }),
    );
    player.addListener('authentication_error', () =>
      this.set({ status: 'error', detail: 'Spotify login expired or scopes missing. Reconnect Spotify.' }),
    );
    player.addListener('account_error', () =>
      this.set({ status: 'error', detail: 'Spotify Premium is required for in-browser playback.' }),
    );
    player.addListener('playback_error', ({ message }) =>
      this.set({ status: 'error', detail: `Playback problem: ${message}` }),
    );
    player.addListener('autoplay_failed', () =>
      this.set({ status: 'needs-gesture', detail: 'Browser blocked autoplay. Click "Enable audio".' }),
    );
    this.player = player;
    const ok = await player.connect();
    if (!ok) this.set({ status: 'error', detail: 'Could not connect the Spotify player.' });
  }

  async activate() {
    if (!this.player) await this.init();
    if (!this.player || !this.deviceId) return;
    try {
      await this.player.activateElement();
      await transferPlayback(this.deviceId);
      this.transferred = true;
      this.set({ status: 'ready', detail: 'Playing through this browser' });
    } catch (e) {
      this.set({ status: 'error', detail: e instanceof Error ? e.message : String(e) });
    }
  }

  async play(uri: string, startMs: number, durationMs: number) {
    if (!this.deviceId) throw new Error('Spotify player not ready');
    if (!this.transferred) {
      await transferPlayback(this.deviceId);
      this.transferred = true;
    }
    this.clearTimer();
    await playOnDevice(this.deviceId, uri, startMs);
    // Safety stop in case the game never sends stop (e.g. host tab throttled).
    this.stopTimer = window.setTimeout(() => void this.pause(), durationMs);
  }

  private clearTimer() {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
  }

  async pause() {
    try {
      await this.player?.pause();
    } catch {
      if (this.deviceId) await pauseDevice(this.deviceId).catch(() => undefined);
    }
  }
  async resume() {
    await this.player?.resume();
  }
  async stop() {
    this.clearTimer();
    await this.pause();
  }
}
