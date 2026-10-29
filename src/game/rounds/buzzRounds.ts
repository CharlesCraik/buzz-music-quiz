import { applyStreaks, baseResults, LATE_GRACE_MS, noAudio, optionText, requestClip, type Ctx, type RoundHandler } from '../ctx';
import { cappedPenalty, scoreOf } from '../scoring';
import type { BuzzQState } from '../state';

/** Name That Tune points by how early the correct buzz came. */
export const TUNE_POINTS = [300, 200, 100];

function makeHandler(kind: BuzzQState['kind']): RoundHandler<BuzzQState> {
  const isTune = kind === 'nameThatTune';

  function stealTargets(ctx: Ctx, q: BuzzQState) {
    return ctx.s.players.filter((p) => p.id !== q.activeId && scoreOf(ctx.s, p.id) > 0);
  }

  function finish(ctx: Ctx, q: BuzzQState) {
    q.done = true;
    q.activeId = q.stage === 'choosing' ? q.activeId : null;
    applyStreaks(ctx, q);
  }

  function reopen(ctx: Ctx, q: BuzzQState) {
    q.stage = 'open';
    q.activeId = null;
    q.activeDeadline = null;
    q.deadline = ctx.now + (q.remainingMs ?? 0);
    q.remainingMs = null;
    const everyoneOut = ctx.connected().every((p) => q.lockedOut.includes(p.id));
    if (everyoneOut) {
      finish(ctx, q);
      return;
    }
    if (isTune && q.question?.clip) {
      q.audioPlaying = true;
      ctx.fx.push({ type: 'resumeAudio' });
    }
  }

  function wrong(ctx: Ctx, q: BuzzQState, pid: string) {
    q.correct[pid] = false;
    q.lockedOut.push(pid);
    ctx.award(pid, cappedPenalty(ctx.s, pid, ctx.s.settings.wrongPenalty), 'wrong buzz');
    ctx.sfx('wrong');
    reopen(ctx, q);
  }

  function steal(ctx: Ctx, q: BuzzQState, targetId: string) {
    if (!q.activeId) return;
    const amount = Math.min(ctx.s.settings.stealAmount, scoreOf(ctx.s, targetId));
    if (amount > 0) {
      ctx.award(targetId, -amount, 'stolen');
      ctx.award(q.activeId, amount, 'steal');
      q.stolen = { from: targetId, amount };
      ctx.sfx('steal');
    }
    finish(ctx, q);
  }

  return {
    questionCount(plan, ctx) {
      return Math.min(plan.questions.length, ctx.s.settings.questionsPerRound);
    },

    start(ctx, plan, i) {
      const question = plan.questions[i];
      const durationMs = isTune ? ctx.t(ctx.s.settings.clipMs) : ctx.t(ctx.s.settings.answerTimeMs);
      const hasClip = isTune && !!question.clip;
      const q: BuzzQState = {
        kind,
        qid: ctx.newId(),
        question,
        startedAt: ctx.now,
        deadline: ctx.now + durationMs,
        durationMs,
        deltas: {},
        correct: {},
        done: false,
        stage: 'open',
        activeId: null,
        activeDeadline: null,
        remainingMs: null,
        lockedOut: [],
        buzzOrder: [],
        winnerId: null,
        stolen: null,
        audioPlaying: false,
        ...noAudio(),
      };
      if (hasClip && question.clip) {
        // No buzzing and no timer until the music is actually audible.
        q.stage = 'loading';
        q.deadline = null;
        requestClip(ctx, q, question.clip.uri, question.clip.startMs, durationMs + 60_000);
      }
      return q;
    },

    onAudioStarted(ctx, q) {
      if (q.stage !== 'loading') return;
      q.stage = 'open';
      q.startedAt = ctx.now;
      q.deadline = ctx.now + q.durationMs;
      q.audioPlaying = q.audio === 'playing';
    },

    action(ctx, q, env) {
      const a = env.action;
      const pid = env.playerId;
      if (q.done || !('qid' in a) || a.qid !== q.qid) return;

      if (a.kind === 'buzz') {
        if (q.stage !== 'open' || q.lockedOut.includes(pid)) return;
        if (q.deadline !== null && ctx.now >= q.deadline + LATE_GRACE_MS) return;
        q.buzzOrder.push(pid);
        q.stage = 'answering';
        q.activeId = pid;
        q.activeDeadline = ctx.now + ctx.t(ctx.s.settings.buzzAnswerTimeMs);
        q.remainingMs = Math.max(0, (q.deadline ?? ctx.now) - ctx.now);
        q.deadline = null;
        ctx.sfx('buzz');
        if (q.audioPlaying) {
          q.audioPlaying = false;
          ctx.fx.push({ type: 'pauseAudio' });
        }
        return;
      }

      if (a.kind === 'answer') {
        if (q.stage !== 'answering' || q.activeId !== pid) return;
        if (!q.question?.options.some((o) => o.id === a.optionId)) return;
        if (a.optionId !== q.question.correctOptionId) {
          wrong(ctx, q, pid);
          return;
        }
        q.correct[pid] = true;
        q.winnerId = pid;
        ctx.sfx('correct');
        if (isTune) {
          const elapsed = q.durationMs - (q.remainingMs ?? 0);
          const third = Math.min(2, Math.floor((elapsed / q.durationMs) * 3));
          ctx.award(pid, TUNE_POINTS[third], 'name that tune');
          finish(ctx, q);
          return;
        }
        ctx.award(pid, ctx.s.settings.points, 'correct');
        if (stealTargets(ctx, q).length === 0) {
          finish(ctx, q);
          return;
        }
        q.stage = 'choosing';
        q.activeDeadline = ctx.now + ctx.t(ctx.s.settings.buzzAnswerTimeMs) + 4000;
        return;
      }

      if (a.kind === 'target') {
        if (q.stage !== 'choosing' || q.activeId !== pid) return;
        if (!stealTargets(ctx, q).some((p) => p.id === a.targetId)) return;
        steal(ctx, q, a.targetId);
      }
    },

    tick(ctx, q) {
      if (q.done) return;
      if (q.stage === 'answering' && q.activeDeadline !== null && ctx.now >= q.activeDeadline + LATE_GRACE_MS) {
        if (q.activeId) wrong(ctx, q, q.activeId);
        return;
      }
      if (q.stage === 'choosing' && q.activeDeadline !== null && ctx.now >= q.activeDeadline) {
        // Auto-pick the leader so the round never stalls.
        const target = stealTargets(ctx, q).sort(
          (a, b) => scoreOf(ctx.s, b.id) - scoreOf(ctx.s, a.id),
        )[0];
        if (target) steal(ctx, q, target.id);
        else finish(ctx, q);
        return;
      }
      if (q.stage === 'open' && q.deadline !== null && ctx.now >= q.deadline + LATE_GRACE_MS) finish(ctx, q);
    },

    reveal(ctx, q) {
      const winner = ctx.s.players.find((p) => p.id === q.winnerId);
      const victim = q.stolen ? ctx.s.players.find((p) => p.id === q.stolen?.from) : null;
      let headline = winner ? `${winner.name} got it!` : 'Nobody got it!';
      if (winner && victim && q.stolen) {
        headline = `${winner.name} stole ${q.stolen.amount} from ${victim.name}!`;
      }
      return {
        headline,
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

export const nameThatTune = makeHandler('nameThatTune');
export const stealPoints = makeHandler('stealPoints');
