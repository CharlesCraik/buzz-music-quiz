import { baseResults, LATE_GRACE_MS, noAudio, requestClip, shuffle, type Ctx, type RoundHandler } from '../ctx';
import type { ChairsQState, MashQState, SurvivalQState } from '../state';
import type { Track } from '../types';

function clipStart(track: Track) {
  const len = track.durationMs ?? 180_000;
  return Math.max(0, Math.min(len - 45_000, Math.round(len * 0.3)));
}

// =====================================================================
// Musical Chairs: dance while the music plays; when it stops, tap SIT.
// There is one chair fewer than players. Tap before the music stops and
// you're out. Last one standing wins.
// =====================================================================

export const CHAIRS = {
  minDanceMs: 6000,
  maxDanceMs: 15_000,
  sitWindowMs: 5000,
  resultMs: 3500,
  maxLaps: 10,
  lapPoints: 50,
  winPoints: 300,
};

function chairsStartLap(ctx: Ctx, q: ChairsQState) {
  const track = q.pool[(q.lap - 1) % q.pool.length];
  q.stage = 'loading';
  q.seated = [];
  q.stopAt = null;
  q.sitDeadline = null;
  q.deadline = null;
  q.resultUntil = null;
  q.lastOut = [];
  requestClip(ctx, q, track.uri, clipStart(track), CHAIRS.maxDanceMs + 30_000, q.lap === 1 ? undefined : 800);
}

function chairsEliminate(q: ChairsQState, pid: string, reason: 'early' | 'slow') {
  q.alive = q.alive.filter((id) => id !== pid);
  q.out.push({ playerId: pid, lap: q.lap, reason });
  q.lastOut.push(pid);
}

function chairsFinish(ctx: Ctx, q: ChairsQState) {
  q.done = true;
  for (const pid of q.alive) {
    ctx.award(pid, q.alive.length === 1 ? CHAIRS.winPoints : Math.round(CHAIRS.winPoints / 2), 'musical chairs winner');
    q.correct[pid] = true;
  }
}

function chairsResolve(ctx: Ctx, q: ChairsQState) {
  const unseated = q.alive.filter((id) => !q.seated.includes(id));
  // If nobody sat at all (everyone missed it), nobody goes out: replay the lap.
  if (q.seated.length > 0) for (const pid of unseated) chairsEliminate(q, pid, 'slow');
  for (const pid of q.seated) if (q.alive.includes(pid)) ctx.award(pid, CHAIRS.lapPoints, 'found a chair');
  q.stage = 'result';
  q.sitDeadline = null;
  q.deadline = null;
  q.resultUntil = ctx.now + CHAIRS.resultMs;
  ctx.sfx(q.lastOut.length ? 'boom' : 'correct');
}

export const musicalChairs: RoundHandler<ChairsQState> = {
  questionCount(plan) {
    return plan.tracks.length > 0 ? 1 : 0;
  },

  start(ctx, plan) {
    const q: ChairsQState = {
      kind: 'musicalChairs',
      qid: ctx.newId(),
      question: null,
      startedAt: ctx.now,
      deadline: null,
      durationMs: CHAIRS.sitWindowMs,
      deltas: {},
      correct: {},
      done: false,
      stage: 'loading',
      pool: shuffle(plan.tracks, ctx.rng),
      lap: 1,
      alive: ctx.connected().map((p) => p.id),
      seated: [],
      out: [],
      lastOut: [],
      stopAt: null,
      sitDeadline: null,
      resultUntil: null,
      ...noAudio(),
    };
    chairsStartLap(ctx, q);
    return q;
  },

  onAudioStarted(ctx, q) {
    if (q.stage !== 'loading') return;
    q.stage = 'dancing';
    const { minDanceMs: a, maxDanceMs: b } = CHAIRS;
    q.stopAt = ctx.now + a + Math.floor(ctx.rng() * (b - a));
  },

  action(ctx, q, env) {
    const a = env.action;
    const pid = env.playerId;
    if (q.done || a.kind !== 'tap' || a.qid !== q.qid || !q.alive.includes(pid)) return;
    if (q.stage === 'dancing') {
      // Jumped the gun!
      chairsEliminate(q, pid, 'early');
      ctx.sfx('wrong');
      if (q.alive.length <= 1) {
        ctx.fx.push({ type: 'stopAudio' });
        chairsFinish(ctx, q);
      }
      return;
    }
    if (q.stage !== 'sit' || q.seated.includes(pid)) return;
    q.seated.push(pid);
    ctx.sfx('lockIn');
    const chairs = Math.max(1, q.alive.length - 1);
    if (q.seated.length >= chairs) chairsResolve(ctx, q);
  },

  tick(ctx, q) {
    if (q.done) return;
    // Disconnected players can't sit: they drop out at the next stop.
    if (q.stage === 'dancing' && q.stopAt !== null && ctx.now >= q.stopAt) {
      q.stage = 'sit';
      q.stopAt = null;
      q.sitDeadline = ctx.now + ctx.t(CHAIRS.sitWindowMs);
      q.deadline = q.sitDeadline;
      ctx.fx.push({ type: 'stopAudio' });
      q.audio = 'none';
      ctx.sfx('buzz');
      return;
    }
    if (q.stage === 'sit' && q.sitDeadline !== null && ctx.now >= q.sitDeadline) {
      chairsResolve(ctx, q);
      return;
    }
    if (q.stage === 'result' && q.resultUntil !== null && ctx.now >= q.resultUntil) {
      if (q.alive.length <= 1 || q.lap >= CHAIRS.maxLaps) {
        chairsFinish(ctx, q);
        return;
      }
      q.lap += 1;
      chairsStartLap(ctx, q);
    }
  },

  reveal(ctx, q) {
    const winners = ctx.s.players.filter((p) => q.alive.includes(p.id)).map((p) => p.name);
    return {
      headline: winners.length === 1 ? `${winners[0]} wins Musical Chairs!` : winners.length ? `${winners.join(' & ')} survive!` : 'Everyone is out!',
      correctOptionId: null,
      correctText: null,
      explanation: `${q.lap} song${q.lap === 1 ? '' : 's'} played.`,
      trackTitle: null,
      artist: null,
      results: baseResults(ctx, q),
    };
  },
};

