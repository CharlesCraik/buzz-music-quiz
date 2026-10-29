import { AnimatePresence, motion } from 'framer-motion';
import { BINGO_LINES } from '../../game/rounds/musicBingo';
import type { PublicPlayer, PublicState } from '../../game/view';
import { Avatar } from '../../ui/Avatar';
import { Bomb, Equaliser, Explosion, TimerRing } from '../../ui/decor';
import { useRemaining } from '../../ui/hooks';
import { COLOUR_HEX } from '../../ui/tokens';
import { OptionsGrid, playerById } from './common';

function useHostRemaining(pub: PublicState, deadline: number | null | undefined) {
  // The TV is the host, so no clock offset.
  return useRemaining(deadline, 0, pub.paused);
}

function Header({ pub, timer }: { pub: PublicState; timer?: { deadline: number | null; total: number } }) {
  const q = pub.question!;
  const remaining = useHostRemaining(pub, timer?.deadline);
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {q.kind !== 'musicBingo' && q.kind !== 'passTheBomb' && (
          <span className="chunky-sm bg-cream px-[1vw] py-[0.3vw] font-display text-[clamp(0.9rem,1.4vw,1.8rem)] font-semibold">
            Question {q.number} of {q.total}
          </span>
        )}
        {q.category && (
          <span className="chunky-sm bg-grape px-[1vw] py-[0.3vw] font-display text-[clamp(0.9rem,1.4vw,1.8rem)] font-semibold text-cream">
            {q.category}
          </span>
        )}
      </div>
      {timer?.deadline ? <TimerRing remainingMs={remaining} totalMs={timer.total} size="clamp(64px,8vw,170px)" /> : null}
    </div>
  );
}

function Prompt({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <motion.h2
      key={text}
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="tv-text-xl text-center font-display font-bold text-balance text-cream"
    >
      {text}
    </motion.h2>
  );
}

function BuzzBanner({ pub }: { pub: PublicState }) {
  const b = pub.question!.buzz!;
  const active = playerById(pub, b.activeId);
  const remaining = useHostRemaining(pub, b.activeDeadline);
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key={active.id + b.stage}
          initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          className="chunky flex items-center gap-[1.5vw] px-[2vw] py-[1vh]"
          style={{ background: COLOUR_HEX[active.colour] }}
        >
          <Avatar id={active.avatar} colour={active.colour} mood="wow" size="clamp(56px,7vw,150px)" />
          <div>
            <p className="tv-text-xl font-display font-bold">{active.name}</p>
            <p className="tv-text-md font-display font-semibold">
              {b.stage === 'choosing' ? 'is choosing who to steal from…' : 'buzzed in! Answering on their phone…'}
            </p>
          </div>
          <TimerRing remainingMs={remaining} totalMs={b.stage === 'choosing' ? 12_000 : 8_000} size="clamp(56px,6vw,130px)" dark={false} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BuzzStage({ pub }: { pub: PublicState }) {
  const q = pub.question!;
  const b = q.buzz!;
  const isTune = q.kind === 'nameThatTune';
  const locked = b.lockedOut.map((id) => playerById(pub, id)).filter((p): p is PublicPlayer => !!p);
  return (
    <div className="flex h-full flex-col gap-[2vh]">
      <Header pub={pub} timer={b.stage === 'open' ? { deadline: q.deadline, total: q.durationMs } : undefined} />
      {isTune && (
        <div className="flex items-center justify-center gap-[2vw]">
          <Equaliser className="h-[clamp(48px,10vh,180px)] w-[clamp(80px,12vw,260px)]" playing={q.audioPlaying} bars={7} />
          <Prompt text={q.prompt} />
          <Equaliser className="h-[clamp(48px,10vh,180px)] w-[clamp(80px,12vw,260px)]" playing={q.audioPlaying} bars={7} />
        </div>
      )}
      {!isTune && <Prompt text={q.prompt} />}
      <div className="flex min-h-[clamp(70px,14vh,200px)] items-center justify-center">
        {b.stage === 'loading' ? (
          <MusicStarting pub={pub} />
        ) : b.activeId ? (
          <BuzzBanner pub={pub} />
        ) : (
          <motion.p
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            className="chunky bg-tomato px-[2vw] py-[1vh] font-display text-[clamp(1.4rem,3vw,4rem)] font-bold text-cream"
          >
            BUZZ IN!
          </motion.p>
        )}
      </div>
      <div className="mt-auto">
        <OptionsGrid options={q.options} />
      </div>
      {locked.length > 0 && (
        <p className="text-center font-display text-[clamp(0.9rem,1.4vw,1.8rem)] text-cream/70">
          Locked out: {locked.map((p) => p.name).join(', ')}
        </p>
      )}
    </div>
  );
}

/** Big "get ready" banner shown while the clip is loading; the clock hasn't started yet. */
function MusicStarting({ pub }: { pub: PublicState }) {
  const q = pub.question!;
  if (q.audio !== 'loading' && q.audio !== 'failed') return null;
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="chunky mx-auto flex items-center gap-[1.5vw] bg-sunflower px-[2vw] py-[1vh]"
    >
      <Equaliser className="h-[clamp(36px,6vh,100px)] w-[clamp(60px,8vw,160px)]" playing={false} />
      <p className="tv-text-lg font-display font-bold">
        {q.audio === 'failed' ? 'Waiting for the music…' : 'Get ready… the music is starting'}
      </p>
    </motion.div>
  );
}

