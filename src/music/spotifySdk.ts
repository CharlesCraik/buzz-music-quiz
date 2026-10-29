import { Emitter, sleep, type MusicProvider, type PlayResult, type ProviderState } from './provider';
import { pauseDevice, playOnDevice, SpotifyError, transferPlayback } from './spotifyApi';
import { getSpotifyToken } from './spotifyAuth';

/**
 * Spotify Web Playback SDK provider: the host browser tab becomes a Spotify
 * Connect device ("Buzzer Beat TV"). Requires Spotify Premium and one user
 * gesture to unlock audio. Used privately; no audio is recorded or extracted.
 *
 * Reliability rules:
 * - play() only resolves ok once the SDK reports the track is actually playing,
 *   so the game can hold its timers until the music is audible.
 * - Lost devices are re-transferred and the request retried.
 */

interface SdkState {
  paused: boolean;
  position: number;
  loading?: boolean;
  track_window: { current_track: { uri: string; id: string; linked_from?: { uri: string | null } } | null };
}

interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(ms: number): Promise<void>;
  setVolume(v: number): Promise<void>;
  getCurrentState(): Promise<SdkState | null>;
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

const VOLUME = 0.85;

let sdkLoading: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  sdkLoading ??= new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    s.onerror = () => {
      sdkLoading = null;
      reject(new Error('Could not load the Spotify player. Check your internet connection.'));
    };
    document.body.appendChild(s);
  });
  return sdkLoading;
}

function sameTrack(st: SdkState | null, uri: string): boolean {
  const t = st?.track_window.current_track;
  if (!t) return false;
  return t.uri === uri || t.linked_from?.uri === uri || uri.endsWith(`:${t.id}`);
}

export class SpotifySdkProvider implements MusicProvider {
  readonly id = 'spotify-sdk' as const;
  readonly label = 'Spotify (this browser)';
  readonly canPlay = true;
  private ev = new Emitter<ProviderState>();
  private st: ProviderState = { status: 'idle' };
  private player: SpotifyPlayer | null = null;
  private deviceId: string | null = null;
  private activated = false;
  private transferred = false;
  private initPromise: Promise<void> | null = null;

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
  init(): Promise<void> {
    this.initPromise ??= this.doInit().catch((e: unknown) => {
      this.initPromise = null;
      this.set({ status: 'error', detail: e instanceof Error ? e.message : String(e) });
    });
    return this.initPromise;
  }

  private async doInit() {
    this.set({ status: 'connecting', detail: 'Starting the Spotify player…' });
    await getSpotifyToken();
    await loadSdk();
    const player = new window.Spotify!.Player({
      name: 'Buzzer Beat TV',
      getOAuthToken: (cb) => {
        getSpotifyToken()
          .then(cb)
          .catch(() => this.set({ status: 'error', detail: 'Spotify session expired. Reconnect Spotify on the setup page.' }));
      },
      volume: VOLUME,
    });
    player.addListener('ready', ({ device_id }) => {
      this.deviceId = device_id ?? null;
      this.transferred = false;
      if (this.activated) {
        void this.transfer().then(() => this.set({ status: 'ready', detail: 'Playing through this browser' }));
      } else {
        this.set({ status: 'needs-gesture', detail: 'Click anywhere (or press a key) to switch the TV sound on.' });
      }
    });
    player.addListener('not_ready', () => {
      this.deviceId = null;
      this.transferred = false;
      this.set({ status: 'connecting', detail: 'Spotify player reconnecting…' });
    });
    player.addListener('initialization_error', ({ message }) =>
      this.set({ status: 'error', detail: `This browser can't run the Spotify player: ${message}. Use Chrome or Edge.` }),
    );
    player.addListener('authentication_error', () =>
      this.set({ status: 'error', detail: 'Spotify login expired or permissions missing. Reconnect Spotify on the setup page.' }),
    );
    player.addListener('account_error', () =>
      this.set({ status: 'error', detail: 'Spotify Premium is required for in-browser playback.' }),
    );
    player.addListener('autoplay_failed', () => {
      this.activated = false;
      this.set({ status: 'needs-gesture', detail: 'The browser blocked autoplay. Click anywhere to switch the sound on.' });
    });
    this.player = player;
    if (!(await player.connect())) throw new Error('Could not connect the Spotify player.');
  }

  /** Unlock audio. Call from a click/keypress handler. */
  async activate() {
    if (!this.player) await this.init();
    if (!this.player) return;
    try {
      await this.player.activateElement();
      this.activated = true;
      if (this.deviceId) {
        await this.transfer();
        this.set({ status: 'ready', detail: 'Playing through this browser' });
      }
    } catch (e) {
      this.set({ status: 'error', detail: e instanceof Error ? e.message : String(e) });
    }
  }

  private async transfer() {
    if (!this.deviceId) return;
    await transferPlayback(this.deviceId);
    this.transferred = true;
  }

  /** Wait (briefly) for the SDK device to exist. */
  private async waitForDevice(timeoutMs: number): Promise<boolean> {
    if (!this.player) await this.init();
    const end = Date.now() + timeoutMs;
    while (!this.deviceId && Date.now() < end) await sleep(100);
    return !!this.deviceId;
  }

  /** Poll the SDK until the given track is actually playing. */
  private async waitUntilPlaying(uri: string, timeoutMs: number): Promise<boolean> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const st = await this.player?.getCurrentState().catch(() => null);
      if (st && !st.paused && !st.loading && sameTrack(st, uri)) return true;
      await sleep(120);
    }
    return false;
  }

  private async startOnDevice(uri: string, startMs: number): Promise<void> {
    if (!this.transferred) await this.transfer();
    try {
      await playOnDevice(this.deviceId!, uri, startMs);
    } catch (e) {
      // Device dropped or not active yet: re-transfer once and retry.
      if (e instanceof SpotifyError && (e.status === 404 || e.status === 502 || e.status === 503)) {
        await sleep(400);
        await this.transfer();
        await playOnDevice(this.deviceId!, uri, startMs);
      } else {
        throw e;
      }
    }
  }

  async play(uri: string, startMs: number): Promise<PlayResult> {
    if (!this.activated) {
      return { ok: false, error: 'The TV sound is locked by the browser. Click anywhere on the TV page, then Retry.' };
    }
    if (!(await this.waitForDevice(6000)) || !this.player) {
      return { ok: false, error: 'The Spotify player is not connected. Check the TV has internet, then Retry.' };
    }
    try {
      await this.player.setVolume(VOLUME).catch(() => undefined);
      await this.startOnDevice(uri, startMs);
      if (await this.waitUntilPlaying(uri, 9000)) return { ok: true };
      return { ok: false, error: 'Spotify accepted the song but it never started playing.' };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async pause() {
    try {
      await this.player?.pause();
    } catch {
      if (this.deviceId) await pauseDevice(this.deviceId).catch(() => undefined);
    }
  }
  async resume() {
    await this.player?.resume().catch(() => undefined);
  }
  async stop() {
    await this.pause();
  }
}
