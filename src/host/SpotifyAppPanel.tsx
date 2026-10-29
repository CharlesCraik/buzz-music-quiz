import { useState } from 'react';
import { env } from '../lib/env';
import { getSpotifyClientId, isValidClientId, setSpotifyClientId, usingCustomSpotifyApp } from '../music/spotifyAuth';

/**
 * Lets any host use their own Spotify developer app (Client ID only, no secret).
 * Spotify Development Mode apps only allow the app owner plus 5 listed users,
 * so each family should create their own free app.
 */
export function SpotifyAppPanel({ onChange }: { onChange: () => void }) {
  const [open, setOpen] = useState(!usingCustomSpotifyApp());
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const custom = usingCustomSpotifyApp();
  const redirect = env.spotifyRedirectUri;

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>
          Using your Spotify app ({getSpotifyClientId().slice(0, 6)}…).
        </span>
        <button className="font-semibold underline" onClick={() => setOpen(true)}>
          Change
        </button>
        <button
          className="font-semibold underline"
          onClick={() => {
            setSpotifyClientId(null);
            onChange();
          }}
        >
          Remove from this browser
        </button>
      </div>
    );
  }

  return (
    <form
      className="chunky-sm flex flex-col gap-3 bg-cream p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isValidClientId(draft)) {
          setProblem('A Client ID is 32 letters and numbers, e.g. 1a2b3c… Copy it from your app\'s Settings page.');
          return;
        }
        setSpotifyClientId(draft);
        setDraft('');
        setProblem(null);
        setOpen(false);
        onChange();
      }}
    >
      <p className="font-display text-lg font-semibold">Connect your own Spotify app (free, 3 minutes)</p>
      <p className="text-sm">Each host uses their own Spotify app and account. You only do this once per browser.</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          Go to{' '}
          <a className="underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
            developer.spotify.com/dashboard
          </a>{' '}
          and log in with <strong>your</strong> Spotify (Premium) account.
        </li>
        <li>
          <strong>Create app</strong>. Any name. Tick <strong>Web API</strong> and <strong>Web Playback SDK</strong>.
        </li>
        <li>
          Under <strong>Redirect URIs</strong> add exactly:
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <code className="rounded bg-paper px-2 py-1 text-xs break-all">{redirect}</code>
            <button
              type="button"
              className="rounded border-2 border-ink px-2 text-xs font-semibold"
              onClick={() => {
                void navigator.clipboard?.writeText(redirect).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </span>
        </li>
        <li>
          Save, open <strong>Settings</strong>, copy the <strong>Client ID</strong> and paste it below. (No secret needed,
          never paste the Client Secret.)
        </li>
      </ol>
      <input
        className="field text-base"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Client ID (32 characters)"
        autoComplete="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
      />
      {problem && <p className="chunky-sm bg-tomato p-2 text-sm font-semibold text-cream">{problem}</p>}
      <p className="text-xs text-ink/60">Saved only in this browser. Switching apps signs you out of Spotify here.</p>
      <div className="flex gap-2">
        <button className="btn-primary text-base" disabled={!draft.trim()}>
          Save Client ID
        </button>
        {custom && (
          <button type="button" className="btn-ghost text-base" onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
