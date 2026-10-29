import { describe, expect, it } from 'vitest';
import { buildPack } from '../questions/buildPack';
import { MOCK_TRACKS, SAMPLE_QUESTIONS } from '../questions/samplePack';
import { canTransition, createGame, reduce } from './engine';
import { sanitiseName, uniqueName } from './names';
import { matchesAccepted, normaliseAnswer } from './normalise';
import { BINGO_POINTS, completedLines } from './rounds/musicBingo';
import { FASTEST_POINTS } from './rounds/answerRounds';
import { scoreOf, standings } from './scoring';
import type { BingoQState, BombQState, BuzzQState, GameState } from './state';
import type { EngineEvent, PlayerAction, RoundType, Settings } from './types';
import { toPublic } from './view';

function seeded(seed = 42) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

class Harness {
  s: GameState;
  now = 1_000_000;
  seq = 0;
  rng = seeded();
  effects: string[] = [];
  /** Simulate the host confirming every clip as audible straight away. */
  autoAudio = true;
  plays: string[] = [];

  constructor(rounds: RoundType[], settings: Partial<Settings> = {}, players = ['p1', 'p2', 'p3']) {
    this.s = createGame('ABCD', { autoAdvance: false, ...settings });
    const pack = buildPack(
      {
        title: 'Test',
        source: 'sample',
        questions: SAMPLE_QUESTIONS,
        tracks: MOCK_TRACKS,
        roundTypes: rounds,
        questionsPerRound: 3,
      },
      this.rng,
    );
    this.ev({ type: 'loadPack', pack });
    players.forEach((p, i) =>
      this.act(p, { kind: 'join', name: `Player ${i + 1}`, colour: 'tomato', avatar: 'vinyl' }),
    );
  }

  ev(e: EngineEvent) {
    const r = reduce(this.s, e, this.now, this.rng);
    this.s = r.state;
    this.effects.push(...r.effects.map((f) => (f.type === 'sfx' ? `sfx:${f.name}` : f.type)));
    for (const f of r.effects) {
      if (f.type !== 'play') continue;
      this.plays.push(f.key);
      if (this.autoAudio) this.ev({ type: 'audio', key: f.key, status: 'started' });
    }
    return r;
  }
  act(playerId: string, action: PlayerAction, id?: string) {
    this.seq += 1;
    return this.ev({ type: 'action', env: { id: id ?? `a${this.seq}`, playerId, seq: this.seq, action } });
  }
  host(cmd: Extract<EngineEvent, { type: 'host' }>['cmd']) {
    return this.ev({ type: 'host', cmd });
  }
  advance(ms: number) {
    this.now += ms;
    return this.ev({ type: 'tick' });
  }
  startToQuestion() {
    this.host('start');
    expect(this.s.phase).toBe('ROUND_INTRO');
    this.host('next');
    expect(this.s.phase).toBe('QUESTION');
  }
  get qid() {
    return this.s.q!.qid;
  }
  get correct() {
    return this.s.q!.question!.correctOptionId;
  }
  get wrongOpt() {
    return this.s.q!.question!.options.find((o) => o.id !== this.correct)!.id;
  }
  score(p: string) {
    return scoreOf(this.s, p);
  }
}

describe('lobby and joining', () => {
  it('sanitises and de-duplicates names', () => {
    expect(sanitiseName('  <b>Sam</b>  ')).toBe('bSam/b');
    expect(sanitiseName('Abcdefghijklmnopqrstuvwxyz').length).toBe(16);
    expect(sanitiseName('   ')).toBe('Player');
    expect(uniqueName('Sam', ['sam'])).toBe('Sam 2');
    expect(uniqueName('Sam', ['Sam', 'Sam 2'])).toBe('Sam 3');
  });

  it('gives duplicate colours a free colour and caps at 8 players', () => {
    const h = new Harness(['multipleChoice'], {}, []);
    for (let i = 0; i < 10; i++) {
      h.act(`p${i}`, { kind: 'join', name: 'Sam', colour: 'tomato', avatar: 'vinyl' });
    }
    expect(h.s.players).toHaveLength(8);
    expect(new Set(h.s.players.map((p) => p.colour)).size).toBe(8);
    expect(new Set(h.s.players.map((p) => p.name)).size).toBe(8);
  });

  it('rejoin with same id keeps player and score', () => {
    const h = new Harness(['multipleChoice']);
    h.act('p1', { kind: 'join', name: 'Other', colour: 'sky', avatar: 'drum' });
    expect(h.s.players).toHaveLength(3);
    expect(h.s.players[0].name).toBe('Player 1');
  });

  it('ignores actions from non-members', () => {
    const h = new Harness(['multipleChoice']);
    h.startToQuestion();
    h.act('intruder', { kind: 'answer', qid: h.qid, optionId: h.correct });
    expect(Object.keys((h.s.q as { answers: object }).answers)).toHaveLength(0);
  });
});

