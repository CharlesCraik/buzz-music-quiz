import { load, remove, save } from '../lib/storage';
import type { GenerateRequest } from './schema';

/**
 * OpenAI is called directly from the host's browser.
 *
 * The key is entered on the host setup page and kept only in that browser's
 * localStorage. It is never bundled into the deployed site. For local dev only,
 * VITE_OPENAI_API_KEY in .env.local is also read; the production build strips
 * that branch, so the key can't leak into the Netlify bundle.
 */

const KEY_STORAGE = 'bb-openai-key';
const MODEL_STORAGE = 'bb-openai-model';
export const DEFAULT_MODEL = 'gpt-5-mini';

export function getOpenAiKey(): string {
  const stored = load<string>(KEY_STORAGE);
  if (stored) return stored;
  if (import.meta.env.DEV) return (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ?? '';
  return '';
}

/** Strip things people accidentally paste along with the key. */
export function cleanKey(raw: string): string {
  return raw
    .trim()
    .replace(/^(VITE_)?OPENAI_API_KEY\s*=\s*/i, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/\s+/g, '');
}

export function setOpenAiKey(key: string) {
  const k = cleanKey(key);
  if (k) save(KEY_STORAGE, k);
  else remove(KEY_STORAGE);
}

/** Quick check that a key works (lists models). Returns null if OK, else a message. */
export async function testOpenAiKey(key: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${cleanKey(key)}` },
    });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return data.error?.message ?? `OpenAI said ${res.status}`;
  } catch {
    return 'OpenAI rejected the key (or you are offline).';
  }
}

export function getOpenAiModel(): string {
  return load<string>(MODEL_STORAGE) || DEFAULT_MODEL;
}

export function setOpenAiModel(model: string) {
  if (model.trim()) save(MODEL_STORAGE, model.trim());
  else remove(MODEL_STORAGE);
}

export function hasOpenAiKey(): boolean {
  return !!getOpenAiKey();
}

const nullableString = { type: ['string', 'null'] };

export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions', 'songs'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'category',
          'difficulty',
          'prompt',
          'options',
          'correctIndex',
          'explanation',
          'trackTitle',
          'artist',
          'releaseYear',
          'sourceNotes',
        ],
        properties: {
          category: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          prompt: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          correctIndex: { type: 'integer' },
          explanation: { type: 'string' },
          trackTitle: nullableString,
          artist: nullableString,
          releaseYear: { type: ['integer', 'null'] },
          sourceNotes: { type: 'string' },
        },
      },
    },
    songs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'artist', 'releaseYear'],
        properties: {
          title: { type: 'string' },
          artist: { type: 'string' },
          releaseYear: { type: ['integer', 'null'] },
        },
      },
    },
  },
};

export function buildPrompt(r: GenerateRequest): { system: string; user: string } {
  const system = [
    'You write questions for a lively family music quiz party game played on a TV.',
    'Rules for every question:',
    '- Exactly 4 options, all plausible, all different, and only ONE can be correct.',
    '- correctIndex is the 0-based index of the correct option. Vary its position.',
    '- Only use facts you are highly confident about. Skip anything obscure, disputed or easily confused (re-releases, covers, chart positions).',
    '- No trick wording, no "which of these is NOT", no ambiguous dates. Prompts under 120 characters, options under 40.',
    '- explanation: one short, fun sentence confirming the answer.',
    '- sourceNotes: the basis for the fact (e.g. "Track metadata supplied" or "Widely documented release").',
    '- trackTitle/artist/releaseYear: fill when the question is about a specific song, else null.',
    r.familyFriendly ? '- Family friendly: nothing explicit, violent or about drugs.' : '',
  ]
    .filter(Boolean)
    .join('\n');

  const ds = [...new Set(r.difficulties)];
  const diff =
    ds.length === 1
      ? `all ${ds[0]}`
      : `an even mix of ${ds.join(', ')} (label each question's difficulty accurately)`;
  const lines = [`Write ${r.count} multiple-choice music questions. Difficulty: ${diff}.`];
  if (r.batchNote) lines.push(r.batchNote);

  if (r.mode === 'playlist' && r.tracks?.length) {
    lines.push(
      "Base the questions on these songs from the players' own playlist. Treat this metadata as the source of truth:",
      ...r.tracks.map(
        (t, i) =>
          `${i + 1}. "${t.title}" by ${t.artists.join(', ')}${t.album ? ` (album: ${t.album})` : ''}${t.year ? ` [${t.year}]` : ''}`,
      ),
      'Good question types: which artist performs a song, which song is by an artist, which decade/year a song came out (use the metadata year), which album a song is on, well-known facts about these artists.',
      'Use other songs/artists from the list as distractors where possible.',
      'Return an empty songs array.',
    );
  } else {
    if (r.categories.length) lines.push(`Categories/genres: ${r.categories.join(', ')}.`);
    if (r.decades.length) lines.push(`Decades: ${r.decades.join(', ')}.`);
    lines.push(
      `Also return ${r.songCount} songs for the music rounds (Name That Tune, Bingo, Musical Chairs…): well-known, recognisable hits spread across ALL the listed categories and decades, each by a different artist where possible, with exact official titles and primary artist names as they appear on Spotify. Easier difficulty = bigger hits.`,
    );
  }
  if (r.avoidPrompts?.length) {
    lines.push('Do not repeat or closely paraphrase these recent questions:', ...r.avoidPrompts.map((p) => `- ${p}`));
  }
  return { system, user: lines.join('\n') };
}

/** Call the OpenAI Responses API with Structured Outputs. Returns the parsed JSON. */
export async function requestPack(req: GenerateRequest): Promise<{ questions: unknown[]; songs: unknown[] }> {
  const apiKey = getOpenAiKey();
  if (!apiKey) throw new Error('Add your OpenAI API key on this page first.');
  const { system, user } = buildPrompt(req);

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 240_000);
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getOpenAiModel(),
        input: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        text: { format: { type: 'json_schema', name: 'music_quiz_pack', strict: true, schema: RESPONSE_SCHEMA } },
      }),
    });
  } catch (e) {
    throw new Error(
      e instanceof Error && e.name === 'AbortError' ? 'OpenAI timed out. Try again.' : 'Could not reach OpenAI. This usually means the API key is wrong or revoked (OpenAI blocks browser error replies), or you are offline. Check the key and try again.',
      { cause: e },
    );
  } finally {
    clearTimeout(timer);
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    output_text?: string;
    output?: { content?: { type: string; text?: string }[] }[];
  };
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`OpenAI rejected the request: ${data.error?.message ?? 'invalid API key'}. Re-save the key on this page.`);
    }
    if (res.status === 429) throw new Error('OpenAI rate limit or quota hit. Wait a minute or check your billing.');
    throw new Error(data.error?.message ?? `OpenAI error ${res.status}`);
  }

  let text = data.output_text ?? '';
  if (!text && Array.isArray(data.output)) {
    for (const item of data.output) {
      for (const c of item.content ?? []) {
        if (c.type === 'output_text' && c.text) text += c.text;
        if (c.type === 'refusal') throw new Error('The model refused this request.');
      }
    }
  }
  try {
    const parsed = JSON.parse(text) as { questions?: unknown[]; songs?: unknown[] };
    return { questions: parsed.questions ?? [], songs: parsed.songs ?? [] };
  } catch (e) {
    throw new Error('OpenAI returned something unexpected. Try again.', { cause: e });
  }
}
