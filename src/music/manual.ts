import { Emitter, type MusicProvider, type ProviderState } from './provider';

/**
 * Manual companion mode: the host plays songs in their own Spotify app.
 * The game only tells the host (via `current`) which track is due.
 */
export class ManualProvider implements MusicProvider {
  readonly id = 'manual' as const;
  readonly label = 'Manual (you press play in Spotify)';
  readonly canPlay = false;
  private ev = new Emitter<ProviderState>();
  readonly cue = new Emitter<{ uri: string; startMs: number } | null>();

  state(): ProviderState {
    return { status: 'ready', detail: 'Play each song yourself in the Spotify app when prompted.' };
  }
  onState(cb: (s: ProviderState) => void) {
    return this.ev.on(cb);
  }
  async play(uri: string, startMs: number) {
    this.cue.emit({ uri, startMs });
  }
  async pause() {}
  async resume() {}
  async stop() {
    this.cue.emit(null);
  }
}
