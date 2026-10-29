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
  onProgress(`Writing ${req.count} questions${req.songCount ? ` and picking ${req.songCount} songs` : ''}… (about a minute)`);
  const avoid = recentPrompts().slice(0, 60);
  // Two half-size requests in parallel: faster than one big one, and each covers different ground.
  const half = (n: number, i: number) => (i === 0 ? Math.ceil(n / 2) : Math.floor(n / 2));
  const splitList = (xs: string[], i: number) => (xs.length > 1 ? xs.filter((_, k) => k % 2 === i) : xs);
  const batches = await Promise.allSettled(
    [0, 1].map((i) =>
      requestPack({
        ...req,
        count: Math.max(4, half(req.count, i)),
        songCount: half(req.songCount, i),
        avoidPrompts: avoid,
        batchNote:
          req.mode === 'category'
            ? `This is batch ${i + 1} of 2. Focus mainly on: ${[...splitList(req.categories, i), ...splitList(req.decades, i)].join(', ') || 'a broad mix'}.`
            : `This is batch ${i + 1} of 2. Focus mainly on songs ${i === 0 ? 'in the first half' : 'in the second half'} of the list.`,
      }),
    ),
  );
  const ok = batches.filter((b): b is PromiseFulfilledResult<Awaited<ReturnType<typeof requestPack>>> => b.status === 'fulfilled');
  if (ok.length === 0) throw (batches[0] as PromiseRejectedResult).reason;
  const parsed = GenerateResponseSchema.safeParse({
    questions: ok.flatMap((b) => b.value.questions),
    songs: ok.flatMap((b) => b.value.songs),
  });
  if (!parsed.success) throw new Error('The quiz writer returned something unexpected. Try again.');

  onProgress('Checking questions…');
  const report = validateGenerated(parsed.data.questions, {
    recentPrompts: avoid,
    tracks: playlistTracks,
  });

  // Category mode: resolve suggested songs on Spotify, dropping anything not found.
  const tracks: Track[] = [...playlistTracks];
  const unresolved: string[] = [];
  const seenSongs = new Set<string>();
  const songs = parsed.data.songs
    .map((s) => GeneratedSongSchema.safeParse(s))
    .filter((r) => r.success)
    .map((r) => r.data!)
    .filter((s) => {
      const k = `${normaliseAnswer(s.title)}|${normaliseAnswer(s.artist)}`;
      if (seenSongs.has(k)) return false;
      seenSongs.add(k);
      return true;
    });
  if (songs.length > 0 && env.spotifyClientId) {
    onProgress(`Finding ${songs.length} songs on Spotify…`);
    // Look songs up 4 at a time.
    let next = 0;
    const worker = async () => {
      while (next < songs.length) {
        const song = songs[next++];
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
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
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
