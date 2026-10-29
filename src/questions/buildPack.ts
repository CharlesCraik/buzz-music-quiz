import { shuffle, type Rng } from '../game/ctx';
import { normaliseAnswer } from '../game/normalise';
import { ROUND_INFO } from '../game/rounds';
import { CARD_SIZE } from '../game/rounds/musicBingo';
import type { GamePack, Question, RoundPlan, RoundType, Track } from '../game/types';

export interface PackInput {
  title: string;
  source: GamePack['source'];
  questions: Question[];
  tracks: Track[];
  roundTypes: RoundType[];
  questionsPerRound: number;
  bingoPoolSize?: number;
}

function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = key(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Build a Name That Tune question from a track, with distractors from the pool. */
export function tuneQuestion(track: Track, pool: Track[], rng: Rng, askArtist: boolean): Question | null {
  const artist = track.artists.join(', ');
  const field = (t: Track) => (askArtist ? t.artists.join(', ') : t.title);
  const correct = field(track);
  const distractors = uniqueBy(
    shuffle(
      pool.filter((t) => t.id !== track.id),
      rng,
    ),
    (t) => normaliseAnswer(field(t)),
  )
    .filter((t) => normaliseAnswer(field(t)) !== normaliseAnswer(correct))
    .slice(0, 3)
    .map(field);
  if (distractors.length < 3) return null;
  const options = shuffle(
    [correct, ...distractors].map((text, i) => ({ id: 'abcd'[i], text })),
    rng,
  );
  const len = track.durationMs ?? 180_000;
  return {
    id: `tune-${track.id}`,
    category: 'Name That Tune',
    difficulty: 'medium',
    questionType: 'nameThatTune',
    prompt: askArtist ? 'Who is performing this song?' : 'Name that tune!',
    options,
    correctOptionId: 'a',
    acceptedAnswers: [normaliseAnswer(correct)],
    explanation: `"${track.title}" by ${artist}${track.year ? ` (${track.year})` : ''}`,
    trackTitle: track.title,
    artist,
    releaseYear: track.year ?? null,
    spotifyUri: track.uri,
    sourceNotes: 'Built from track metadata',
    verificationStatus: 'verified',
    clip: { uri: track.uri, startMs: Math.round(Math.min(len * 0.3, Math.max(0, len - 40_000))) },
  };
}

export function buildPack(input: PackInput, rng: Rng = Math.random): GamePack {
  const textPool = shuffle(input.questions, rng).map((qq) => ({
    ...qq,
    options: shuffle(qq.options, rng),
  }));
  let textCursor = 0;
  const trackPool = uniqueBy(shuffle(input.tracks, rng), (t) => normaliseAnswer(t.title));
  let trackCursor = 0;

  const rounds: RoundPlan[] = input.roundTypes.map((type) => {
    const info = ROUND_INFO[type];
    if (type === 'musicBingo') {
      const size = Math.min(trackPool.length, Math.max(CARD_SIZE + 3, input.bingoPoolSize ?? 14));
      return { type, questions: [], tracks: shuffle(trackPool, rng).slice(0, size) };
    }
    if (info.needs === 'tracks') {
      const questions: Question[] = [];
      let attempts = 0;
      while (questions.length < input.questionsPerRound && attempts < trackPool.length) {
        const track = trackPool[trackCursor % trackPool.length];
        trackCursor++;
        attempts++;
        const tq = tuneQuestion(track, trackPool, rng, questions.length % 3 === 2);
        if (tq) questions.push(tq);
      }
      return { type, questions, tracks: [] };
    }
    // Pass the Bomb burns through questions fast: give it a bigger pool.
    const want = type === 'passTheBomb' ? Math.max(12, input.questionsPerRound * 3) : input.questionsPerRound;
    const questions: Question[] = [];
    for (let i = 0; i < want && textPool.length > 0; i++) {
      questions.push(textPool[textCursor % textPool.length]);
      textCursor++;
    }
    return { type, questions: uniqueBy(questions, (x) => x.id), tracks: [] };
  });

  return {
    id: `pack-${Date.now().toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`,
    title: input.title,
    source: input.source,
    rounds,
  };
}

/** Which round types can actually run with the given material. */
export function feasibleRounds(questions: Question[], tracks: Track[]): Record<RoundType, boolean> {
  return {
    multipleChoice: questions.length > 0,
    fastestFinger: questions.length > 0,
    stealPoints: questions.length > 0,
    passTheBomb: questions.length > 0,
    nameThatTune: tracks.length >= 4,
    musicBingo: tracks.length >= CARD_SIZE,
  };
}
