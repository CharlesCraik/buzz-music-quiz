import { useEffect, useState } from 'react';
import type { ProviderState } from '../../music/provider';
import type { HostGame } from '../useHostGame';

function useProviderState(game: HostGame): ProviderState | null {
  const sdk = game.music.sdk;
  const [st, setSt] = useState<ProviderState | null>(sdk?.state() ?? null);
  useEffect(() => (sdk ? sdk.onState(setSt) : undefined), [sdk]);
  return st;
}

/** Host-only control bar. Lives on the TV screen but collapses out of the way. */
export function HostControls({
  game,
  needsSpotify,
  onCloseRoom,
  onNewQuestions,
}: {
  game: HostGame;
  needsSpotify: boolean;
  onCloseRoom: () => void;
  onNewQuestions: () => void;
}) {
  const [open, setOpen] = useState(() => window.innerWidth >= 1024);
  const [peek, setPeek] = useState(false);
  const pub = game.pub;
  const sdkState = useProviderState(game);
  const phase = pub?.phase;

  // Initialise the Spotify player as soon as we know Spotify songs are coming.
  useEffect(() => {
    if (needsSpotify && game.music.mode === 'sdk') void game.music.sdk?.init();
  }, [needsSpotify, game.music]);

  // Keyboard shortcuts: Space/Enter/→ = next, P = pause, S = skip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (phase === 'LOBBY') game.command('start');
        else game.command('next');
      } else if (e.key === 'p' || e.key === 'P') {
        game.command(pub?.paused ? 'resume' : 'pause');
      } else if (e.key === 's' || e.key === 'S') {
        game.command('skip');
      } else if (e.key === 'h' || e.key === 'H') {
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, phase, pub?.paused]);

  if (!pub) return null;
  const inGame = phase !== 'LOBBY' && phase !== 'GAME_RESULTS';
  const canNext = phase === 'ROUND_INTRO' || phase === 'REVEAL' || phase === 'ROUND_RESULTS';

  const audioNeedsClick =
    needsSpotify && game.music.mode === 'sdk' && sdkState && (sdkState.status === 'needs-gesture' || sdkState.status === 'idle');

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-end gap-2 p-2 sm:p-3">
      {(audioNeedsClick || (needsSpotify && sdkState?.status === 'error') || game.musicError) && (
        <div className="chunky-sm pointer-events-auto flex max-w-xl flex-wrap items-center gap-3 bg-sunflower p-3">
          <span className="text-sm font-semibold">
            {game.musicError ?? sdkState?.status === 'error'
              ? (game.musicError ?? (sdkState as { detail: string }).detail)
              : 'Spotify is ready. Browsers need one click before the TV can play music.'}
          </span>
          {sdkState?.status !== 'error' && (
            <button className="btn-ghost text-base" onClick={() => void game.music.sdk?.activate()}>
              Enable audio
            </button>
          )}
          {sdkState?.status === 'error' && (
            <button
              className="btn-ghost text-base"
              onClick={() => {
                game.music.mode = 'manual';
              }}
            >
              Switch to manual play
            </button>
          )}
        </div>
      )}

      {game.cue && (
        <div className="chunky-sm pointer-events-auto flex items-center gap-3 bg-cream p-3">
          <span className="text-sm font-semibold">Manual mode: start the song in Spotify now.</span>
          {peek ? (
            <a
              className="btn-ghost text-base"
              href={`https://open.spotify.com/track/${game.cue.uri.split(':').pop()}`}
              target="_blank"
              rel="noreferrer"
            >
              Open in Spotify
            </a>
          ) : (
            <button className="btn-ghost text-base" onClick={() => setPeek(true)}>
              Show song (host only!)
            </button>
          )}
        </div>
      )}

      <div className="chunky-sm pointer-events-auto flex flex-wrap items-center justify-end gap-2 bg-ink-2 p-2 text-cream">
        <button className="btn-dark px-3 text-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide host controls' : 'Host controls'}
        </button>
        {!open && inGame && (
          <button className="btn-primary px-3 text-sm" disabled={!canNext || pub.paused} onClick={() => game.command('next')}>
            Next ›
          </button>
        )}
        {open && (
          <>
            {phase === 'LOBBY' && (
              <button className="btn-primary text-base" onClick={() => game.command('start')} disabled={pub.players.length === 0}>
                Start
              </button>
            )}
            {inGame && (
              <>
                <button className="btn-primary text-base" disabled={!canNext || pub.paused} onClick={() => game.command('next')}>
                  Next ›
                </button>
                <button className="btn-ghost text-base" onClick={() => game.command(pub.paused ? 'resume' : 'pause')}>
                  {pub.paused ? 'Resume' : 'Pause'}
                </button>
                <button className="btn-ghost text-base" disabled={pub.paused} onClick={() => game.command('skip')}>
                  Skip
                </button>
                <button
                  className="btn-ghost text-base"
                  onClick={() => {
                    if (confirm('End the game now and show the final scores?')) game.command('end');
                  }}
                >
                  End game
                </button>
              </>
            )}
            {phase === 'GAME_RESULTS' && (
              <>
                <button className="btn-primary text-base" onClick={onNewQuestions}>
                  New game, same players
                </button>
                <button className="btn-ghost text-base" onClick={() => game.command('toLobby')}>
                  Replay same questions
                </button>
              </>
            )}
            <button className="btn-dark px-3 text-sm" onClick={() => game.setSfxOn(!game.sfxOn)} aria-pressed={game.sfxOn}>
              {game.sfxOn ? 'Sounds on' : 'Sounds off'}
            </button>
            <button
              className="btn-dark px-3 text-sm"
              onClick={() => {
                if (confirm('Close this room and clear all game data? Players will be disconnected.')) onCloseRoom();
              }}
            >
              Close room
            </button>
          </>
        )}
      </div>
    </div>
  );
}
