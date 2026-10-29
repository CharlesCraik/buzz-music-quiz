import { normaliseAnswer } from '../game/normalise';
import type { Question, Track } from '../game/types';
import { GeneratedQuestionSchema, type GeneratedQuestion } from './schema';

export interface ValidationReport {
  accepted: Question[];
  rejected: { reason: string; prompt: string }[];
}

const MAX_PROMPT = 200;

function toQuestion(g: GeneratedQuestion, i: number): Question {
  const ids = ['a', 'b', 'c', 'd'];
  return {
    id: `ai-${Date.now().toString(36)}-${i}`,
    category: g.category,
    difficulty: g.difficulty,
    questionType: 'multipleChoice',
    prompt: g.prompt.trim(),
    options: g.options.map((text, j) => ({ id: ids[j], text: text.trim() })),
    correctOptionId: ids[g.correctIndex],
    acceptedAnswers: [normaliseAnswer(g.options[g.correctIndex])],
    explanation: g.explanation.trim(),
    trackTitle: g.trackTitle,
    artist: g.artist,
    releaseYear: g.releaseYear,
    spotifyUri: null,
    sourceNotes: g.sourceNotes,
    verificationStatus: 'unverified',
  };
}

/**
 * Validation pipeline from the spec: schema, unique options, correct option exists,
 * prompt length, duplicates within pack and against recently used prompts,
 * and consistency with supplied track metadata.
 */
export function validateGenerated(
  raw: unknown[],
  opts: { recentPrompts?: string[]; tracks?: Track[] } = {},
): ValidationReport {
  const accepted: Question[] = [];
  const rejected: ValidationReport['rejected'] = [];
  const seen = new Set((opts.recentPrompts ?? []).map(normaliseAnswer));

  raw.forEach((item, i) => {
    const parsed = GeneratedQuestionSchema.safeParse(item);
    const prompt = (item as { prompt?: string })?.prompt ?? '(no prompt)';
    if (!parsed.success) {
      rejected.push({ reason: 'Schema invalid', prompt });
      return;
    }
    const g = parsed.data;
    if (!g.prompt.trim() || g.prompt.length > MAX_PROMPT) {
      rejected.push({ reason: 'Prompt blank or too long', prompt });
      return;
    }
    const normOpts = g.options.map(normaliseAnswer);
    if (normOpts.some((o) => !o) || new Set(normOpts).size !== 4) {
      rejected.push({ reason: 'Duplicate or blank options', prompt });
      return;
    }
    const key = normaliseAnswer(g.prompt);
    if (seen.has(key)) {
      rejected.push({ reason: 'Duplicate question', prompt });
      return;
    }
    if (opts.tracks && g.trackTitle && g.artist && g.releaseYear) {
      const match = opts.tracks.find((t) => normaliseAnswer(t.title) === normaliseAnswer(g.trackTitle!));
      if (match?.year && Math.abs(match.year - g.releaseYear) > 1 && match.artists.some((a) => normaliseAnswer(a) === normaliseAnswer(g.artist!))) {
        // Compilation/remaster dates can differ; only reject if the question is about the year.
        if (/year|when|decade/i.test(g.prompt)) {
          rejected.push({ reason: 'Year conflicts with Spotify metadata', prompt });
          return;
        }
      }
    }
    seen.add(key);
    accepted.push(toQuestion(g, i));
  });
  return { accepted, rejected };
}
