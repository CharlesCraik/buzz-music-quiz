import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PlayerAction } from '../game/types';
import { isAnswerKind, type PublicPlayer, type PublicState } from '../game/view';
import type { ConnectionStatus, SendResult } from '../realtime';
import { ERROR_TEXT } from '../realtime';
import { Avatar } from '../ui/Avatar';
import { Bomb, Equaliser, Explosion } from '../ui/decor';
import { useRollingNumber, vibrate } from '../ui/hooks';
import { ANSWER_STYLES, COLOUR_HEX, COLOUR_SHAPE } from '../ui/tokens';
import { AnswerPad, BingoCard, Buzzer, Center, MashPad, TargetPicker, TimeBar } from './parts';

interface Local {
  qid: string;
  answer?: string;
  buzzed?: boolean;
  target?: boolean;
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function TopBar({ me, pub, status }: { me: PublicPlayer; pub: PublicState; status: ConnectionStatus }) {
  const score = useRollingNumber(me.score);
  const rank = pub.standings.find((s) => s.playerId === me.id)?.rank;
  return (
    <div className="chunky-sm flex shrink-0 items-center gap-2 px-2 py-1" style={{ background: COLOUR_HEX[me.colour] }}>
      <Avatar id={me.avatar} colour={me.colour} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg leading-tight font-bold">
          <span aria-hidden className="mr-1 opacity-60">
            {COLOUR_SHAPE[me.colour]}
          </span>
          {me.name}
        </p>
        <p className="text-xs font-semibold">
          {pub.phase !== 'LOBBY' && rank ? `${ordinal(rank)} place` : `Room ${pub.roomCode}`}
          {status !== 'online' && <span className="ml-2 rounded bg-ink px-1 text-cream">reconnecting…</span>}
        </p>
      </div>
      <div className="text-right">
        <p className="font-display text-3xl leading-none font-bold tabular-nums">{score}</p>
        <p className="text-[10px] font-bold tracking-wider uppercase">points</p>
      </div>
    </div>
  );
}

function Waiting({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <Center>
      {children}
      <h2 className="font-display text-[clamp(1.6rem,8vw,2.6rem)] leading-tight font-bold text-balance">{title}</h2>
      {sub && <p className="max-w-xs text-lg text-ink/70">{sub}</p>}
    </Center>
  );
}

export function Controller({
  pub,
  me,
  offset,
  status,
  hostOnline,
  send,
}: {
  pub: PublicState;
  me: PublicPlayer;
  offset: number;
  status: ConnectionStatus;
  hostOnline: boolean;
  send: (a: PlayerAction) => Promise<SendResult>;
}) {
  const q = pub.question;
  const [local, setLocal] = useState<Local>({ qid: '' });
  const [toast, setToast] = useState<string | null>(null);
  const loc = local.qid === q?.qid ? local : { qid: q?.qid ?? '' };
  const lastReveal = useRef<string>('');

  const act = async (a: PlayerAction, patch: Partial<Local> = {}) => {
    if (q) setLocal({ ...loc, qid: q.qid, ...patch });
    const res = await send(a);
    if (!res.ok) {
      setToast(ERROR_TEXT[res.error] ?? 'That did not go through. Try again.');
      if (q) setLocal({ qid: q.qid }); // allow retry
      window.setTimeout(() => setToast(null), 2500);
    }
  };

  // Delivery check: if the host hasn't registered our answer within 3s, send it again.
  // (The host only ever counts one answer per player, so resending is safe.)
  const confirmed = !!q && q.answered.includes(me.id);
  const pendingAnswer = q && loc.answer && !confirmed && pub.phase === 'QUESTION' ? loc.answer : null;
  useEffect(() => {
    if (!q || !pendingAnswer) return;
    const qid = q.qid;
    const t = window.setInterval(() => {
      void send({ kind: 'answer', qid, optionId: pendingAnswer });
    }, 3000);
    return () => clearInterval(t);
  }, [q?.qid, pendingAnswer, send]); // eslint-disable-line react-hooks/exhaustive-deps

  // Haptic feedback on reveal.
  useEffect(() => {
    if (pub.phase !== 'REVEAL' || !pub.reveal || !q) return;
    const key = q.qid;
    if (lastReveal.current === key) return;
    lastReveal.current = key;
    const r = pub.reveal.results.find((x) => x.playerId === me.id);
    if (r && r.delta > 0) vibrate([40, 40, 40]);
    else if (r && r.delta < 0) vibrate(250);
  }, [pub.phase, pub.reveal, q, me.id]);

  const others = pub.players.filter((p) => p.id !== me.id);
  const nameOf = (id: string | null | undefined) => pub.players.find((p) => p.id === id)?.name ?? 'Someone';
  const colourHex = COLOUR_HEX[me.colour];

  let body: ReactNode = null;

  if (pub.phase === 'LOBBY') {
    body = (
      <Center>
        <div className="animate-bob">
          <Avatar id={me.avatar} colour={me.colour} size="min(45vw, 30dvh)" mood={me.ready ? 'happy' : 'idle'} />
        </div>
        <h2 className="font-display text-3xl font-bold">You're in!</h2>
        <p className="text-lg text-ink/70">
          {pub.players.length} player{pub.players.length === 1 ? '' : 's'} so far. Watch the TV, the host starts the show.
        </p>
        <button
          className={`btn min-h-16 w-full max-w-sm text-2xl ${me.ready ? 'bg-lime' : 'bg-sunflower'}`}
          onClick={() => void send({ kind: 'ready', ready: !me.ready })}
          aria-pressed={me.ready}
        >
          {me.ready ? "I'm ready! ✓" : 'Tap when ready'}
        </button>
      </Center>
    );
  } else if (pub.phase === 'ROUND_INTRO' && pub.round) {
    body = (
      <Center>
        <p className="label text-ink/60">
          Round {pub.round.index + 1} of {pub.round.total}
        </p>
        <motion.h2
          initial={{ scale: 2, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: -2, opacity: 1 }}
          className="chunky bg-sunflower px-5 py-3 font-display text-[clamp(2rem,10vw,3.2rem)] leading-none font-bold"
        >
          {pub.round.title}
        </motion.h2>
        <p className="max-w-sm text-lg font-semibold">{pub.round.rules}</p>
        <p className="font-display text-xl text-ink/60">Get ready…</p>
      </Center>
    );
  } else if (pub.phase === 'QUESTION' && q) {
    const waitingForMusic = q.audio === 'loading' || q.audio === 'failed';
    if (isAnswerKind(q.kind)) {
      const done = !!loc.answer || q.answered.includes(me.id);
      body = waitingForMusic ? (
        <Waiting title="Get ready…" sub="The music is starting. Answers open as soon as it plays!">
          <Equaliser className="h-16 w-32" playing={false} />
        </Waiting>
      ) : done ? (
        <Waiting
          title={q.answered.includes(me.id) ? 'Locked in!' : 'Sending…'}
          sub={q.answered.includes(me.id) ? 'Fingers crossed… watch the TV.' : 'Making sure the TV got your answer.'}
        >
          {loc.answer && (
            <span
              className="chunky grid h-28 w-28 place-items-center font-display text-6xl font-bold"
              style={{ background: ANSWER_STYLES[q.options.findIndex((o) => o.id === loc.answer)]?.bg }}
            >
              {ANSWER_STYLES[q.options.findIndex((o) => o.id === loc.answer)]?.letter}
            </span>
          )}
        </Waiting>
      ) : (
        <>
          <TimeBar deadline={q.deadline} total={q.durationMs} offset={offset} paused={pub.paused} />
          {q.prompt && <p className="line-clamp-2 shrink-0 text-center font-display text-lg leading-tight font-semibold">{q.prompt}</p>}
          <AnswerPad options={q.options} onPick={(id) => void act({ kind: 'answer', qid: q.qid, optionId: id }, { answer: id })} />
        </>
      );
    } else if ((q.kind === 'nameThatTune' || q.kind === 'stealPoints') && q.buzz) {
      const b = q.buzz;
      const lockedOut = b.lockedOut.includes(me.id);
      if (b.stage === 'loading') {
        body = (
          <Waiting title="Get ready to buzz…" sub="The buzzer unlocks as soon as the music plays.">
            <Equaliser className="h-16 w-32" playing={false} />
          </Waiting>
        );
      } else if (b.stage === 'answering' && b.activeId === me.id) {
        body = (
          <>
            <TimeBar deadline={b.activeDeadline} total={8000} offset={offset} paused={pub.paused} />
            <p className="shrink-0 text-center font-display text-2xl font-bold">You buzzed! Pick your answer</p>
            <AnswerPad options={q.options} onPick={(id) => void act({ kind: 'answer', qid: q.qid, optionId: id }, { answer: id })} picked={loc.answer} />
          </>
        );
      } else if (b.stage === 'choosing' && b.activeId === me.id) {
        body = (
          <TargetPicker
            title="Correct! Steal from…"
            players={others.filter((p) => b.targets.includes(p.id))}
            onPick={(id) => void act({ kind: 'target', qid: q.qid, targetId: id }, { target: true })}
          />
        );
      } else if (b.activeId) {
        body = (
          <Waiting
            title={`${nameOf(b.activeId)} buzzed in!`}
            sub={b.stage === 'choosing' ? "They're choosing who to steal from…" : 'Hold tight, they are answering.'}
          />
        );
      } else if (lockedOut) {
        body = <Waiting title="Locked out" sub="Wrong answer this time. Wait for the next question." />;
      } else {
        body = (
          <>
            <TimeBar deadline={q.deadline} total={q.durationMs} offset={offset} paused={pub.paused} />
            {q.kind === 'nameThatTune' && (
              <div className="flex shrink-0 justify-center">
                <Equaliser className="h-10 w-28" playing={q.audioPlaying} />
              </div>
            )}
            {q.kind === 'stealPoints' && q.prompt && (
              <p className="line-clamp-3 shrink-0 text-center font-display text-lg leading-tight font-semibold">{q.prompt}</p>
            )}
            <Buzzer colour={colourHex} disabled={loc.buzzed || pub.paused} onBuzz={() => void act({ kind: 'buzz', qid: q.qid }, { buzzed: true })} />
          </>
        );
      }
    } else if (q.kind === 'passTheBomb' && q.bomb) {
      const bomb = q.bomb;
      if (bomb.holder === me.id) {
        if (bomb.stage === 'passing') {
          body = (
            <TargetPicker
              title="Phew! Pass the bomb to…"
              players={others.filter((p) => bomb.targets.includes(p.id))}
              onPick={(id) => void act({ kind: 'target', qid: q.qid, targetId: id }, { target: true })}
            />
          );
        } else if (bomb.stage === 'feedback') {
          body = <Waiting title="Wrong! Next question…" sub="Quick, the fuse is still burning!"><Bomb size={120} shake={!pub.settings.reducedMotion} /></Waiting>;
        } else {
          body = (
            <>
              <div className="flex shrink-0 items-center gap-2">
                <Bomb size={56} shake={!pub.settings.reducedMotion} />
                <p className="font-display text-2xl leading-tight font-bold">You've got the bomb! Answer to pass it on</p>
              </div>
              {q.prompt && <p className="line-clamp-3 shrink-0 text-center font-display text-lg leading-tight font-semibold">{q.prompt}</p>}
              <AnswerPad options={q.options} onPick={(id) => void act({ kind: 'answer', qid: q.qid, optionId: id }, { answer: id })} picked={loc.answer} />
            </>
          );
        }
      } else {
        body = (
          <Waiting title={`${nameOf(bomb.holder)} has the bomb!`} sub="Pray they don't pass it to you…">
            <Bomb size="min(45vw, 28dvh)" shake={!pub.settings.reducedMotion} />
          </Waiting>
        );
      }
    } else if (q.kind === 'musicalChairs' && q.chairs) {
      const c = q.chairs;
      const alive = c.alive.includes(me.id);
      const seated = c.seated.includes(me.id);
      if (!alive) {
        const why = c.out.find((o) => o.playerId === me.id)?.reason;
        body = <Waiting title="You're out!" sub={why === 'early' ? 'You sat down before the music stopped!' : 'No chair left for you. Watch the TV!'} />;
      } else if (c.stage === 'loading') {
        body = <Waiting title="Get ready to dance…" sub="When the music STOPS, tap SIT. Not before!" />;
      } else if (c.stage === 'result') {
        body =
          c.seated.length === 0 ? (
            <Waiting title="Nobody sat down!" sub="Same again: listen for the music to stop." />
          ) : (
            <Waiting title="Safe!" sub="You're through to the next song." />
          );
      } else if (seated) {
        body = <Waiting title="Safe! You found a chair." sub="Waiting for the others…" />;
      } else {
        const sitNow = c.stage === 'sit';
        body = (
          <>
            <p className={`shrink-0 text-center font-display text-2xl font-bold ${sitNow ? 'text-tomato' : ''}`}>
              {sitNow ? 'The music stopped! SIT!' : 'Dance! Wait for the music to stop…'}
            </p>
            <Buzzer
              colour={sitNow ? colourHex : '#c9c6d6'}
              label="SIT!"
              disabled={pub.paused}
              onBuzz={() => void act({ kind: 'tap', qid: q.qid }, { buzzed: true })}
            />
          </>
        );
      }
    } else if (q.kind === 'beatMash' && q.mash) {
      body =
        q.mash.stage === 'loading' ? (
          <Waiting title="Fingers ready…" sub="Start mashing the moment the music plays!" />
        ) : (
          <MashPad
            key={q.qid}
            active={q.mash.stage === 'mashing' && !pub.paused}
            colour={colourHex}
            onTotal={(count) => void send({ kind: 'tap', qid: q.qid, count })}
          />
        );
    } else if (q.kind === 'lastStanding' && q.survival) {
      const sv = q.survival;
      const lives = sv.lives[me.id] ?? 0;
      const hearts = (
        <p className="shrink-0 text-center font-display text-3xl" aria-label={`${lives} lives`}>
          {[0, 1].map((i) => (
            <span key={i} className={i < lives ? 'text-tomato' : 'text-ink/20'}>
              ♥
            </span>
          ))}
        </p>
      );
      if (lives <= 0 && sv.stage === 'answering') {
        body = <Waiting title="You're out!" sub="Watch the others battle it out on the TV." />;
      } else if (sv.stage === 'result') {
        const r = sv.lastResult?.[me.id];
        body = (
          <Waiting
            title={
              r === undefined
                ? 'Watch the TV'
                : r
                  ? 'Survived!'
                  : sv.amnesty
                    ? 'Phew! Saved!'
                    : lives > 0
                      ? 'Lost a life!'
                      : "You're out!"
            }
            sub={sv.lastNote ?? undefined}
          >
            {hearts}
          </Waiting>
        );
      } else if (loc.answer || q.answered.includes(me.id)) {
        body = (
          <Waiting title={q.answered.includes(me.id) ? 'Locked in!' : 'Sending…'} sub="Hold your nerve…">
            {hearts}
          </Waiting>
        );
      } else {
        body = (
          <>
            <TimeBar deadline={q.deadline} total={q.durationMs} offset={offset} paused={pub.paused} />
            {hearts}
            {q.prompt && <p className="line-clamp-2 shrink-0 text-center font-display text-lg leading-tight font-semibold">{q.prompt}</p>}
            <AnswerPad options={q.options} onPick={(id) => void act({ kind: 'answer', qid: q.qid, optionId: id }, { answer: id })} />
          </>
        );
      }
    } else if (q.kind === 'musicBingo' && q.bingo) {
      const card = q.bingo.cards[me.id];
      body = card ? (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2">
            <Equaliser className="h-8 w-16" playing={q.bingo.playing && !pub.paused} />
            <p className="font-display text-lg font-bold">
              {q.bingo.clipNumber === 0 ? 'Get ready!' : `Song ${q.bingo.clipNumber}/${q.bingo.totalClips}`}
            </p>
            <p className="font-display text-lg font-bold">{(q.bingo.marks[me.id] ?? []).length}/9</p>
          </div>
          <p className="shrink-0 text-center text-sm text-ink/70">Tap a song when you hear it. Wrong taps cost points!</p>
          <div className="flex min-h-0 flex-1 items-center">
            <BingoCard
              cells={card}
              marks={q.bingo.marks[me.id] ?? []}
              misses={q.bingo.misses[me.id] ?? []}
              onTick={(i) => void send({ kind: 'tick', qid: q.qid, cell: i })}
            />
          </div>
        </>
      ) : (
        <Waiting title="Dealing your card…" />
      );
    }
  } else if (pub.phase === 'REVEAL' && pub.reveal) {
    const r = pub.reveal.results.find((x) => x.playerId === me.id);
    const delta = r?.delta ?? 0;
    const good = delta > 0 || r?.correct === true;
    const bad = delta < 0 || r?.correct === false;
    const exploded = q?.kind === 'passTheBomb' && delta < 0;
    body = (
      <Center>
        {exploded ? (
          <Explosion size="min(60vw, 30dvh)" />
        ) : (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>
            <Avatar id={me.avatar} colour={me.colour} size="min(42vw, 26dvh)" mood={good ? 'happy' : bad ? 'sad' : 'idle'} />
          </motion.div>
        )}
        <h2 className={`font-display text-[clamp(2rem,10vw,3.4rem)] leading-none font-bold ${good ? 'text-teal' : bad ? 'text-tomato' : ''}`}>
          {exploded ? 'BOOM!' : good ? 'Nice one!' : bad ? 'Oh no!' : 'Next time!'}
        </h2>
        {delta !== 0 && (
          <p className="chunky-sm bg-paper px-4 py-1 font-display text-3xl font-bold">
            {delta > 0 ? '+' : ''}
            {delta}
          </p>
        )}
        {pub.reveal.correctText && (
          <p className="text-lg">
            Answer: <strong>{pub.reveal.correctText}</strong>
          </p>
        )}
        <p className="text-ink/60">{pub.reveal.headline}</p>
      </Center>
    );
  } else if (pub.phase === 'ROUND_RESULTS' || pub.phase === 'GAME_RESULTS') {
    const st = pub.standings.find((s) => s.playerId === me.id);
    const final = pub.phase === 'GAME_RESULTS';
    const delta = pub.roundDeltas?.[me.id] ?? 0;
    body = (
      <Center>
        <Avatar id={me.avatar} colour={me.colour} size="min(42vw, 26dvh)" mood={st?.rank === 1 ? 'happy' : 'idle'} bob />
        <p className="label text-ink/60">{final ? 'Final result' : 'After this round'}</p>
        <h2 className="font-display text-[clamp(2.4rem,12vw,4rem)] leading-none font-bold">
          {st ? ordinal(st.rank) : '-'} place
        </h2>
        <p className="font-display text-2xl">{me.score} points</p>
        {!final && delta !== 0 && (
          <p className={`font-display text-xl font-bold ${delta > 0 ? 'text-teal' : 'text-tomato'}`}>
            {delta > 0 ? '+' : ''}
            {delta} this round
          </p>
        )}
        {final && st?.rank === 1 && <p className="chunky-sm bg-sunflower px-4 py-1 font-display text-2xl font-bold">Champion!</p>}
      </Center>
    );
  }

  return (
    <div
      className={`phone-shell paper-bg relative flex flex-col gap-3 ${pub.settings.highContrast ? 'high-contrast' : ''} ${pub.settings.reducedMotion ? 'reduced-motion' : ''}`}
    >
      <TopBar me={me} pub={pub} status={status} />
      <div className="flex min-h-0 flex-1 flex-col gap-3">{body}</div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            className="chunky-sm absolute inset-x-4 bottom-6 z-20 bg-ink p-3 text-center font-semibold text-cream"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {(pub.paused || !hostOnline) && pub.phase !== 'LOBBY' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-ink/70 p-6">
          <div className="chunky flex flex-col items-center gap-3 bg-sunflower p-6 text-center">
            <p className="font-display text-4xl font-bold">{!hostOnline ? 'Host reconnecting…' : 'Paused'}</p>
            <p>{!hostOnline ? 'Hang on, the TV lost its connection. Your score is safe.' : 'The host paused the game.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
