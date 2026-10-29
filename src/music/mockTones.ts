import { Emitter, type MusicProvider, type ProviderState } from './provider';

/**
 * Synthetic "songs" for testing and keyless play: each mock track id seeds a
 * distinct looping melody + bass line generated with WebAudio. No audio files.
 */

const SCALES = [
  [0, 2, 4, 7, 9, 12, 14, 16], // major pentatonic
  [0, 3, 5, 7, 10, 12, 15, 17], // minor pentatonic
  [0, 2, 4, 5, 7, 9, 11, 12], // major
  [0, 2, 3, 5, 7, 8, 10, 12], // minor
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function melodyFor(uri: string) {
  let x = hash(uri);
  const rnd = () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
  const scale = SCALES[Math.floor(rnd() * SCALES.length)];
  const root = 50 + Math.floor(rnd() * 12);
  const bpm = 90 + Math.floor(rnd() * 70);
  const wave: OscillatorType = (['square', 'triangle', 'sawtooth', 'sine'] as const)[Math.floor(rnd() * 4)];
  const notes = Array.from({ length: 16 }, () => (rnd() < 0.15 ? null : root + 12 + scale[Math.floor(rnd() * scale.length)]));
  const bass = Array.from({ length: 4 }, () => root - 12 + scale[Math.floor(rnd() * 4)]);
  return { notes, bass, stepMs: 60_000 / bpm / 2, wave };
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

let sharedCtx: AudioContext | null = null;
export function audioCtx(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
}

export class MockToneProvider implements MusicProvider {
  readonly id = 'mock' as const;
  readonly label = 'Sample tunes (built-in)';
  readonly canPlay = true;
  private ev = new Emitter<ProviderState>();
  private timer: number | null = null;
  private step = 0;
  private current: ReturnType<typeof melodyFor> | null = null;
  private master: GainNode | null = null;

  state(): ProviderState {
    return { status: 'ready' };
  }
  onState(cb: (s: ProviderState) => void) {
    return this.ev.on(cb);
  }

  async activate() {
    await audioCtx().resume();
  }

  async play(uri: string) {
    await this.stop();
    const ctx = audioCtx();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    this.master = ctx.createGain();
    this.master.gain.value = 0.18;
    this.master.connect(ctx.destination);
    this.current = melodyFor(uri);
    this.step = 0;
    this.startLoop();
  }

  private startLoop() {
    if (!this.current) return;
    this.timer = window.setInterval(() => this.tick(), this.current.stepMs);
  }

  private tick() {
    const m = this.current;
    if (!m || !this.master) return;
    const ctx = audioCtx();
    const t = ctx.currentTime;
    const note = m.notes[this.step % m.notes.length];
    if (note !== null) this.blip(midiHz(note), m.wave, t, (m.stepMs / 1000) * 0.9, 0.5);
    if (this.step % 4 === 0) {
      this.blip(midiHz(m.bass[(this.step / 4) % m.bass.length]), 'triangle', t, (m.stepMs / 1000) * 3.5, 0.9);
    }
    this.step += 1;
  }

  private blip(freq: number, type: OscillatorType, t: number, dur: number, vol: number) {
    const ctx = audioCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  async pause() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  async resume() {
    if (!this.timer && this.current) this.startLoop();
  }
  async stop() {
    await this.pause();
    this.current = null;
    this.master?.disconnect();
    this.master = null;
  }
}
