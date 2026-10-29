import {
  applyStreaks,
  baseResults,
  LATE_GRACE_MS,
  noAudio,
  optionText,
  requestClip,
  type Ctx,
  type RoundHandler,
} from '../ctx';
import { cappedPenalty } from '../scoring';
import type { AnswerQState } from '../state';

/** Ranked points for speed rounds (Fastest Finger, Intro Sprint). */
export const FASTEST_POINTS = [300, 200, 150, 100];

/** Everyone answers once. Music rounds hold the timer until the clip is audible. */
function makeHandler(kind: AnswerQState['kind'], ranked: boolean): RoundHandler<AnswerQState> {
  function finish(ctx: Ctx, q: AnswerQState) {
    q.done = true;
    const correctId = q.question?.correctOptionId;
    const { points, speedBonus } = ctx.s.settings;
    const correctEntries = Object.entries(q.answers)
      .filter(([, ans]) => ans.optionId === correctId)
      .sort((a, b) => a[1].seq - b[1].seq);

    for (const [pid, ans] of Object.entries(q.answers)) {
      q.correct[pid] = ans.optionId === correctId;
    }
    for (const p of ctx.s.players) {
      if (!(p.id in q.correct) && p.connected) q.correct[p.id] = false;
    }

    correctEntries.forEach(([pid, ans], rank) => {
      if (ranked) {
        ctx.award(pid, FASTEST_POINTS[Math.min(rank, FASTEST_POINTS.length - 1)], 'fastest');
      } else {
        let pts = points;
        if (speedBonus) {
          const left = Math.max(0, q.startedAt + q.durationMs - ans.at);
          pts += Math.round((points / 2) * (left / q.durationMs));
        }
        ctx.award(pid, pts, 'correct');
      }
    });
    // Optional: lose points for a wrong or missed answer (never below zero).
    const miss = ctx.s.settings.missPenalty;
    if (miss > 0) {
      for (const [pid, ok] of Object.entries(q.correct)) {
        if (!ok) ctx.award(pid, cappedPenalty(ctx.s, pid, miss), q.answers[pid] ? 'wrong answer' : 'no answer');
      }
    }
    applyStreaks(ctx, q);
  }

  return {
    questionCount(plan, ctx) {
      return Math.min(plan.questions.length, ctx.s.settings.questionsPerRound);
    },

    start(ctx, plan, i) {
      const question = plan.questions[i];
      const durationMs = ctx.t(ctx.s.settings.answerTimeMs);
      const q: AnswerQState = {
        kind,
        qid: ctx.newId(),
        question,
        startedAt: ctx.now,
        deadline: ctx.now + durationMs,
        durationMs,
        deltas: {},
        correct: {},
        done: false,
        answers: {},
        ...noAudio(),
      };
      if (question.clip) {
        // Timer starts in onAudioStarted, never before the music is heard.
        q.deadline = null;
        requestClip(ctx, q, question.clip.uri, question.clip.startMs, durationMs + 30_000);
      }
      return q;
    },

    onAudioStarted(ctx, q) {
      q.startedAt = ctx.now;
      q.deadline = ctx.now + q.durationMs;
    },

    action(ctx, q, env) {
      const a = env.action;
      if (a.kind !== 'answer' || a.qid !== q.qid || q.done) return;
      if (q.audio === 'loading' || q.audio === 'failed') return; // wait for the music
      if (q.answers[env.playerId]) return; // one answer each
      if (!q.question?.options.some((o) => o.id === a.optionId)) return;
      q.answers[env.playerId] = { optionId: a.optionId, seq: env.seq, at: ctx.now };
      ctx.sfx('lockIn');
      const everyone = ctx.connected().every((p) => q.answers[p.id]);
      if (everyone) finish(ctx, q);
    },

    tick(ctx, q) {
      if (q.done) return;
      const answered = Object.keys(q.answers).length > 0;
      const everyone = answered && ctx.connected().every((p) => q.answers[p.id]);
      if (everyone || (q.deadline !== null && ctx.now >= q.deadline + LATE_GRACE_MS)) finish(ctx, q);
    },

    reveal(ctx, q) {
      const winners = ctx.s.players.filter((p) => q.correct[p.id]).map((p) => p.name);
      const right = winners.length;
      return {
        headline:
          right === 0
            ? 'Nobody got it!'
            : right === ctx.s.players.length && right > 1
              ? 'Everyone got it!'
              : right <= 3
                ? `${winners.join(' & ')} got it!`
                : `${right} players got it right`,
        correctOptionId: q.question?.correctOptionId ?? null,
        correctText: optionText(q),
        explanation: q.question?.explanation ?? null,
        trackTitle: q.question?.trackTitle ?? null,
        artist: q.question?.artist ?? null,
        results: baseResults(ctx, q),
      };
    },
  };
}

export const multipleChoice = makeHandler('multipleChoice', false);
export const fastestFinger = makeHandler('fastestFinger', true);
export const introSprint = makeHandler('introSprint', true);
export const whoSings = makeHandler('whoSings', false);
export const decadeDash = makeHandler('decadeDash', false);