function AnswerStage({ pub }: { pub: PublicState }) {
  const q = pub.question!;
  const musical = q.audio !== 'none' || q.kind === 'introSprint' || q.kind === 'whoSings' || q.kind === 'decadeDash';
  return (
    <div className="flex h-full flex-col gap-[3vh]">
      <Header pub={pub} timer={{ deadline: q.deadline, total: q.durationMs }} />
      <div className="flex flex-1 flex-col items-center justify-center gap-[2vh]">
        {musical && q.audio === 'playing' && (
          <Equaliser className="h-[clamp(48px,10vh,180px)] w-[clamp(120px,20vw,420px)]" playing={q.audioPlaying} bars={9} />
        )}
        <MusicStarting pub={pub} />
        <Prompt text={q.prompt} />
      </div>
      <OptionsGrid options={q.options} />
      <p className="text-center font-display text-[clamp(0.9rem,1.4vw,1.8rem)] text-cream/70">
        {q.answered.length} of {pub.players.filter((p) => p.connected).length} locked in
        {q.kind === 'fastestFinger' ? ' · fastest correct answers score most!' : ''}
      </p>
    </div>
  );
}

function BombStage({ pub }: { pub: PublicState }) {
  const q = pub.question!;
  const b = q.bomb!;
  const holder = playerById(pub, b.holder);
  const reduced = pub.settings.reducedMotion;
  return (
    <div className="flex h-full flex-col gap-[2vh]">
      <Header pub={pub} />
      <div className="grid flex-1 items-center gap-[2vw] md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <Bomb size="clamp(120px,18vw,380px)" shake={!reduced} />
            {holder && (
              <div className="absolute -right-[2vw] -bottom-[1vw]">
                <Avatar id={holder.avatar} colour={holder.colour} mood="wow" size="clamp(60px,8vw,170px)" />
              </div>
            )}
          </div>
          {holder && (
            <p className="chunky-sm px-4 py-1 font-display text-[clamp(1.1rem,2.2vw,2.8rem)] font-bold" style={{ background: COLOUR_HEX[holder.colour] }}>
              {holder.name} has the bomb!
            </p>
          )}
          <p className="font-display text-[clamp(0.8rem,1.2vw,1.5rem)] text-cream/60">Passed {b.passes} times · the fuse is secret!</p>
        </div>
        <div className="flex flex-col gap-[2vh]">
          {b.stage === 'passing' ? (
            <motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="tv-text-xl text-center font-display font-bold text-lime">
              Correct! {holder?.name} is choosing who gets the bomb…
            </motion.p>
          ) : b.stage === 'feedback' ? (
            <motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="tv-text-xl text-center font-display font-bold text-tomato">
              Wrong! Another question, quick!
            </motion.p>
          ) : (
            <>
              <Prompt text={q.prompt} />
              <OptionsGrid options={q.options} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BingoStage({ pub }: { pub: PublicState }) {
  const q = pub.question!;
  const bg = q.bingo!;
  const remaining = useHostRemaining(pub, q.deadline);
  const lineWinner = playerById(pub, bg.lineWinner);
  return (
    <div className="flex h-full flex-col gap-[2vh]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-[1.5vw]">
          <Equaliser className="h-[clamp(40px,8vh,140px)] w-[clamp(70px,10vw,200px)]" playing={bg.playing && !pub.paused} bars={7} />
          <div>
            <p className="tv-text-xl font-display font-bold text-cream">
              {bg.clipNumber === 0 ? 'Get ready…' : `Song ${bg.clipNumber} of ${bg.totalClips}`}
            </p>
            <p className="tv-text-md font-display text-cream/70">
              {q.audio === 'loading' || q.audio === 'failed'
                ? 'Get ready… the next song is starting'
                : bg.playing
                  ? 'Is it on your card? Tap it!'
                  : bg.clipNumber > 0
                    ? 'Next song coming up…'
                    : 'Check your card!'}
            </p>
          </div>
        </div>
        {q.deadline ? <TimerRing remainingMs={remaining} totalMs={q.durationMs} size="clamp(64px,8vw,170px)" /> : null}
      </div>
      {lineWinner && (
        <motion.p
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="chunky-sm mx-auto px-6 py-1 font-display text-[clamp(1rem,2vw,2.6rem)] font-bold"
          style={{ background: COLOUR_HEX[lineWinner.colour] }}
        >
          {lineWinner.name} got the first line!
        </motion.p>
      )}
      <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-[1.2vw] lg:grid-cols-4">
        {pub.players.map((p) => {
          const marks = bg.marks[p.id] ?? [];
          const lines = BINGO_LINES.filter((l) => l.every((c) => marks.includes(c))).length;
          return (
            <div key={p.id} className="chunky flex items-center gap-[1vw] p-[1vw]" style={{ background: COLOUR_HEX[p.colour] }}>
              <div className="flex flex-col items-center">
                <Avatar id={p.avatar} colour={p.colour} size="clamp(40px,5vw,110px)" mood={lines > 0 ? 'happy' : 'idle'} />
                <span className="max-w-[8vw] truncate font-display text-[clamp(0.8rem,1.3vw,1.7rem)] font-bold">{p.name}</span>
              </div>
              <div className="grid flex-1 grid-cols-3 gap-[0.3vw]">
                {Array.from({ length: 9 }, (_, c) => (
                  <motion.span
                    key={c}
                    animate={{ scale: marks.includes(c) ? [1.3, 1] : 1 }}
                    className={`aspect-square rounded-md border-2 border-ink ${marks.includes(c) ? 'bg-ink' : 'bg-cream/80'}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function QuestionStage({ pub }: { pub: PublicState }) {
  const q = pub.question;
  if (!q) return null;
  switch (q.kind) {
    case 'multipleChoice':
    case 'fastestFinger':
    case 'introSprint':
    case 'whoSings':
    case 'decadeDash':
      return <AnswerStage pub={pub} />;
    case 'nameThatTune':
    case 'stealPoints':
      return <BuzzStage pub={pub} />;
    case 'passTheBomb':
      return <BombStage pub={pub} />;
    case 'musicBingo':
      return <BingoStage pub={pub} />;
  }
}

export function RevealStage({ pub }: { pub: PublicState }) {
  const q = pub.question;
  const r = pub.reveal;
  if (!r) return null;
  const isBomb = q?.kind === 'passTheBomb';
  const isBingo = q?.kind === 'musicBingo';
  const results = r.results
    .map((x) => ({ ...x, p: playerById(pub, x.playerId) }))
    .filter((x) => x.p && (x.delta !== 0 || x.correct !== null));

  return (
    <div className="flex h-full flex-col items-center gap-[2vh]">
      <motion.h2
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14 }}
        className="tv-text-xl text-center font-display font-bold text-sunflower"
      >
        {r.headline}
      </motion.h2>

      {isBomb && (r.headline.startsWith('BOOM') ? <Explosion size="clamp(140px,22vw,440px)" /> : <Bomb size="clamp(120px,18vw,360px)" shake={false} lit={false} />)}

      {q && !isBomb && !isBingo && (
        <>
          {q.prompt && <p className="tv-text-md text-center font-display text-cream/80">{q.prompt}</p>}
          <div className="w-full">
            <OptionsGrid options={q.options} correctId={r.correctOptionId} dimWrong />
          </div>
        </>
      )}

      {(r.trackTitle || r.explanation) && !isBingo && (
        <div className="chunky-sm max-w-[70vw] bg-cream px-[2vw] py-[1vh] text-center">
          {r.explanation && <p className="tv-text-md font-display">{r.explanation}</p>}
        </div>
      )}

      {isBingo && r.playedTracks && (
        <div className="grid w-full grid-cols-2 gap-[0.6vw] lg:grid-cols-3">
          {r.playedTracks.map((t, i) => (
            <div key={i} className="chunky-sm flex items-baseline gap-2 bg-cream px-3 py-1">
              <span className="font-display font-bold">{i + 1}.</span>
              <span className="truncate font-display text-[clamp(0.8rem,1.3vw,1.6rem)] font-semibold">{t.title}</span>
              <span className="truncate text-[clamp(0.7rem,1vw,1.2rem)] text-ink/60">{t.artist}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-wrap justify-center gap-[1vw]">
        {results.map(({ p, delta, correct }, i) => (
          <motion.div
            key={p!.id}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.08 }}
            className="chunky-sm flex items-center gap-2 px-3 py-1"
            style={{ background: COLOUR_HEX[p!.colour] }}
          >
            <Avatar id={p!.avatar} colour={p!.colour} size="clamp(32px,3.6vw,72px)" mood={delta > 0 || correct ? 'happy' : 'sad'} />
            <span className="font-display text-[clamp(0.9rem,1.5vw,2rem)] font-bold">{p!.name}</span>
            <span className={`font-display text-[clamp(1rem,1.8vw,2.4rem)] font-bold ${delta >= 0 ? '' : 'text-cream'}`}>
              {delta > 0 ? `+${delta}` : delta < 0 ? delta : '0'}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
