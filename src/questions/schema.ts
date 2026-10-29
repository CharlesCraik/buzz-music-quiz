import { z } from 'zod';

/** Shape of one generated question (mirrors RESPONSE_SCHEMA in openai.ts). */
export const GeneratedQuestionSchema = z.object({
  category: z.string().min(1).max(60),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  prompt: z.string().min(8).max(200),
  options: z.array(z.string().min(1).max(80)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().max(240),
  trackTitle: z.string().nullable(),
  artist: z.string().nullable(),
  releaseYear: z.number().int().min(1900).max(2100).nullable(),
  sourceNotes: z.string().max(240),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

export const GeneratedSongSchema = z.object({
  title: z.string().min(1).max(120),
  artist: z.string().min(1).max(120),
  releaseYear: z.number().int().min(1900).max(2100).nullable(),
});
export type GeneratedSong = z.infer<typeof GeneratedSongSchema>;

export const GenerateResponseSchema = z.object({
  questions: z.array(z.unknown()),
  songs: z.array(z.unknown()).optional().default([]),
});

export const GenerateRequestSchema = z.object({
  mode: z.enum(['playlist', 'category']),
  categories: z.array(z.string().max(40)).max(8),
  decades: z.array(z.string().max(10)).max(8),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']),
  count: z.number().int().min(4).max(40),
  songCount: z.number().int().min(0).max(30),
  familyFriendly: z.boolean(),
  tracks: z
    .array(
      z.object({
        title: z.string(),
        artists: z.array(z.string()),
        album: z.string().nullable().optional(),
        year: z.number().nullable().optional(),
      }),
    )
    .max(80)
    .optional(),
  avoidPrompts: z.array(z.string()).max(100).optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
