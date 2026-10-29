import { applyStreaks, baseResults, optionText, type RoundHandler } from '../ctx';
import type { AnswerQState } from '../state';

/** Fastest Finger: correct answers ranked by server order. */
export const FASTEST_POINTS = [300, 200, 150, 100];

function makeHandler(kind: AnswerQState['kind']): RoundHandler<AnswerQState> {
  return {
    questionCount(plan, ctx) {
      return Math.min(plan.questions.length, ctx.s.settings.questionsPerRound);
    },

    start(ctx, plan, i) {
      const durationMs = ctx.t(ctx.s.settings.answerTimeMs);
      return {
        kind,
        qid: ctx.newId(),
        question: plan.questions[i],
        startedAt: ctx.now,
        deadline: ctx.now + durationMs,
        durationMs,
        deltas: {},
        correct: {},
        done: false,
        answers: {},
      };
    },

    action(ctx, q, env) {
      const a = env.action;
      if (a.kind !== 'answer' || a.qid !== q.qid || q.done) return;
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
      if (everyone || (q.deadline !== null && ctx.now >= q.deadline)) finish(ctx, q);
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

  function finish(ctx: Parameters<RoundHandler<AnswerQState>['tick']>[0], q: AnswerQState) {
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
      if (kind === 'fastestFinger') {
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
    applyStreaks(ctx, q);
  }
}

export const multipleChoice = makeHandler('multipleChoice');
export const fastestFinger = makeHandler('fastestFinger');