// =====================================================================
// Beat Mash: tap as fast as you can while the music plays.
// =====================================================================

export const MASH = { mashMs: 10_000, graceMs: 800, maxCount: 250, points: [200, 150, 100, 50] };

export const beatMash: RoundHandler<MashQState> = {
  questionCount(plan) {
    return Math.min(3, plan.tracks.length);
  },

  start(ctx, plan, i) {
    const track = plan.tracks[i % plan.tracks.length];
    const q: MashQState = {
      kind: 'beatMash',
      qid: ctx.newId(),
      question: null,
      startedAt: ctx.now,
      deadline: null,
      durationMs: MASH.mashMs,
      deltas: {},
      correct: {},
      done: false,
      stage: 'loading',
      counts: {},
      ...noAudio(),
    };
    requestClip(ctx, q, track.uri, clipStart(track), MASH.mashMs + 30_000);
    return q;
  },

  onAudioStarted(ctx, q) {
    if (q.stage !== 'loading') return;
    q.stage = 'mashing';
    q.startedAt = ctx.now;
    q.deadline = ctx.now + MASH.mashMs;
  },

  action(ctx, q, env) {
    const a = env.action;
    if (q.done || a.kind !== 'tap' || a.qid !== q.qid || q.stage !== 'mashing') return;
    if (!ctx.s.players.some((p) => p.id === env.playerId)) return;
    const prev = q.counts[env.playerId] ?? 0;
    const next = a.count === undefined ? prev + 1 : Math.min(MASH.maxCount, Math.max(prev, Math.floor(a.count)));
    q.counts[env.playerId] = next;
  },

  tick(ctx, q) {
    if (q.done || q.stage !== 'mashing' || q.deadline === null) return;
    // A short grace period lets the final tap totals arrive.
    if (ctx.now < q.deadline + MASH.graceMs) return;
    q.stage = 'done';
    q.done = true;
    const ranked = Object.entries(q.counts)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1]);
    let rank = 0;
    let prev = -1;
    ranked.forEach(([pid, c], i) => {
      if (c !== prev) rank = i;
      prev = c;
      const pts = MASH.points[rank] ?? 25;
      ctx.award(pid, pts, 'beat mash');
      q.correct[pid] = rank === 0;
    });
  },

  reveal(ctx, q) {
    const top = Object.entries(q.counts).sort((a, b) => b[1] - a[1])[0];
    const name = ctx.s.players.find((p) => p.id === top?.[0])?.name;
    return {
      headline: top && top[1] > 0 ? `${name} mashed ${top[1]} times!` : 'Nobody mashed!',
      correctOptionId: null,
      correctText: null,
      explanation: null,
      trackTitle: null,
      artist: null,
      results: baseResults(ctx, q),
    };
  },
};

// =====================================================================
// Last One Standing: everyone has 2 lives. Wrong (or no) answer = lose a
// life. Last player with lives left wins.
// =====================================================================

export const SURVIVAL = { lives: 2, answerMs: 15_000, resultMs: 4000, maxQuestions: 15, correct: 50, win: 300, share: 150 };

function survivalAlive(q: SurvivalQState) {
  return Object.entries(q.lives)
    .filter(([, l]) => l > 0)
    .map(([id]) => id);
}

function survivalNext(ctx: Ctx, q: SurvivalQState) {
  q.poolIndex = (q.poolIndex + 1) % q.pool.length;
  q.question = q.pool[q.poolIndex];
  q.qid = ctx.newId();
  q.subNumber += 1;
  q.stage = 'answering';
  q.answers = {};
  q.lastResult = null;
  q.lastNote = null;
  q.resultUntil = null;
  q.startedAt = ctx.now;
  q.deadline = ctx.now + ctx.t(SURVIVAL.answerMs);
}

