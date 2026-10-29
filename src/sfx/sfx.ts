import type { SfxName } from '../game/types';
import { audioCtx } from '../music/mockTones';

/** Original synthesized stings. No audio assets. */

type Note = [freq: number, at: number, dur: number, type?: OscillatorType, vol?: number];

const C = 261.63;
const st = (n: number) => C * Math.pow(2, n / 12);

const SOUNDS: Record<SfxName, Note[]> = {
  join: [[st(12), 0, 0.08, 'square', 0.2], [st(19), 0.07, 0.12, 'square', 0.2]],
  start: [[st(0), 0, 0.12], [st(4), 0.12, 0.12], [st(7), 0.24, 0.12], [st(12), 0.36, 0.35]],
  roundIntro: [[st(7), 0, 0.1, 'sawtooth', 0.15], [st(7), 0.12, 0.1, 'sawtooth', 0.15], [st(12), 0.24, 0.4, 'sawtooth', 0.2]],
  tick: [[st(24), 0, 0.03, 'square', 0.1]],
  buzz: [[110, 0, 0.35, 'sawtooth', 0.35], [116, 0, 0.35, 'square', 0.2]],
  lockIn: [[st(16), 0, 0.06, 'triangle', 0.25], [st(23), 0.05, 0.08, 'triangle', 0.25]],
  correct: [[st(12), 0, 0.1, 'square', 0.2], [st(16), 0.1, 0.1, 'square', 0.2], [st(19), 0.2, 0.25, 'square', 0.2]],
  wrong: [[st(-5), 0, 0.18, 'sawtooth', 0.25], [st(-8), 0.18, 0.35, 'sawtooth', 0.25]],
  reveal: [[st(7), 0, 0.08, 'triangle'], [st(11), 0.08, 0.08, 'triangle'], [st(14), 0.16, 0.3, 'triangle']],
  steal: [[st(19), 0, 0.06, 'square', 0.2], [st(14), 0.06, 0.06, 'square', 0.2], [st(7), 0.12, 0.06, 'square', 0.2], [st(19), 0.2, 0.25, 'square', 0.2]],
  pass: [[st(5), 0, 0.06, 'triangle', 0.3], [st(12), 0.05, 0.1, 'triangle', 0.3]],
  boom: [[60, 0, 0.8, 'sawtooth', 0.5], [45, 0.05, 0.9, 'square', 0.4], [90, 0, 0.3, 'triangle', 0.4]],
  bingo: [[st(12), 0, 0.1], [st(16), 0.1, 0.1], [st(19), 0.2, 0.1], [st(24), 0.3, 0.4]],
  fanfare: [[st(0), 0, 0.15], [st(7), 0.15, 0.15], [st(12), 0.3, 0.15], [st(16), 0.45, 0.15], [st(19), 0.6, 0.15], [st(24), 0.75, 0.6]],
};

let muted = false;
export function setSfxMuted(m: boolean) {
  muted = m;
}

export function playSfx(name: SfxName) {
  if (muted) return;
  try {
    const ctx = audioCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    for (const [freq, at, dur, type = 'square', vol = 0.18] of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0 + at);
      if (name === 'boom') osc.frequency.exponentialRampToValueAtTime(20, t0 + at + dur);
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(vol, t0 + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + at + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.05);
    }
  } catch {
    /* audio unavailable: never break the game */
  }
}