describe('phase transitions', () => {
  it('enforces the transition table', () => {
    expect(canTransition('LOBBY', 'ROUND_INTRO')).toBe(true);
    expect(canTransition('LOBBY', 'REVEAL')).toBe(false);
    expect(canTransition('REVEAL', 'QUESTION')).toBe(true);
    expect(canTransition('GAME_RESULTS', 'QUESTION')).toBe(false);
  });

  it('runs a full game through results and back to lobby', () => {
    const h = new Harness(['multipleChoice', 'fastestFinger']);
    h.host('start');
    let guard = 0;
    while (h.s.phase !== 'GAME_RESULTS' && guard++ < 100) {
      if (h.s.phase === 'QUESTION') {
        for (const p of ['p1', 'p2', 'p3']) h.act(p, { kind: 'answer', qid: h.qid, optionId: h.correct });
      } else {
        h.host('next');
      }
    }
    expect(h.s.phase).toBe('GAME_RESULTS');
    expect(h.s.roundSummaries).toHaveLength(2);
    h.host('toLobby');
    expect(h.s.phase).toBe('LOBBY');
    expect(h.score('p1')).toBe(0);
  });

  it('auto-advances when enabled', () => {
    const h = new Harness(['multipleChoice'], { autoAdvance: true });
    h.host('start');
    h.advance(6001);
    expect(h.s.phase).toBe('QUESTION');
  });

  it('end jumps to results from anywhere', () => {
    const h = new Harness(['multipleChoice']);
    h.startToQuestion();
    h.host('end');
    expect(h.s.phase).toBe('GAME_RESULTS');
  });
});

describe('multiple choice', () => {
  it('scores correct answers, one answer each, reveals when all answered', () => {
    const h = new Harness(['multipleChoice']);
    h.startToQuestion();
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.correct });
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.wrongOpt }); // ignored
    h.act('p2', { kind: 'answer', qid: h.qid, optionId: h.wrongOpt });
    expect(h.s.phase).toBe('QUESTION');
    h.act('p3', { kind: 'answer', qid: h.qid, optionId: h.correct });
    expect(h.s.phase).toBe('REVEAL');
    expect(h.score('p1')).toBe(100);
    expect(h.score('p2')).toBe(0);
    expect(h.score('p3')).toBe(100);
    expect(h.s.reveal!.correctOptionId).toBeTruthy();
  });

  it('reveals on timeout', () => {
    const h = new Harness(['multipleChoice']);
    h.startToQuestion();
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.correct });
    h.advance(20_001);
    expect(h.s.phase).toBe('REVEAL');
    expect(h.score('p1')).toBe(100);
  });

  it('ignores duplicate envelopes (idempotency)', () => {
    const h = new Harness(['multipleChoice'], { speedBonus: false });
    h.startToQuestion();
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.correct }, 'dup');
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.correct }, 'dup');
    expect(h.s.processed.filter((x) => x === 'dup')).toHaveLength(1);
  });

  it('ignores answers for a stale question id', () => {
    const h = new Harness(['multipleChoice']);
    h.startToQuestion();
    h.act('p1', { kind: 'answer', qid: 'old', optionId: h.correct });
    expect(Object.keys((h.s.q as { answers: object }).answers)).toHaveLength(0);
  });

  it('never leaks the correct answer before reveal', () => {
    const h = new Harness(['multipleChoice', 'nameThatTune']);
    h.startToQuestion();
    const pub = toPublic(h.s, h.now);
    expect(JSON.stringify(pub)).not.toContain('correctOptionId');
    expect(pub.reveal).toBeNull();
    expect(JSON.stringify(pub)).not.toContain(h.s.q!.question!.explanation);
  });
});

