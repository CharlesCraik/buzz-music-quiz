import { baseResults, noAudio, shuffle, type Ctx, type RoundHandler } from '../ctx';
import { cappedPenalty } from '../scoring';
import type { BombQState } from '../state';

const FEEDBACK_MS = 1500;

function nextSub(ctx: Ctx, q: BombQState) {
  q.poolIndex = (q.poolIndex + 1) % q.pool.length;
  q.subQuestion = q.pool[q.poolIndex];
  q.question = q.subQuestion;
  q.qid = ctx.newId();
  q.stage = 'answering';
  q.feedbackUntil = null;
}

function randomHolder(ctx: Ctx, exclude?: string): string | null {
  const candidates = ctx.connected().filter((p) => p.id !== exclude);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(ctx.rng() * candidates.length)].id;
}

export const passTheBomb: RoundHandler<BombQState> = {
  questionCount(plan, ctx) {
    return plan.questions.length > 0 ? Math.max(1, ctx.s.settings.bombsPerRound) : 0;
  },

  start(ctx, plan) {
    const pool = shuffle(plan.questions, ctx.rng);
    const { bombFuseMinMs: min, bombFuseMaxMs: max } = ctx.s.settings;
    const fuse = ctx.t(min + Math.floor(ctx.rng() * Math.max(1, max - min)));
    const holder = randomHolder(ctx) ?? ctx.s.players[0]?.id ?? '';
    // Offset the starting question so consecutive bombs use different questions.
    const poolIndex = (ctx.s.questionIndex * 7) % pool.length;
    return {
      kind: 'passTheBomb',
      qid: ctx.newId(),
      question: pool[poolIndex],
      startedAt: ctx.now,
      deadline: null,
      durationMs: 0,
      deltas: {},
      correct: {},
      done: false,
      holder,
      fuseAt: ctx.now + fuse,
      stage: 'answering',
      feedbackUntil: null,
      lastResult: null,
      subQuestion: pool[poolIndex],
      pool,
      poolIndex,
      passes: 0,
      exploded: null,
      ...noAudio(),
    };
  },

  action(ctx, q, env) {
    const a = env.action;
    const pid = env.playerId;
    if (q.done || pid !== q.holder || !('qid' in a) || a.qid !== q.qid) return;

    if (a.kind === 'answer' && q.stage === 'answering') {
      if (!q.subQuestion.options.some((o) => o.id === a.optionId)) return;
      const ok = a.optionId === q.subQuestion.correctOptionId;
      q.lastResult = { playerId: pid, correct: ok };
      if (ok) {
        ctx.award(pid, Math.round(ctx.s.settings.points / 2), 'defused a question');
        ctx.sfx('correct');
        q.stage = 'passing';
      } else {
        ctx.sfx('wrong');
        q.stage = 'feedback';
        q.feedbackUntil = ctx.now + FEEDBACK_MS;
      }
      return;
    }

    if (a.kind === 'target' && q.stage === 'passing') {
      const target = ctx.connected().find((p) => p.id === a.targetId && p.id !== pid);
      if (!target) return;
      q.holder = target.id;
      q.passes += 1;
      q.lastResult = null;
      ctx.sfx('pass');
      nextSub(ctx, q);
    }
  },

  tick(ctx, q) {
    if (q.done) return;
    if (ctx.now >= q.fuseAt) {
      q.done = true;
      q.exploded = q.holder;
      ctx.award(q.holder, cappedPenalty(ctx.s, q.holder, ctx.s.settings.bombPenalty), 'bomb exploded');
      ctx.sfx('boom');
      return;
    }
    const holder = ctx.s.players.find((p) => p.id === q.holder);
    if (!holder?.connected) {
      const next = randomHolder(ctx, q.holder);
      if (next) {
        q.holder = next;
        nextSub(ctx, q);
      }
    }
    if (q.stage === 'feedback' && q.feedbackUntil !== null && ctx.now >= q.feedbackUntil) {
      nextSub(ctx, q);
    }
  },

  reveal(ctx, q) {
    const loser = ctx.s.players.find((p) => p.id === q.exploded);
    return {
      headline: loser ? `BOOM! ${loser.name} was holding the bomb` : 'The bomb fizzled out',
      correctOptionId: null,
      correctText: null,
      explanation: `The bomb was passed ${q.passes} time${q.passes === 1 ? '' : 's'}.`,
      trackTitle: null,
      artist: null,
      results: baseResults(ctx, q),
    };
  },
};
