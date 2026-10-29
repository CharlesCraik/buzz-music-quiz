import { normaliseAnswer } from '../game/normalise';
import type { Question, Track } from '../game/types';
import { env, hasSupabase } from '../lib/env';
import { load, save } from '../lib/storage';
import { searchTrack } from '../music/spotifyApi';
import { ensureSignedIn, getSupabase } from '../realtime/supabaseTransport';
import { hasOpenAiKey, requestPack } from './openai';
import { GenerateResponseSchema, GeneratedSongSchema, type GenerateRequest } from './schema';
import { validateGenerated, type ValidationReport } from './validate';

const RECENT_KEY = 'bb-recent-prompts';
const CACHE_KEY = 'bb-cached-packs';

export interface GeneratedMaterial {
  questions: Question[];
  tracks: Track[];
  report: ValidationReport;
  unresolvedSongs: string[];
}

export function canGenerate(): boolean {
  return hasOpenAiKey();
}

export function recentPrompts(): string[] {
  return load<string[]>(RECENT_KEY) ?? [];
}

export function rememberPrompts(prompts: string[]) {
  save(RECENT_KEY, [...prompts, ...recentPrompts()].slice(0, 200));
}

export async function generateMaterial(
  req: Omit<GenerateRequest, 'avoidPrompts'>,
  playlistTracks: Track[] = [],
  onProgress: (msg: string) => void = () => {},
): Promise<GeneratedMaterial> {
  onProgress('Asking the quiz writer for questions…');
  const avoid = recentPrompts().slice(0, 60);
  const data = await requestPack({ ...req, avoidPrompts: avoid });
  const parsed = GenerateResponseSchema.safeParse(data);
  if (!parsed.success) throw new Error('The quiz writer returned something unexpected. Try again.');

  onProgress('Checking questions…');
  const report = validateGenerated(parsed.data.questions, {
    recentPrompts: avoid,
    tracks: playlistTracks,
  });

  // Category mode: resolve suggested songs on Spotify, dropping anything not found.
  const tracks: Track[] = [...playlistTracks];
  const unresolved: string[] = [];
  const songs = parsed.data.songs
    .map((s) => GeneratedSongSchema.safeParse(s))
    .filter((r) => r.success)
    .map((r) => r.data!);
  if (songs.length > 0 && env.spotifyClientId) {
    onProgress(`Finding ${songs.length} songs on Spotify…`);
    for (const song of songs) {
      try {
        const t = await searchTrack(song.title, song.artist);
        const artistOk =
          t && t.artists.some((a) => normaliseAnswer(a).includes(normaliseAnswer(song.artist).split(' ')[0]));
        if (t && artistOk && !tracks.some((x) => x.id === t.id)) tracks.push(t);
        else unresolved.push(`${song.title} — ${song.artist}`);
      } catch {
        unresolved.push(`${song.title} — ${song.artist}`);
      }
    }
  }
  return { questions: report.accepted, tracks, report, unresolvedSongs: unresolved };
}

// ---------- local pack cache (so a game can run if OpenAI is down) ----------

export interface CachedMaterial {
  id: string;
  title: string;
  createdAt: number;
  questions: Question[];
  tracks: Track[];
}

export function cachedMaterials(): CachedMaterial[] {
  return load<CachedMaterial[]>(CACHE_KEY) ?? [];
}

export function cacheMaterial(m: Omit<CachedMaterial, 'id' | 'createdAt'>) {
  const entry: CachedMaterial = { ...m, id: `c${Date.now().toString(36)}`, createdAt: Date.now() };
  save(CACHE_KEY, [entry, ...cachedMaterials()].slice(0, 8));
  // Best effort copy to Supabase for cross-device reuse.
  if (hasSupabase()) {
    void ensureSignedIn()
      .then((uid) =>
        getSupabase()
          .from('question_packs')
          .insert({ owner_uid: uid, title: m.title, questions: { questions: m.questions, tracks: m.tracks } }),
      )
      .catch(() => undefined);
  }
}

export function deleteCachedMaterial(id: string) {
  save(
    CACHE_KEY,
    cachedMaterials().filter((c) => c.id !== id),
  );
}