describe('fastest finger', () => {
  it('ranks correct answers by server sequence', () => {
    const h = new Harness(['fastestFinger']);
    h.startToQuestion();
    h.act('p2', { kind: 'answer', qid: h.qid, optionId: h.wrongOpt });
    h.act('p3', { kind: 'answer', qid: h.qid, optionId: h.correct });
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.correct });
    expect(h.score('p3')).toBe(FASTEST_POINTS[0]);
    expect(h.score('p1')).toBe(FASTEST_POINTS[1]);
    expect(h.score('p2')).toBe(0);
  });
});

describe('name that tune', () => {
  it('first buzz locks others out, pauses audio, scores early correct answer', () => {
    const h = new Harness(['nameThatTune']);
    h.startToQuestion();
    expect(h.effects).toContain('play');
    h.advance(1000);
    h.act('p2', { kind: 'buzz', qid: h.qid });
    h.act('p1', { kind: 'buzz', qid: h.qid }); // too late, ignored
    const q = h.s.q as BuzzQState;
    expect(q.activeId).toBe('p2');
    expect(h.effects).toContain('pauseAudio');
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.correct }); // not active
    expect(h.s.phase).toBe('QUESTION');
    h.act('p2', { kind: 'answer', qid: h.qid, optionId: h.correct });
    expect(h.s.phase).toBe('REVEAL');
    expect(h.score('p2')).toBe(300);
    expect(h.score('p1')).toBe(0);
  });

  it('wrong answer locks out, resumes audio and lets next player buzz', () => {
    const h = new Harness(['nameThatTune']);
    h.startToQuestion();
    h.act('p1', { kind: 'buzz', qid: h.qid });
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.wrongOpt });
    const q = h.s.q as BuzzQState;
    expect(q.lockedOut).toContain('p1');
    expect(h.effects).toContain('resumeAudio');
    h.act('p1', { kind: 'buzz', qid: h.qid }); // locked out
    expect((h.s.q as BuzzQState).activeId).toBeNull();
    h.act('p3', { kind: 'buzz', qid: h.qid });
    expect((h.s.q as BuzzQState).activeId).toBe('p3');
  });

  it('buzz answer timeout counts as wrong; all locked out ends question', () => {
    const h = new Harness(['nameThatTune'], {}, ['p1', 'p2']);
    h.startToQuestion();
    h.act('p1', { kind: 'buzz', qid: h.qid });
    h.advance(8001);
    expect((h.s.q as BuzzQState).lockedOut).toContain('p1');
    h.act('p2', { kind: 'buzz', qid: h.qid });
    h.act('p2', { kind: 'answer', qid: h.qid, optionId: h.wrongOpt });
    expect(h.s.phase).toBe('REVEAL');
  });

  it('penalties never drop a score below zero', () => {
    const h = new Harness(['nameThatTune']);
    h.startToQuestion();
    h.act('p1', { kind: 'buzz', qid: h.qid });
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.wrongOpt });
    expect(h.score('p1')).toBe(0);
  });

  it('freezes the clock while a player is answering', () => {
    const h = new Harness(['nameThatTune']);
    h.startToQuestion();
    h.advance(5000);
    h.act('p1', { kind: 'buzz', qid: h.qid });
    h.advance(7000);
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.wrongOpt });
    const q = h.s.q as BuzzQState;
    expect(q.deadline).toBe(h.now - h.s.pausedTotal + 20_000);
  });
});

