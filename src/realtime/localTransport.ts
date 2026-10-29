import type { ActionEnvelope, PlayerAction } from '../game/types';
import type { PublicState } from '../game/view';
import { roomCode, uid } from '../lib/id';
import type {
  ConnectionStatus,
  HostTransport,
  JoinProfile,
  PlayerTransport,
  SendResult,
} from './transport';

/**
 * Dev/offline transport: host and phones are tabs in the same browser,
 * talking over BroadcastChannel. No backend needed.
 */

type Msg =
  | { t: 'state'; state: PublicState }
  | { t: 'action'; env: Omit<ActionEnvelope, 'seq'> }
  | { t: 'hello'; playerId: string }
  | { t: 'hb'; playerId: string }
  | { t: 'host-hb' }
  | { t: 'closed' };

const PRESENCE_TIMEOUT = 5000;
const channelName = (code: string) => `buzzer-beat-${code}`;

export class LocalHostTransport implements HostTransport {
  readonly kind = 'local' as const;
  private ch: BroadcastChannel | null = null;
  private seq = 0;
  private last: PublicState | null = null;
  private seen = new Map<string, number>();
  private onlineKey = '';
  private timer: number | null = null;
  private actionCb: (e: ActionEnvelope) => void = () => {};
  private presenceCb: (ids: string[]) => void = () => {};
  private statusCb: (s: ConnectionStatus) => void = () => {};

  async open(existingCode?: string | null) {
    const code = existingCode || roomCode();
    this.ch = new BroadcastChannel(channelName(code));
    this.ch.onmessage = (ev: MessageEvent<Msg>) => this.handle(ev.data);
    this.timer = window.setInterval(() => this.heartbeat(), 1000);
    this.statusCb('online');
    return code;
  }

  private handle(m: Msg) {
    if (m.t === 'action') {
      this.seen.set(m.env.playerId, Date.now());
      this.seq += 1;
      this.actionCb({ ...m.env, seq: this.seq });
    } else if (m.t === 'hello' || m.t === 'hb') {
      this.seen.set(m.playerId, Date.now());
      if (m.t === 'hello' && this.last) this.post({ t: 'state', state: this.last });
      this.heartbeat();
    }
  }

  private heartbeat() {
    this.post({ t: 'host-hb' });
    const now = Date.now();
    const online = [...this.seen.entries()]
      .filter(([, at]) => now - at < PRESENCE_TIMEOUT)
      .map(([id]) => id)
      .sort();
    const key = online.join(',');
    if (key !== this.onlineKey) {
      this.onlineKey = key;
      this.presenceCb(online);
    }
  }

  private post(m: Msg) {
    this.ch?.postMessage(m);
  }

  onAction(cb: (e: ActionEnvelope) => void) {
    this.actionCb = cb;
  }
  onPresence(cb: (ids: string[]) => void) {
    this.presenceCb = cb;
  }
  onStatus(cb: (s: ConnectionStatus) => void) {
    this.statusCb = cb;
  }
  publish(state: PublicState) {
    this.last = state;
    this.post({ t: 'state', state });
  }
  async close(clearData: boolean) {
    if (clearData) this.post({ t: 'closed' });
    if (this.timer) clearInterval(this.timer);
    this.ch?.close();
    this.ch = null;
  }
}

export class LocalPlayerTransport implements PlayerTransport {
  readonly kind = 'local' as const;
  private ch: BroadcastChannel | null = null;
  private playerId = '';
  private hostSeenAt = 0;
  private hostOnline = false;
  private timer: number | null = null;
  private stateCb: (s: PublicState) => void = () => {};
  private hostCb: (o: boolean) => void = () => {};
  private statusCb: (s: ConnectionStatus) => void = () => {};

  async connect(code: string) {
    // One player per tab: sessionStorage survives reloads but not new tabs.
    const key = `bb-local-player-${code}`;
    this.playerId = sessionStorage.getItem(key) ?? uid();
    sessionStorage.setItem(key, this.playerId);

    this.ch = new BroadcastChannel(channelName(code));
    const gotState = new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error('ROOM_NOT_FOUND')), 2500);
      this.ch!.onmessage = (ev: MessageEvent<Msg>) => {
        const m = ev.data;
        if (m.t === 'state' || m.t === 'host-hb') {
          this.hostSeenAt = Date.now();
          this.setHost(true);
          if (m.t === 'state') {
            this.stateCb(m.state);
            clearTimeout(t);
            resolve();
          }
        } else if (m.t === 'closed') {
          this.statusCb('offline');
          this.setHost(false);
        }
      };
    });
    this.ch.postMessage({ t: 'hello', playerId: this.playerId } satisfies Msg);
    this.timer = window.setInterval(() => {
      this.ch?.postMessage({ t: 'hb', playerId: this.playerId } satisfies Msg);
      if (Date.now() - this.hostSeenAt > PRESENCE_TIMEOUT) this.setHost(false);
    }, 2000);
    try {
      await gotState;
    } catch (e) {
      this.disconnect();
      throw e;
    }
    this.statusCb('online');
    return this.playerId;
  }

  private setHost(online: boolean) {
    if (online !== this.hostOnline) {
      this.hostOnline = online;
      this.hostCb(online);
    }
  }

  async join(profile: JoinProfile) {
    return this.send({ kind: 'join', ...profile });
  }

  async send(action: PlayerAction): Promise<SendResult> {
    if (!this.ch) return { ok: false, error: 'NETWORK' };
    this.ch.postMessage({ t: 'action', env: { id: uid(), playerId: this.playerId, action } } satisfies Msg);
    return { ok: true };
  }

  onState(cb: (s: PublicState) => void) {
    this.stateCb = cb;
  }
  onHostOnline(cb: (o: boolean) => void) {
    this.hostCb = cb;
  }
  onStatus(cb: (s: ConnectionStatus) => void) {
    this.statusCb = cb;
  }
  disconnect() {
    if (this.timer) clearInterval(this.timer);
    this.ch?.close();
    this.ch = null;
  }
}
