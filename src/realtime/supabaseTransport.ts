import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { ActionEnvelope, PlayerAction } from '../game/types';
import type { PublicState } from '../game/view';
import { env } from '../lib/env';
import { uid } from '../lib/id';
import {
  errorCode,
  type ConnectionStatus,
  type HostTransport,
  type JoinProfile,
  type PlayerTransport,
  type SendResult,
} from './transport';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bb-auth' },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

/** Anonymous sign-in: no accounts, but a stable uid per device for RLS. */
export async function ensureSignedIn(): Promise<string> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const res = await sb.auth.signInAnonymously();
  if (res.error || !res.data.user) {
    throw new Error(
      `Supabase anonymous sign-in failed: ${res.error?.message ?? 'unknown'}. Enable "Anonymous sign-ins" in Supabase Auth settings.`,
    );
  }
  return res.data.user.id;
}

const channelName = (code: string) => `room-${code}`;

interface ActionRow {
  seq: number;
  room_id: string;
  player_uid: string;
  client_id: string;
  payload: PlayerAction;
}

function mapStatus(s: string): ConnectionStatus {
  if (s === 'SUBSCRIBED') return 'online';
  if (s === 'CLOSED') return 'offline';
  return 'reconnecting';
}

export class SupabaseHostTransport implements HostTransport {
  readonly kind = 'supabase' as const;
  private ch: RealtimeChannel | null = null;
  private code = '';
  private roomId = '';
  private lastSeq = 0;
  private lastPersist = 0;
  private persistTimer: number | null = null;
  private pending: PublicState | null = null;
  private actionCb: (e: ActionEnvelope) => void = () => {};
  private presenceCb: (ids: string[]) => void = () => {};
  private statusCb: (s: ConnectionStatus) => void = () => {};

  async open(existingCode?: string | null) {
    await ensureSignedIn();
    const sb = getSupabase();
    if (existingCode) {
      const { data } = await sb.rpc('resume_room', { p_code: existingCode });
      if (data) {
        this.code = existingCode;
        this.roomId = data as string;
      }
    }
    if (!this.roomId) {
      const { data, error } = await sb.rpc('create_room');
      if (error) throw new Error(`Could not create room: ${error.message}`);
      const row = (data as { room_id: string; room_code: string }[])[0];
      this.code = row.room_code;
      this.roomId = row.room_id;
    }

    this.ch = sb
      .channel(channelName(this.code), {
        config: { presence: { key: 'host' }, broadcast: { self: false, ack: false } },
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'actions', filter: `room_id=eq.${this.roomId}` },
        (p) => this.deliver(p.new as ActionRow),
      )
      .on('presence', { event: 'sync' }, () => {
        const st = this.ch!.presenceState<{ role: string; id: string }>();
        const ids = Object.values(st)
          .flat()
          .filter((m) => m.role === 'player')
          .map((m) => m.id);
        this.presenceCb([...new Set(ids)]);
      })
      .subscribe(async (status) => {
        this.statusCb(mapStatus(status));
        if (status === 'SUBSCRIBED') {
          await this.ch!.track({ role: 'host', id: 'host' });
          await this.catchUp();
        }
      });
    return this.code;
  }

  /** Fetch any actions missed while the socket was down. */
  private async catchUp() {
    const { data } = await getSupabase()
      .from('actions')
      .select('seq, room_id, player_uid, client_id, payload')
      .eq('room_id', this.roomId)
      .gt('seq', this.lastSeq)
      .order('seq', { ascending: true })
      .limit(500);
    for (const row of (data ?? []) as ActionRow[]) this.deliver(row);
  }

