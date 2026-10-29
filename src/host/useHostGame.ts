import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame, reduce } from '../game/engine';
import type { GameState } from '../game/state';
import type { Effect, EngineEvent, HostCommand } from '../game/types';
import { publicKey, toPublic, type PublicState } from '../game/view';
import { MusicRouter } from '../music/router';
import { createHostTransport, type ConnectionStatus, type HostTransport } from '../realtime';
import { playSfx } from '../sfx/sfx';
import { clearSession, loadPrepared, loadSession, saveSession } from './prepared';

const TICK_MS = 250;
const SAVE_EVERY_MS = 1000;
const REPUBLISH_MS = 5000;

export interface HostGame {
  code: string | null;
  state: GameState | null;
  pub: PublicState | null;
  status: ConnectionStatus;
  error: string | null;
  musicError: string | null;
  cue: { uri: string; startMs: number } | null;
  music: MusicRouter;
  command(cmd: HostCommand): void;
  kick(playerId: string): void;
  closeRoom(): Promise<void>;
  sfxOn: boolean;
  setSfxOn(v: boolean): void;
}

export function useHostGame(): HostGame {
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [pub, setPub] = useState<PublicState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [cue, setCue] = useState<{ uri: string; startMs: number } | null>(null);
  const [sfxOn, setSfxOn] = useState(true);

  const stateRef = useRef<GameState | null>(null);
  const transportRef = useRef<HostTransport | null>(null);
  const musicRef = useRef<MusicRouter | null>(null);
  const lastKey = useRef('');
  const lastPhase = useRef('');
  const lastSave = useRef(0);
  const sfxRef = useRef(true);
  const dispatchRef = useRef<((ev: EngineEvent) => void) | null>(null);
  sfxRef.current = sfxOn;

  musicRef.current ??= new MusicRouter();
  const music = musicRef.current;

  const runEffects = useCallback(
    (effects: Effect[]) => {
      for (const e of effects) {
        switch (e.type) {
          case 'sfx':
            if (sfxRef.current) playSfx(e.name);
            break;
          case 'play': {
            setMusicError(null);
            const key = e.key;
            void music.play(e.uri, e.startMs, e.durationMs).then((res) => {
              // Tell the engine so it can start the timer only once the music is audible.
              if (res.status === 'started') dispatchRef.current?.({ type: 'audio', key, status: 'started' });
              else if (res.status === 'failed') {
                setMusicError(res.error);
                dispatchRef.current?.({ type: 'audio', key, status: 'failed', detail: res.error });
              }
              // 'manual': host presses "It's playing" which sends the audioStarted command.
            });
            break;
          }

          case 'pauseAudio':
            void music.pause();
            break;
          case 'resumeAudio':
            void music.resume();
            break;
          case 'stopAudio':
            void music.stop();
            break;
        }
      }
    },
    [music],
  );

  const publish = useCallback((s: GameState, force = false) => {
    const p = toPublic(s, Date.now());
    const key = publicKey(p);
    const phaseChanged = s.phase !== lastPhase.current;
    if (force || key !== lastKey.current) {
      lastKey.current = key;
      lastPhase.current = s.phase;
      transportRef.current?.publish(p, phaseChanged || force);
      setPub(p);
    }
    const now = Date.now();
    if (phaseChanged || now - lastSave.current > SAVE_EVERY_MS) {
      lastSave.current = now;
      saveSession({ code: s.roomCode, state: s, savedAt: now });
    }
  }, []);

  const dispatch = useCallback(
    (ev: EngineEvent) => {
      const cur = stateRef.current;
      if (!cur) return;
      let res;
      try {
        res = reduce(cur, ev, Date.now());
      } catch (e) {
        console.error('Engine error', e);
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
      stateRef.current = res.state;
      setState(res.state);
      runEffects(res.effects);
      publish(res.state);
    },
    [publish, runEffects],
  );
  dispatchRef.current = dispatch;

  // Boot: resume a saved session after refresh, or start fresh from the prepared pack.
  useEffect(() => {
    let cancelled = false;
    const transport = createHostTransport();
    transportRef.current = transport;
    const unsubCue = music.manual.cue.on(setCue);
    music.mode = loadPrepared()?.musicMode ?? music.mode;

    transport.onStatus(setStatus);
    transport.onAction((env) => dispatch({ type: 'action', env }));
    transport.onPresence((online) => dispatch({ type: 'presence', online }));

    (async () => {
      const session = loadSession();
      const prepared = loadPrepared();
      try {
        const roomCode = await transport.open(session?.code ?? null);
        if (cancelled) return;
        let s: GameState;
        if (session && session.code === roomCode) {
          s = session.state;
          // Coming back from a refresh mid-game: pause so nobody loses out.
          if (s.phase !== 'LOBBY' && s.phase !== 'GAME_RESULTS' && !s.paused) {
            s = reduce(s, { type: 'host', cmd: 'pause' }, Date.now()).state;
          }
        } else {
          if (!prepared) {
            setError('No game prepared. Go back to setup.');
            return;
          }
          s = createGame(roomCode, prepared.settings);
          s = reduce(s, { type: 'loadPack', pack: prepared.pack }, Date.now()).state;
        }
        stateRef.current = s;
        setState(s);
        setCode(roomCode);
        publish(s, true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    const tick = window.setInterval(() => dispatch({ type: 'tick' }), TICK_MS);
    // Browsers only allow sound after a user gesture: any click/key on the TV page unlocks it.
    const unlock = () => music.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    const heartbeat = window.setInterval(() => {
      if (stateRef.current) publish(stateRef.current, true);
    }, REPUBLISH_MS);

    return () => {
      cancelled = true;
      clearInterval(tick);
      clearInterval(heartbeat);
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      unsubCue();
      void music.stop();
      void transport.close(false);
    };
  }, [dispatch, publish, music]);

  return {
    code,
    state,
    pub,
    status,
    error,
    musicError,
    cue,
    music,
    command: (cmd) => dispatch({ type: 'host', cmd }),
    kick: (playerId) => dispatch({ type: 'kick', playerId }),
    async closeRoom() {
      await music.stop();
      await transportRef.current?.close(true);
      clearSession();
    },
    sfxOn,
    setSfxOn,
  };
}
