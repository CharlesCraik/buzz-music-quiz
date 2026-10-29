import { describe, expect, it } from 'vitest';
import { buildPack, feasibleRounds, tuneQuestion } from './buildPack';
import { MOCK_TRACKS, SAMPLE_QUESTIONS } from './samplePack';
import { validateGenerated } from './validate';

const good = {
  category: 'Pop',
  difficulty: 'easy',
  prompt: 'Who sang "Example Song"?',
  options: ['Artist A', 'Artist B', 'Artist C', 'Artist D'],
  correctIndex: 2,
  explanation: 'Artist C released it.',
  trackTitle: 'Example Song',
  artist: 'Artist C',
  releaseYear: 1999,
  sourceNotes: 'test',
};

describe('validateGenerated', () => {
  it('accepts a valid question and maps the correct option', () => {
    const { accepted, rejected } = validateGenerated([good]);
    expect(rejected).toHaveLength(0);
    expect(accepted[0].correctOptionId).toBe('c');
    expect(accepted[0].options.find((o) => o.id === 'c')!.text).toBe('Artist C');
    expect(accepted[0].verificationStatus).toBe('unverified');
  });

  it('rejects malformed, duplicate-option, out-of-range and repeated questions', () => {
    const { accepted, rejected } = validateGenerated([
      { ...good, options: ['A', 'B', 'C'] },
      { ...good, prompt: 'Duplicate options here?', options: ['The Beatles', 'Beatles', 'X', 'Y'] },
      { ...good, prompt: 'Out of range index?', correctIndex: 4 },
      good,
      { ...good },
      { nonsense: true },
    ]);
    expect(accepted).toHaveLength(1);
    expect(rejected.map((r) => r.reason)).toEqual([
      'Schema invalid',
      'Duplicate or blank options',
      'Schema invalid',
      'Duplicate question',
      'Schema invalid',
    ]);
  });

  it('rejects recently used prompts', () => {
    const { accepted } = validateGenerated([good], { recentPrompts: [good.prompt] });
    expect(accepted).toHaveLength(0);
  });

  it('rejects year questions that contradict track metadata', () => {
    const q = { ...good, prompt: 'Which year was "Example Song" released?', options: ['1990', '1995', '1999', '2005'] };
    const tracks = [{ id: 't', uri: 'spotify:track:t', title: 'Example Song', artists: ['Artist C'], year: 2010 }];
    expect(validateGenerated([q], { tracks }).accepted).toHaveLength(0);
  });
});

describe('buildPack', () => {
  it('builds every round type from the sample material', () => {
    const pack = buildPack({
      title: 't',
      source: 'sample',
      questions: SAMPLE_QUESTIONS,
      tracks: MOCK_TRACKS,
      roundTypes: ['multipleChoice', 'nameThatTune', 'musicBingo', 'passTheBomb'],
      questionsPerRound: 4,
    });
    expect(pack.rounds[0].questions).toHaveLength(4);
    expect(pack.rounds[1].questions).toHaveLength(4);
    expect(pack.rounds[1].questions.every((q) => q.clip?.uri.startsWith('mock:'))).toBe(true);
    expect(pack.rounds[2].tracks.length).toBeGreaterThanOrEqual(12);
    expect(pack.rounds[3].questions.length).toBeGreaterThanOrEqual(12);
  });

  it('tune questions have four distinct options including the right one', () => {
    const q = tuneQuestion(MOCK_TRACKS[0], MOCK_TRACKS, Math.random, false)!;
    expect(new Set(q.options.map((o) => o.text)).size).toBe(4);
    expect(q.options.find((o) => o.id === q.correctOptionId)!.text).toBe(MOCK_TRACKS[0].title);
  });

  it('reports which rounds are feasible', () => {
    expect(feasibleRounds([], MOCK_TRACKS.slice(0, 5))).toMatchObject({
      multipleChoice: false,
      nameThatTune: true,
      musicBingo: false,
    });
  });
});

describe('cleanKey', () => {
  it('strips pasted prefixes, quotes and whitespace', async () => {
    const { cleanKey } = await import('./openai');
    expect(cleanKey(' VITE_OPENAI_API_KEY="sk-proj-abc"\n')).toBe('sk-proj-abc');
    expect(cleanKey('Bearer sk-abc')).toBe('sk-abc');
    expect(cleanKey("'sk-a b\tc'")).toBe('sk-abc');
  });
});

describe('music round questions', () => {
  it('decade questions have the right decade and a clip', async () => {
    const { decadeQuestion } = await import('./buildPack');
    const q = decadeQuestion({ id: 'x', uri: 'spotify:track:x', title: 'T', artists: ['A'], year: 1987 }, Math.random)!;
    expect(q.options.find((o) => o.id === q.correctOptionId)!.text).toBe('80s');
    expect(new Set(q.options.map((o) => o.text)).size).toBe(4);
    expect(q.clip?.uri).toBe('spotify:track:x');
  });

  it('intro sprint clips start at 0', () => {
    const pack = buildPack({
      title: 't',
      source: 'sample',
      questions: SAMPLE_QUESTIONS,
      tracks: MOCK_TRACKS,
      roundTypes: ['introSprint', 'whoSings', 'decadeDash'],
      questionsPerRound: 3,
    });
    expect(pack.rounds[0].questions.every((q) => q.clip?.startMs === 0)).toBe(true);
    expect(pack.rounds[1].questions.every((q) => q.prompt.includes('performing'))).toBe(true);
    expect(pack.rounds[2].questions.length).toBeGreaterThan(0);
  });
});
