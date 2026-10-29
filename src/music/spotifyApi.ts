import type { Track } from '../game/types';
import { getSpotifyToken } from './spotifyAuth';

/**
 * Thin Spotify Web API client. Follows the February 2026 Development Mode rules:
 * playlist contents come from /playlists/{id}/items (owned/collaborative only,
 * nested object is `item`), search limit max 10, /me has no `product` field.
 */

const API = 'https://api.spotify.com/v1';

export class SpotifyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function spotifyFetch<T>(path: string, init: RequestInit = {}, retries = 2): Promise<T> {
  const token = await getSpotifyToken();
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (res.status === 429 && retries > 0) {
    const wait = Number(res.headers.get('Retry-After') ?? '1') * 1000;
    await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
    return spotifyFetch<T>(path, init, retries - 1);
  }
  if (res.status === 204 || res.status === 202) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const msg = json?.error?.message ?? res.statusText;
    throw new SpotifyError(res.status, explain(res.status, msg));
  }
  return json as T;
}

function explain(status: number, msg: string): string {
  if (status === 401) return 'Spotify session expired. Reconnect Spotify.';
  if (status === 403) {
    if (/premium/i.test(msg)) return 'Spotify Premium is required for playback.';
    return `Spotify refused the request (${msg}). Check your account is added under User Management in the Spotify developer dashboard.`;
  }
  if (status === 404 && /device/i.test(msg)) return 'Spotify player device was lost. Click "Enable audio" again.';
  return `Spotify error ${status}: ${msg}`;
}

interface SpotifyTrackObj {
  id: string;
  uri: string;
  name: string;
  type?: string;
  is_local?: boolean;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; release_date?: string; images?: { url: string; width: number }[] };
}

export function toTrack(t: SpotifyTrackObj): Track {
  const year = t.album.release_date ? Number(t.album.release_date.slice(0, 4)) : null;
  return {
    id: t.id,
    uri: t.uri,
    title: t.name,
    artists: t.artists.map((a) => a.name),
    album: t.album.name,
    year: Number.isFinite(year) ? year : null,
    durationMs: t.duration_ms,
    artworkUrl: t.album.images?.[0]?.url ?? null,
  };
}

export interface PlaylistSummary {
  id: string;
  name: string;
  imageUrl: string | null;
  owner: string;
  total: number | null;
}

export async function getMe() {
  return spotifyFetch<{ id: string; display_name: string | null }>('/me');
}

export async function getMyPlaylists(): Promise<PlaylistSummary[]> {
  const out: PlaylistSummary[] = [];
  let url: string | null = '/me/playlists?limit=50';
  while (url && out.length < 200) {
    const page: {
      items: {
        id: string;
        name: string;
        images?: { url: string }[] | null;
        owner: { display_name?: string; id: string };
        items?: { total: number };
        tracks?: { total: number };
      }[];
      next: string | null;
    } = await spotifyFetch(url);
    for (const p of page.items ?? []) {
      if (!p) continue;
      out.push({
        id: p.id,
        name: p.name,
        imageUrl: p.images?.[0]?.url ?? null,
        owner: p.owner.display_name ?? p.owner.id,
        total: p.items?.total ?? p.tracks?.total ?? null,
      });
    }
    url = page.next;
  }
  return out;
}

export async function getPlaylistTracks(playlistId: string, max = 150): Promise<Track[]> {
  const out: Track[] = [];
  let url: string | null = `/playlists/${playlistId}/items?limit=50`;
  while (url && out.length < max) {
    const page: { items: { item?: SpotifyTrackObj | null; track?: SpotifyTrackObj | null }[]; next: string | null } =
      await spotifyFetch(url);
    for (const row of page.items ?? []) {
      const t = row.item ?? row.track;
      if (!t || t.is_local || (t.type && t.type !== 'track') || !t.id) continue;
      out.push(toTrack(t));
    }
    url = page.next;
  }
  if (out.length === 0) {
    throw new Error(
      "No playable tracks found. Spotify only shares songs from playlists you own or collaborate on — try one of your own playlists.",
    );
  }
  return out;
}

export async function searchTrack(title: string, artist: string): Promise<Track | null> {
  const q = `track:${title.replace(/"/g, '')} artist:${artist.replace(/"/g, '')}`;
  const res = await spotifyFetch<{ tracks: { items: SpotifyTrackObj[] } }>(
    `/search?type=track&limit=5&q=${encodeURIComponent(q)}`,
  );
  const items = res.tracks?.items ?? [];
  if (items.length > 0) return toTrack(items[0]);
  // Looser fallback query.
  const res2 = await spotifyFetch<{ tracks: { items: SpotifyTrackObj[] } }>(
    `/search?type=track&limit=5&q=${encodeURIComponent(`${title} ${artist}`)}`,
  );
  const hit = res2.tracks?.items?.[0];
  return hit ? toTrack(hit) : null;
}

// ---------- Player (Connect) endpoints ----------

export async function transferPlayback(deviceId: string) {
  await spotifyFetch('/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

export async function playOnDevice(deviceId: string, uri: string, positionMs: number) {
  await spotifyFetch(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri], position_ms: positionMs }),
  });
}

export async function pauseDevice(deviceId: string) {
  await spotifyFetch(`/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' });
}
