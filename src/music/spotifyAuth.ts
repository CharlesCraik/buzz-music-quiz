import { env } from '../lib/env';
import { load, remove, save } from '../lib/storage';

/**
 * Spotify Authorization Code flow with PKCE, entirely in the host browser.
 * No client secret is used or needed. Tokens live only in this browser's localStorage.
 */

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
];

const TOKEN_KEY = 'bb-spotify-token';
const CLIENT_ID_KEY = 'bb-spotify-client-id';

/**
 * Which Spotify app to sign in through. Every host must paste the Client ID of
 * their OWN Spotify developer app; there is deliberately no site-wide default, so
 * nobody can sign in through (or use) the site owner's app.
 * PKCE needs no client secret, so only the public Client ID is ever stored.
 */
export function getSpotifyClientId(): string {
  return load<string>(CLIENT_ID_KEY) ?? '';
}

export function usingCustomSpotifyApp(): boolean {
  return !!load<string>(CLIENT_ID_KEY);
}

export function setSpotifyClientId(id: string | null) {
  const clean = (id ?? '').trim();
  const prev = getSpotifyClientId();
  if (clean) save(CLIENT_ID_KEY, clean);
  else remove(CLIENT_ID_KEY);
  // Tokens belong to a specific app: switching apps means signing in again.
  if (getSpotifyClientId() !== prev) remove(TOKEN_KEY);
}

export function hasSpotifyClient(): boolean {
  return !!getSpotifyClientId();
}

export function isValidClientId(id: string): boolean {
  return /^[0-9a-f]{32}$/i.test(id.trim());
}
const VERIFIER_KEY = 'bb-spotify-verifier';
const RETURN_KEY = 'bb-spotify-return';

interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

function randomString(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function isSpotifyConnected(): boolean {
  return !!load<StoredToken>(TOKEN_KEY);
}

export async function startSpotifyLogin(returnTo = '/host'): Promise<void> {
  const verifier = randomString(64);
  save(VERIFIER_KEY, verifier);
  save(RETURN_KEY, returnTo);
  const state = randomString(16);
  sessionStorage.setItem('bb-spotify-state', state);
  const params = new URLSearchParams({
    client_id: getSpotifyClientId(),
    response_type: 'code',
    redirect_uri: env.spotifyRedirectUri,
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    scope: SPOTIFY_SCOPES.join(' '),
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

async function tokenRequest(body: Record<string, string>): Promise<StoredToken> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: getSpotifyClientId(), ...body }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Spotify token error ${res.status}`);
  }
  const prev = load<StoredToken>(TOKEN_KEY);
  const token: StoredToken = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? prev?.refreshToken ?? '',
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    scope: json.scope ?? prev?.scope ?? '',
  };
  save(TOKEN_KEY, token);
  return token;
}

/** Handle the /callback redirect. Returns the path to go back to. */
export async function completeSpotifyLogin(search: string): Promise<string> {
  const params = new URLSearchParams(search);
  const err = params.get('error');
  if (err) throw new Error(err === 'access_denied' ? 'Spotify access was cancelled.' : err);
  const code = params.get('code');
  const state = params.get('state');
  const expected = sessionStorage.getItem('bb-spotify-state');
  if (!code) throw new Error('Missing code from Spotify.');
  if (expected && state !== expected) throw new Error('Spotify login state mismatch. Please try again.');
  const verifier = load<string>(VERIFIER_KEY);
  if (!verifier) throw new Error('Login session expired. Please try connecting again.');
  await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.spotifyRedirectUri,
    code_verifier: verifier,
  });
  remove(VERIFIER_KEY);
  sessionStorage.removeItem('bb-spotify-state');
  return load<string>(RETURN_KEY) ?? '/host';
}

let refreshing: Promise<StoredToken> | null = null;

export async function getSpotifyToken(): Promise<string> {
  const t = load<StoredToken>(TOKEN_KEY);
  if (!t) throw new Error('SPOTIFY_NOT_CONNECTED');
  if (t.expiresAt - Date.now() > 60_000) return t.accessToken;
  if (!t.refreshToken) throw new Error('SPOTIFY_NOT_CONNECTED');
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refreshToken }).finally(
    () => {
      refreshing = null;
    },
  );
  try {
    return (await refreshing).accessToken;
  } catch {
    remove(TOKEN_KEY);
    throw new Error('SPOTIFY_NOT_CONNECTED');
  }
}

export function disconnectSpotify(): void {
  remove(TOKEN_KEY);
}