describe('steal points', () => {
  it('steals capped at the target score', () => {
    const h = new Harness(['multipleChoice', 'stealPoints'], { stealAmount: 150 });
    h.startToQuestion();
    // p2 earns 100 in round 1, others nothing.
    for (let i = 0; i < 3; i++) {
      h.act('p2', { kind: 'answer', qid: h.qid, optionId: h.correct });
      h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.wrongOpt });
      h.act('p3', { kind: 'answer', qid: h.qid, optionId: h.wrongOpt });
      h.host('next');
    }
    expect(h.s.phase).toBe('ROUND_RESULTS');
    expect(h.score('p2')).toBe(300);
    h.host('next');
    h.host('next');
    expect(h.s.q!.kind).toBe('stealPoints');
    h.act('p1', { kind: 'buzz', qid: h.qid });
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.correct });
    expect((h.s.q as BuzzQState).stage).toBe('choosing');
    h.act('p1', { kind: 'target', qid: h.qid, targetId: 'p3' }); // p3 has 0: not a valid target
    expect(h.s.phase).toBe('QUESTION');
    h.act('p1', { kind: 'target', qid: h.qid, targetId: 'p2' });
    expect(h.s.phase).toBe('REVEAL');
    expect(h.score('p1')).toBe(100 + 150);
    expect(h.score('p2')).toBe(150);
  });

  it('cannot steal more than the target has', () => {
    const h = new Harness(['stealPoints'], { stealAmount: 500 });
    h.startToQuestion();
    h.act('p1', { kind: 'buzz', qid: h.qid });
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.correct });
    // Nobody else has points: no steal stage.
    expect(h.s.phase).toBe('REVEAL');
    h.host('next');
    h.act('p2', { kind: 'buzz', qid: h.qid });
    h.act('p2', { kind: 'answer', qid: h.qid, optionId: h.correct });
    h.act('p2', { kind: 'target', qid: h.qid, targetId: 'p1' });
    expect(h.score('p1')).toBe(0);
    expect(h.score('p2')).toBe(200);
  });
});

describe('pass the bomb', () => {
  it('correct answer lets holder pass; explosion penalises holder', () => {
    const h = new Harness(['multipleChoice', 'passTheBomb'], { bombPenalty: 200 });
    h.startToQuestion();
    for (let i = 0; i < 3; i++) {
      for (const p of ['p1', 'p2', 'p3']) h.act(p, { kind: 'answer', qid: h.qid, optionId: h.correct });
      h.host('next');
    }
    h.host('next');
    h.host('next');
    const q = h.s.q as BombQState;
    expect(q.kind).toBe('passTheBomb');
    const holder = q.holder;
    const other = ['p1', 'p2', 'p3'].find((p) => p !== holder)!;
    // Non-holder actions ignored.
    h.act(other, { kind: 'answer', qid: h.qid, optionId: h.correct });
    expect((h.s.q as BombQState).stage).toBe('answering');
    h.act(holder, { kind: 'answer', qid: h.qid, optionId: h.correct });
    expect((h.s.q as BombQState).stage).toBe('passing');
    h.act(holder, { kind: 'target', qid: h.qid, targetId: other });
    expect((h.s.q as BombQState).holder).toBe(other);
    const before = h.score(other);
    h.advance(60_000 * 2);
    expect(h.s.phase).toBe('REVEAL');
    expect(h.score(other)).toBe(before - 200);
  });

  it('wrong answer gives the holder a new question', () => {
    const h = new Harness(['passTheBomb']);
    h.startToQuestion();
    const q = h.s.q as BombQState;
    const firstQid = q.qid;
    h.act(q.holder, { kind: 'answer', qid: h.qid, optionId: h.wrongOpt });
    expect((h.s.q as BombQState).stage).toBe('feedback');
    h.advance(1600);
    expect((h.s.q as BombQState).stage).toBe('answering');
    expect(h.s.q!.qid).not.toBe(firstQid);
  });

  it('does not reveal the fuse publicly', () => {
    const h = new Harness(['passTheBomb']);
    h.startToQuestion();
    expect(JSON.stringify(toPublic(h.s, h.now))).not.toContain('fuseAt');
  });
});

