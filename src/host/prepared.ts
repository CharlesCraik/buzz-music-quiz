import type { GameState } from '../game/state';
import type { GamePack, Settings } from '../game/types';
import { load, remove, save } from '../lib/storage';

const PREPARED_KEY = 'bb-prepared';
const SESSION_KEY = 'bb-host-session';

export interface PreparedGame {
  pack: GamePack;
  settings: Partial<Settings>;
  musicMode: 'sdk' | 'manual';
}

export function savePrepared(p: PreparedGame) {
  save(PREPARED_KEY, p);
}
export function loadPrepared(): PreparedGame | null {
  return load<PreparedGame>(PREPARED_KEY);
}

export interface HostSession {
  code: string;
  state: GameState;
  savedAt: number;
}

export function saveSession(s: HostSession) {
  save(SESSION_KEY, s);
}
export function loadSession(): HostSession | null {
  const s = load<HostSession>(SESSION_KEY);
  // Sessions older than 6 hours are stale.
  if (!s || Date.now() - s.savedAt > 6 * 3600_000) return null;
  return s;
}
export function clearSession() {
  remove(SESSION_KEY);
}
