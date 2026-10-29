import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MAX_PLAYERS, type PlayerAction } from '../game/types';
import type { PublicState } from '../game/view';
import { normaliseCode } from '../lib/id';
import { load, save } from '../lib/storage';
import {
  createPlayerTransport,
  ERROR_TEXT,
  errorCode,
  type ConnectionStatus,
  type JoinProfile,
  type PlayerTransport,
} from '../realtime';
import { Avatar } from '../ui/Avatar';
import { Logo } from '../ui/decor';
import { useWakeLock } from '../ui/hooks';
import { Controller } from './Controller';
import { JoinForm } from './JoinForm';

const PROFILE_KEY = 'bb-profile';

function CodeEntry({ initial, error, onSubmit }: { initial: string; error: string | null; onSubmit: (c: string) => void }) {
  const [code, setCode] = useState(initial);
  return (
    <form
      className="stage-bg flex min-h-dvh flex-col items-center justify-center gap-6 px-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 4) onSubmit(code);
      }}
    >
      <Logo size="md" />
      <div className="chunky flex w-full max-w-sm flex-col gap-4 bg-sunflower p-5">
        <label className="flex flex-col gap-2">
          <span className="font-display text-2xl font-bold">Room code</span>
          <input
            className="field text-center text-4xl tracking-[0.3em] uppercase"
            value={code}
            onChange={(e) => setCode(normaliseCode(e.target.value))}
            placeholder="ABCD"
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
          />
        </label>
        {error && <p className="chunky-sm bg-tomato p-3 font-semibold text-cream">{error}</p>}
        <button className="btn-ghost min-h-16 text-2xl" disabled={code.length !== 4}>
          Join
        </button>
      </div>
    </form>
  );
}

export default function PlayerApp() {
  const params = useParams();
  const nav = useNavigate();
  const code = normaliseCode(params.code ?? '');
  const [pub, setPub] = useState<PublicState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [hostOnline, setHostOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [connected, setConnected] = useState(false);
  const transport = useRef<PlayerTransport | null>(null);

  const isMember = !!(pub && playerId && pub.players.some((p) => p.id === playerId));
  useWakeLock(isMember);

  useEffect(() => {
    if (code.length !== 4) return;
    const t = createPlayerTransport();
    transport.current = t;
    let cancelled = false;
    t.onState((s) => {
      setPub(s);
      setOffset(s.hostNow - Date.now());
    });
    t.onHostOnline(setHostOnline);
    t.onStatus(setStatus);
    setError(null);
    t.connect(code)
      .then((id) => {
        if (cancelled) return;
        setPlayerId(id);
        setConnected(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(ERROR_TEXT[errorCode(e)] ?? String(e));
        setConnected(false);
      });
    return () => {
      cancelled = true;
      t.disconnect();
    };
  }, [code]);

  const send = useCallback(async (a: PlayerAction) => {
    if (!transport.current) return { ok: false as const, error: 'NETWORK' };
    return transport.current.send(a);
  }, []);

  const join = async (profile: JoinProfile) => {
    if (!transport.current) return;
    save(PROFILE_KEY, profile);
    setJoining(true);
    setError(null);
    if (pub && pub.players.length >= MAX_PLAYERS) {
      setJoining(false);
      setError(ERROR_TEXT.ROOM_FULL);
      return;
    }
    const res = await transport.current.join(profile);
    // Stay in "joining" until the host's state includes us.
    if (!res.ok) {
      setJoining(false);
      setError(ERROR_TEXT[res.error] ?? 'Could not join.');
    }
  };

  if (code.length !== 4 || (error && !connected)) {
    return <CodeEntry initial={code} error={error} onSubmit={(c) => nav(`/join/${c}`)} />;
  }

  if (!connected || !pub || !playerId) {
    return (
      <main className="stage-bg flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <Avatar id="headphones" colour="sky" size={120} bob />
        <p className="font-display text-2xl text-cream">Finding room {code}…</p>
      </main>
    );
  }

  const me = pub.players.find((p) => p.id === playerId);
  if (!me) {
    return (
      <JoinForm
        pub={pub}
        initial={load<JoinProfile>(PROFILE_KEY)}
        onJoin={(p) => void join(p)}
        busy={joining}
        error={error}
      />
    );
  }

  return <Controller pub={pub} me={me} offset={offset} status={status} hostOnline={hostOnline} send={send} />;
}