describe('music bingo', () => {
  it('counts lines', () => {
    expect(completedLines([0, 1, 2])).toBe(1);
    expect(completedLines([0, 1, 2, 4, 8])).toBe(2);
    expect(completedLines([0, 1, 3])).toBe(0);
  });

  it('validates ticks against played clips and awards line bonus', () => {
    const h = new Harness(['musicBingo'], { bingoClips: 15 });
    h.startToQuestion();
    let q = h.s.q as BingoQState;
    const card = q.cards.p1;
    // Before anything plays, any tick is a miss (but no negative score).
    h.act('p1', { kind: 'tick', qid: h.qid, cell: 0 });
    expect((h.s.q as BingoQState).misses.p1).toContain(0);
    expect(h.score('p1')).toBe(0);

    // Make the first three clips match p1's top row, then play them.
    const rowIds = card.slice(0, 3).map((c) => c.trackId);
    q = h.s.q as BingoQState;
    q.playOrder = [...rowIds, ...q.playOrder.filter((id) => !rowIds.includes(id))];
    for (let i = 0; i < 3; i++) {
      h.advance(3001);
      h.advance(15_001);
    }
    q = h.s.q as BingoQState;
    expect(q.clipIndex).toBe(2);
    // Re-ticking a miss after its song played works.
    h.act('p1', { kind: 'tick', qid: h.qid, cell: 0 });
    h.act('p1', { kind: 'tick', qid: h.qid, cell: 1 });
    h.act('p1', { kind: 'tick', qid: h.qid, cell: 2 });
    q = h.s.q as BingoQState;
    expect(q.marks.p1).toEqual([0, 1, 2]);
    expect(q.lineWinner).toBe('p1');
    expect(h.score('p1')).toBe(3 * BINGO_POINTS.tick + BINGO_POINTS.line + BINGO_POINTS.firstLine);
    expect(card).toHaveLength(9);
  });

  it('full card ends the round', () => {
    const h = new Harness(['musicBingo'], { bingoClips: 15 });
    h.startToQuestion();
    const q = h.s.q as BingoQState;
    // Force all of p1's card into the play order.
    q.playOrder = [...q.cards.p1.map((c) => c.trackId)];
    for (let i = 0; i < 9; i++) {
      h.advance(3001);
      h.advance(15_001);
    }
    for (let c = 0; c < 9; c++) h.act('p1', { kind: 'tick', qid: h.qid, cell: c });
    expect(h.s.phase).toBe('REVEAL');
    expect(h.s.reveal!.headline).toContain('FULL HOUSE');
  });

  it('deals a card to late joiners', () => {
    const h = new Harness(['musicBingo']);
    h.startToQuestion();
    h.act('late', { kind: 'join', name: 'Late', colour: 'sky', avatar: 'mic' });
    expect((h.s.q as BingoQState).cards.late).toHaveLength(9);
  });
});

describe('pause and presence', () => {
  it('pausing freezes timers', () => {
    const h = new Harness(['multipleChoice']);
    h.startToQuestion();
    h.advance(5000);
    h.host('pause');
    h.advance(60_000);
    expect(h.s.phase).toBe('QUESTION');
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.correct }); // ignored while paused
    h.host('resume');
    h.advance(14_000);
    expect(h.s.phase).toBe('QUESTION');
    h.advance(1_001);
    expect(h.s.phase).toBe('REVEAL');
    expect(h.score('p1')).toBe(0);
  });

  it('disconnected players do not block "everyone answered"', () => {
    const h = new Harness(['multipleChoice']);
    h.startToQuestion();
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.correct });
    h.act('p2', { kind: 'answer', qid: h.qid, optionId: h.correct });
    h.ev({ type: 'presence', online: ['p1', 'p2'] });
    h.advance(10);
    expect(h.s.phase).toBe('REVEAL');
    expect(h.s.players.find((p) => p.id === 'p3')!.connected).toBe(false);
  });

  it('standings share rank on ties', () => {
    const h = new Harness(['multipleChoice']);
    h.startToQuestion();
    for (const p of ['p1', 'p2']) h.act(p, { kind: 'answer', qid: h.qid, optionId: h.correct });
    h.act('p3', { kind: 'answer', qid: h.qid, optionId: h.wrongOpt });
    const st = standings(h.s);
    expect(st.map((x) => x.rank)).toEqual([1, 1, 3]);
  });
});