function survivalResolve(ctx: Ctx, q: SurvivalQState) {
  const alive = survivalAlive(q).filter((id) => ctx.s.players.find((p) => p.id === id)?.connected || q.answers[id]);
  const correctId = q.question?.correctOptionId;
  const result: Record<string, boolean> = {};
  for (const pid of alive) result[pid] = q.answers[pid]?.optionId === correctId;
  const anyRight = Object.values(result).some(Boolean);
  q.amnesty = !anyRight;
  if (!anyRight) {
    q.lastNote = 'Nobody got it, so nobody loses a life!';
  } else {
    for (const [pid, ok] of Object.entries(result)) {
      if (ok) ctx.award(pid, SURVIVAL.correct, 'survived');
      else q.lives[pid] = Math.max(0, (q.lives[pid] ?? 0) - 1);
    }
    const knockedOut = Object.keys(result).filter((pid) => q.lives[pid] === 0);
    q.lastNote = knockedOut.length
      ? `Out: ${knockedOut.map((id) => ctx.s.players.find((p) => p.id === id)?.name).join(', ')}`
      : null;
    ctx.sfx(knockedOut.length ? 'boom' : 'correct');
  }
  q.lastResult = result;
  q.stage = 'result';
  q.deadline = null;
  q.resultUntil = ctx.now + SURVIVAL.resultMs;
}

export const lastStanding: RoundHandler<SurvivalQState> = {
  questionCount(plan) {
    return plan.questions.length > 0 ? 1 : 0;
  },

  start(ctx, plan) {
    const pool = shuffle(plan.questions, ctx.rng);
    const lives: Record<string, number> = {};
    for (const p of ctx.connected()) lives[p.id] = SURVIVAL.lives;
    const durationMs = ctx.t(SURVIVAL.answerMs);
    return {
      kind: 'lastStanding',
      qid: ctx.newId(),
      question: pool[0],
      startedAt: ctx.now,
      deadline: ctx.now + durationMs,
      durationMs,
      deltas: {},
      correct: {},
      done: false,
      stage: 'answering',
      pool,
      poolIndex: 0,
      subNumber: 1,
      lives,
      answers: {},
      lastResult: null,
      lastNote: null,
      amnesty: false,
      resultUntil: null,
      winner: null,
      ...noAudio(),
    };
  },

  action(ctx, q, env) {
    const a = env.action;
    const pid = env.playerId;
    if (q.done || q.stage !== 'answering' || a.kind !== 'answer' || a.qid !== q.qid) return;
    if ((q.lives[pid] ?? 0) <= 0 || q.answers[pid]) return;
    if (!q.question?.options.some((o) => o.id === a.optionId)) return;
    q.answers[pid] = { optionId: a.optionId, seq: env.seq };
    ctx.sfx('lockIn');
    const waiting = survivalAlive(q).filter(
      (id) => ctx.s.players.find((p) => p.id === id)?.connected && !q.answers[id],
    );
    if (waiting.length === 0) survivalResolve(ctx, q);
  },

  tick(ctx, q) {
    if (q.done) return;
    if (q.stage === 'answering' && q.deadline !== null && ctx.now >= q.deadline + LATE_GRACE_MS) {
      survivalResolve(ctx, q);
      return;
    }
    if (q.stage === 'result' && q.resultUntil !== null && ctx.now >= q.resultUntil) {
      const alive = survivalAlive(q);
      const total = Object.keys(q.lives).length;
      const over = (total > 1 && alive.length <= 1) || alive.length === 0 || q.subNumber >= SURVIVAL.maxQuestions;
      if (over) {
        q.done = true;
        if (alive.length === 1) {
          q.winner = alive[0];
          ctx.award(alive[0], SURVIVAL.win, 'last one standing');
          q.correct[alive[0]] = true;
        } else {
          for (const pid of alive) {
            ctx.award(pid, SURVIVAL.share, 'survivor');
            q.correct[pid] = true;
          }
        }
        return;
      }
      survivalNext(ctx, q);
    }
  },

  onLateJoin(_ctx, q, playerId) {
    // Late joiners start with one life so they can still take part.
    if (!(playerId in q.lives)) q.lives[playerId] = 1;
  },

  reveal(ctx, q) {
    const winner = ctx.s.players.find((p) => p.id === q.winner);
    const survivors = ctx.s.players.filter((p) => (q.lives[p.id] ?? 0) > 0).map((p) => p.name);
    return {
      headline: winner
        ? `${winner.name} is the last one standing!`
        : survivors.length
          ? `Survivors: ${survivors.join(', ')}`
          : 'Nobody survived!',
      correctOptionId: null,
      correctText: null,
      explanation: `${q.subNumber} question${q.subNumber === 1 ? '' : 's'} played.`,
      trackTitle: null,
      artist: null,
      results: baseResults(ctx, q),
    };
  },
};