  private deliver(row: ActionRow) {
    if (row.seq <= this.lastSeq) return;
    this.lastSeq = row.seq;
    this.actionCb({ id: row.client_id, playerId: row.player_uid, seq: row.seq, action: row.payload });
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

  publish(state: PublicState, persist: boolean) {
    void this.ch?.send({ type: 'broadcast', event: 'state', payload: state });
    this.pending = state;
    // Throttle DB snapshot writes to ~1/sec, but always flush phase changes.
    const now = Date.now();
    if (persist || now - this.lastPersist > 1000) {
      this.flush();
    } else if (!this.persistTimer) {
      this.persistTimer = window.setTimeout(() => this.flush(), 1000);
    }
  }

  private flush() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const s = this.pending;
    if (!s || !this.roomId) return;
    this.lastPersist = Date.now();
    void getSupabase()
      .from('rooms')
      .update({ public_state: s, phase: s.phase, updated_at: new Date().toISOString() })
      .eq('id', this.roomId)
      .then(() => undefined);
  }

  async close(clearData: boolean) {
    if (clearData && this.code) {
      await this.ch?.send({ type: 'broadcast', event: 'closed', payload: {} });
      await getSupabase().rpc('close_room', { p_code: this.code });
    }
    if (this.ch) await getSupabase().removeChannel(this.ch);
    this.ch = null;
  }
}

export class SupabasePlayerTransport implements PlayerTransport {
  readonly kind = 'supabase' as const;
  private ch: RealtimeChannel | null = null;
  private code = '';
  private playerId = '';
  private lastSeq = -1;
  private stateCb: (s: PublicState) => void = () => {};
  private hostCb: (o: boolean) => void = () => {};
  private statusCb: (s: ConnectionStatus) => void = () => {};

  async connect(code: string) {
    this.code = code;
    this.playerId = await ensureSignedIn();
    await this.fetchSnapshot(true);

    const sb = getSupabase();
    this.ch = sb
      .channel(channelName(code), {
        config: { presence: { key: this.playerId }, broadcast: { self: false } },
      })
      .on('broadcast', { event: 'state' }, ({ payload }) => this.accept(payload as PublicState))
      .on('broadcast', { event: 'closed' }, () => {
        this.hostCb(false);
        this.statusCb('offline');
      })
      .on('presence', { event: 'sync' }, () => {
        const st = this.ch!.presenceState<{ role: string }>();
        this.hostCb(Object.values(st).flat().some((m) => m.role === 'host'));
      })
      .subscribe(async (status) => {
        this.statusCb(mapStatus(status));
        if (status === 'SUBSCRIBED') {
          await this.ch!.track({ role: 'player', id: this.playerId });
          await this.fetchSnapshot(false).catch(() => undefined);
        }
      });
    return this.playerId;
  }

  private async fetchSnapshot(strict: boolean) {
    const { data, error } = await getSupabase().rpc('get_room_state', { p_code: this.code });
    if (error) throw new Error('NETWORK');
    const res = data as { exists: boolean; closed: boolean; state: PublicState | null } | null;
    if (!res?.exists) {
      if (strict) throw new Error('ROOM_NOT_FOUND');
      return;
    }
    if (res.closed && strict) throw new Error('ROOM_CLOSED');
    if (res.state) this.accept(res.state, true);
  }

  private accept(s: PublicState, force = false) {
    // Drop stale/out-of-order snapshots (seq resets when the host restarts, so allow big drops).
    if (!force && s.seq <= this.lastSeq && this.lastSeq - s.seq < 50) return;
    this.lastSeq = s.seq;
    this.stateCb(s);
  }

  async join(profile: JoinProfile): Promise<SendResult> {
    const { error } = await getSupabase().rpc('join_room', {
      p_code: this.code,
      p_name: profile.name,
      p_colour: profile.colour,
      p_avatar: profile.avatar,
      p_client_id: uid(),
    });
    return error ? { ok: false, error: errorCode(error) } : { ok: true };
  }

  async send(action: PlayerAction): Promise<SendResult> {
    const { error } = await getSupabase().rpc('submit_action', {
      p_code: this.code,
      p_client_id: uid(),
      p_payload: action,
    });
    return error ? { ok: false, error: errorCode(error) } : { ok: true };
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
    if (this.ch) void getSupabase().removeChannel(this.ch);
    this.ch = null;
  }
}
