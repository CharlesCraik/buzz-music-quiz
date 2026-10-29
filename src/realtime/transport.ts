import type { ActionEnvelope, AvatarId, ColourId, PlayerAction } from '../game/types';
import type { PublicState } from '../game/view';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface HostTransport {
  readonly kind: 'local' | 'supabase';
  /** Create a room (or resume `existingCode` after a refresh). Returns the room code. */
  open(existingCode?: string | null): Promise<string>;
  onAction(cb: (env: ActionEnvelope) => void): void;
  onPresence(cb: (onlinePlayerIds: string[]) => void): void;
  onStatus(cb: (s: ConnectionStatus) => void): void;
  /** Broadcast state; `persist` also stores a snapshot for reconnecting phones. */
  publish(state: PublicState, persist: boolean): void;
  close(clearData: boolean): Promise<void>;
}

export interface JoinProfile {
  name: string;
  colour: ColourId;
  avatar: AvatarId;
}

export type SendResult = { ok: true } | { ok: false; error: string };

export interface PlayerTransport {
  readonly kind: 'local' | 'supabase';
  /** Connect to a room; rejects with ROOM_NOT_FOUND / ROOM_CLOSED. Returns this device's player id. */
  connect(code: string): Promise<string>;
  join(profile: JoinProfile): Promise<SendResult>;
  send(action: PlayerAction): Promise<SendResult>;
  onState(cb: (s: PublicState) => void): void;
  onHostOnline(cb: (online: boolean) => void): void;
  onStatus(cb: (s: ConnectionStatus) => void): void;
  disconnect(): void;
}

export const ERROR_TEXT: Record<string, string> = {
  ROOM_NOT_FOUND: "We couldn't find that room. Check the code on the TV.",
  ROOM_CLOSED: 'That game has finished. Ask the host for a new code.',
  ROOM_FULL: 'This room is full (8 players max).',
  GAME_STARTED: 'This game has already started and late joining is off.',
  NOT_IN_ROOM: 'You are not in this room any more. Re-join with the code.',
  RATE_LIMITED: 'Whoa, slow down! Too many taps.',
  NETWORK: 'Connection problem. Check your Wi-Fi or mobile data.',
};

export function errorCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  const known = Object.keys(ERROR_TEXT).find((k) => msg.includes(k));
  return known ?? 'NETWORK';
}