describe('answer normalisation', () => {
  it('normalises typed answers', () => {
    expect(normaliseAnswer('The Beatles')).toBe('beatles');
    expect(normaliseAnswer('Uptown Funk (feat. Bruno Mars)')).toBe('uptown funk');
    expect(normaliseAnswer('Simon & Garfunkel')).toBe('simon and garfunkel');
    expect(normaliseAnswer('Beyoncé')).toBe('beyonce');
    expect(matchesAccepted('beatles!', ['The Beatles'])).toBe(true);
    expect(matchesAccepted('', ['x'])).toBe(false);
  });
});

describe('music gating', () => {
  it('holds the timer and answers until the clip is confirmed playing', () => {
    const h = new Harness(['introSprint']);
    h.autoAudio = false;
    h.startToQuestion();
    const q = h.s.q!;
    expect(q.audio).toBe('loading');
    expect(q.deadline).toBeNull();
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.correct });
    expect(Object.keys((h.s.q as { answers: object }).answers)).toHaveLength(0);
    h.advance(10_000); // lag: still no timer running
    expect(h.s.q!.deadline).toBeNull();
    h.ev({ type: 'audio', key: h.plays.at(-1)!, status: 'started' });
    expect(h.s.q!.audio).toBe('playing');
    expect(h.s.q!.deadline).toBe(h.now - h.s.pausedTotal + 20_000);
    h.act('p1', { kind: 'answer', qid: h.qid, optionId: h.correct });
    expect(Object.keys((h.s.q as { answers: object }).answers)).toHaveLength(1);
  });

  it('keeps the buzzer locked until Name That Tune music plays', () => {
    const h = new Harness(['nameThatTune']);
    h.autoAudio = false;
    h.startToQuestion();
    expect((h.s.q as BuzzQState).stage).toBe('loading');
    h.act('p1', { kind: 'buzz', qid: h.qid });
    expect((h.s.q as BuzzQState).activeId).toBeNull();
    h.ev({ type: 'audio', key: h.plays.at(-1)!, status: 'started' });
    expect((h.s.q as BuzzQState).stage).toBe('open');
    h.act('p1', { kind: 'buzz', qid: h.qid });
    expect((h.s.q as BuzzQState).activeId).toBe('p1');
  });

  it('ignores stale audio confirmations', () => {
    const h = new Harness(['whoSings']);
    h.autoAudio = false;
    h.startToQuestion();
    h.ev({ type: 'audio', key: 'old-key', status: 'started' });
    expect(h.s.q!.audio).toBe('loading');
  });

  it('flags failures and timeouts; host can retry or play without music', () => {
    const h = new Harness(['decadeDash']);
    h.autoAudio = false;
    h.startToQuestion();
    h.ev({ type: 'audio', key: h.plays.at(-1)!, status: 'failed', detail: 'Premium required' });
    expect(h.s.q!.audio).toBe('failed');
    expect(h.s.q!.audioError).toBe('Premium required');
    h.host('retryAudio');
    expect(h.s.q!.audio).toBe('loading');
    expect(h.plays).toHaveLength(2);
    h.advance(15_001);
    expect(h.s.q!.audio).toBe('failed');
    h.host('audioStarted');
    expect(h.s.q!.deadline).not.toBeNull();
  });

  it('preloads the first clip at the round intro and the next at each reveal', () => {
    const h = new Harness(['introSprint']);
    h.host('start');
    expect(h.effects).toContain('preload');
    const before = h.effects.filter((e) => e === 'preload').length;
    h.host('next');
    for (const p of ['p1', 'p2', 'p3']) h.act(p, { kind: 'answer', qid: h.qid, optionId: h.correct });
    expect(h.s.phase).toBe('REVEAL');
    expect(h.effects.filter((e) => e === 'preload').length).toBe(before + 1);
  });

  it('bingo clip timer waits for the music too', () => {
    const h = new Harness(['musicBingo']);
    h.autoAudio = false;
    h.startToQuestion();
    h.advance(2001);
    const q = h.s.q as BingoQState;
    expect(q.audio).toBe('loading');
    expect(q.clipEndsAt).toBeNull();
    h.ev({ type: 'audio', key: h.plays.at(-1)!, status: 'started' });
    expect((h.s.q as BingoQState).clipEndsAt).not.toBeNull();
  });
});
