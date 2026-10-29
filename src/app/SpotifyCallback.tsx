import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeSpotifyLogin } from '../music/spotifyAuth';
import { Logo } from '../ui/decor';

export function SpotifyCallback() {
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    completeSpotifyLogin(window.location.search)
      .then((to) => nav(to, { replace: true }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [nav]);

  return (
    <main className="stage-bg grid min-h-dvh place-items-center p-6">
      <div className="chunky flex max-w-md flex-col items-center gap-4 bg-cream p-8 text-center">
        <Logo size="sm" light={false} />
        {error ? (
          <>
            <p className="font-display text-xl">Spotify connection failed</p>
            <p className="text-ink/70">{error}</p>
            <button className="btn-primary" onClick={() => nav('/host', { replace: true })}>
              Back to setup
            </button>
          </>
        ) : (
          <p className="font-display text-xl">Connecting to Spotify…</p>
        )}
      </div>
    </main>
  );
}
