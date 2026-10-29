import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { PublicPlayer, PublicState } from '../../game/view';
import { Avatar } from '../../ui/Avatar';
import { Equaliser, TimerRing } from '../../ui/decor';
import { useRemaining } from '../../ui/hooks';
import { COLOUR_HEX, INK } from '../../ui/tokens';
import { OptionsGrid, playerById } from './common';

function Chair({ size = 'clamp(80px,11vw,200px)' }: { size?: string }) {
  return (
    <svg viewBox="0 0 100 120" width={size} height={size} aria-hidden>
      <rect x="18" y="8" width="64" height="52" rx="10" fill="#ff9f1c" stroke={INK} strokeWidth="5" />
      <rect x="10" y="58" width="80" height="18" rx="6" fill="#ffd23f" stroke={INK} strokeWidth="5" />
      <path d="M20 76 L16 114 M80 76 L84 114 M34 76 L34 106 M66 76 L66 106" stroke={INK} strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

function BigText({ children, tone = 'text-cream' }: { children: ReactNode; tone?: string }) {
  return (
    <motion.p
      key={String(children)}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 14 }}
      className={`text-center font-display text-[clamp(2rem,6vw,7rem)] leading-none font-bold ${tone}`}
    >
      {children}
    </motion.p>
  );
}

export function ChairsStage({ pub }: { pub: PublicState }) {
  const q = pub.question!;
  const c = q.chairs!;
  const remaining = useRemaining(q.deadline, 0, pub.paused);
  const alive = c.alive.map((id) => playerById(pub, id)).filter((p): p is PublicPlayer => !!p);
  const out = c.out.map((o) => ({ ...o, p: playerById(pub, o.playerId) })).filter((o) => o.p);
  const reduced = pub.settings.reducedMotion;
  const outNames = c.lastOut.map((id) => playerById(pub, id)?.name).filter(Boolean);

  return (
    <div className="flex h-full flex-col items-center gap-[2vh]">
      <div className="flex w-full items-center justify-between">
        <span className="chunky-sm bg-cream px-[1vw] font-display text-[clamp(0.9rem,1.4vw,1.8rem)] font-semibold">
          Song {c.lap} · {alive.length} left · {c.chairs} chair{c.chairs === 1 ? '' : 's'}
        </span>
        {c.stage === 'sit' && q.deadline ? <TimerRing remainingMs={remaining} totalMs={q.durationMs} size="clamp(64px,8vw,170px)" /> : null}
        {c.stage === 'dancing' && <Equaliser className="h-[clamp(40px,8vh,140px)] w-[clamp(80px,12vw,240px)]" playing={!pub.paused} bars={7} />}
      </div>

      {c.stage === 'loading' && <BigText>Get ready to dance…</BigText>}
      {c.stage === 'dancing' && <BigText tone="text-lime">Keep dancing… don't sit yet!</BigText>}
      {c.stage === 'sit' && (
        <motion.div animate={reduced ? {} : { scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 0.5 }}>
          <BigText tone="text-tomato">SIT DOWN NOW!</BigText>
        </motion.div>
      )}
      {c.stage === 'result' && (
        <BigText tone="text-sunflower">
          {outNames.length
            ? `${outNames.join(' & ')} ${outNames.length > 1 ? 'are' : 'is'} out!`
            : c.seated.length === 0
              ? 'Nobody sat down! Again…'
              : 'Everyone found a chair!'}
        </BigText>
      )}

      {/* Chairs, with seated players on them in order */}
      <div className="flex flex-wrap items-end justify-center gap-[2vw]">
        {Array.from({ length: c.chairs }, (_, i) => {
          const sitter = playerById(pub, c.seated[i]);
          return (
            <div key={i} className="relative flex flex-col items-center">
              <AnimatePresence>
                {sitter && (
                  <motion.div initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute -top-[55%] z-10">
                    <Avatar id={sitter.avatar} colour={sitter.colour} mood="happy" size="clamp(44px,6vw,120px)" />
                  </motion.div>
                )}
              </AnimatePresence>
              <Chair />
            </div>
          );
        })}
      </div>

      {/* Players still in, dancing */}
      <div className="flex flex-wrap justify-center gap-[1.5vw]">
        {alive
          .filter((p) => !c.seated.includes(p.id))
          .map((p, i) => (
            <div
              key={p.id}
              className={c.stage === 'dancing' && !reduced ? 'animate-wiggle' : ''}
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              <div className="flex flex-col items-center">
                <Avatar id={p.avatar} colour={p.colour} size="clamp(48px,6.5vw,130px)" mood={c.stage === 'sit' ? 'wow' : 'happy'} />
                <span className="chunky-sm mt-1 px-2 font-display text-[clamp(0.8rem,1.2vw,1.5rem)] font-bold" style={{ background: COLOUR_HEX[p.colour] }}>
                  {p.name}
                </span>
              </div>
            </div>
          ))}
      </div>

      {out.length > 0 && (
        <div className="mt-auto flex flex-wrap items-center justify-center gap-[1vw] opacity-60">
          <span className="font-display text-[clamp(0.8rem,1.2vw,1.5rem)] text-cream">Out:</span>
          {out.map(({ p, reason }) => (
            <span key={p!.id} className="flex items-center gap-1 rounded-full bg-ink-3 px-2 py-0.5 font-display text-[clamp(0.7rem,1vw,1.3rem)] text-cream">
              <Avatar id={p!.avatar} colour={p!.colour} mood="sad" size="clamp(20px,2vw,40px)" />
              {p!.name} {reason === 'early' ? '(too early!)' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function MashStage({ pub }: { pub: PublicState }) {
  const q = pub.question!;
  const m = q.mash!;
  const remaining = useRemaining(q.deadline, 0, pub.paused);
  const max = Math.max(20, ...Object.values(m.counts));
  const rows = [...pub.players].sort((a, b) => (m.counts[b.id] ?? 0) - (m.counts[a.id] ?? 0));
  return (
    <div className="flex h-full flex-col gap-[2vh]">
      <div className="flex items-center justify-between">
        <span className="chunky-sm bg-cream px-[1vw] font-display text-[clamp(0.9rem,1.4vw,1.8rem)] font-semibold">
          Song {q.number} of {q.total}
        </span>
        {m.stage === 'mashing' && q.deadline ? <TimerRing remainingMs={remaining} totalMs={q.durationMs} size="clamp(64px,8vw,170px)" /> : null}
      </div>
      {m.stage === 'loading' ? (
        <BigText>Fingers ready… wait for the music!</BigText>
      ) : (
        <motion.div animate={pub.settings.reducedMotion ? {} : { rotate: [-2, 2, -2] }} transition={{ repeat: Infinity, duration: 0.3 }}>
          <BigText tone="text-sunflower">MASH! MASH! MASH!</BigText>
        </motion.div>
      )}
      <div className="flex flex-1 flex-col justify-center gap-[1.2vh]">
        {rows.map((p) => {
          const n = m.counts[p.id] ?? 0;
          return (
            <div key={p.id} className="flex items-center gap-[1vw]">
              <Avatar id={p.avatar} colour={p.colour} size="clamp(36px,4.5vw,90px)" mood={n > 0 ? 'wow' : 'idle'} />
              <div className="relative h-[clamp(32px,5vh,72px)] flex-1">
                <motion.div
                  className="chunky-sm absolute inset-y-0 left-0 flex items-center px-[1vw]"
                  style={{ background: COLOUR_HEX[p.colour] }}
                  animate={{ width: `${Math.max(12, (n / max) * 100)}%` }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                >
                  <span className="truncate font-display text-[clamp(0.9rem,1.6vw,2rem)] font-bold">{p.name}</span>
                </motion.div>
              </div>
              <span className="w-[5ch] text-right font-display text-[clamp(1.2rem,2.4vw,3rem)] font-bold text-cream tabular-nums">{n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Hearts({ lives }: { lives: number }) {
  return (
    <span className="font-display text-[clamp(0.9rem,1.5vw,1.9rem)] leading-none" aria-label={`${lives} lives`}>
      {Array.from({ length: 2 }, (_, i) => (
        <span key={i} className={i < lives ? 'text-tomato' : 'text-ink/30'}>
          ♥
        </span>
      ))}
    </span>
  );
}

export function SurvivalStage({ pub }: { pub: PublicState }) {
  const q = pub.question!;
  const sv = q.survival!;
  const remaining = useRemaining(q.deadline, 0, pub.paused);
  const players = pub.players.filter((p) => p.id in sv.lives);
  return (
    <div className="flex h-full flex-col gap-[2vh]">
      <div className="flex items-center justify-between">
        <span className="chunky-sm bg-cream px-[1vw] font-display text-[clamp(0.9rem,1.4vw,1.8rem)] font-semibold">
          Question {sv.subNumber} · {Object.values(sv.lives).filter((l) => l > 0).length} still standing
        </span>
        {sv.stage === 'answering' && q.deadline ? <TimerRing remainingMs={remaining} totalMs={q.durationMs} size="clamp(64px,8vw,170px)" /> : null}
      </div>
      <h2 className="tv-text-xl text-center font-display font-bold text-balance text-cream">{q.prompt}</h2>
      <OptionsGrid options={q.options} correctId={sv.correctOptionId} dimWrong={sv.stage === 'result'} />
      {sv.lastNote && <p className="tv-text-md text-center font-display font-semibold text-sunflower">{sv.lastNote}</p>}
      <div className="mt-auto flex flex-wrap justify-center gap-[1vw]">
        {players.map((p) => {
          const lives = sv.lives[p.id] ?? 0;
          const res = sv.lastResult?.[p.id];
          const answered = q.answered.includes(p.id);
          return (
            <motion.div
              key={p.id}
              animate={res === false && sv.stage === 'result' && !pub.settings.reducedMotion ? { x: [0, -8, 8, -6, 6, 0] } : {}}
              className={`chunky-sm flex items-center gap-2 px-2 py-1 ${lives === 0 ? 'opacity-35 grayscale' : ''}`}
              style={{ background: COLOUR_HEX[p.colour] }}
            >
              <Avatar id={p.avatar} colour={p.colour} size="clamp(30px,3.4vw,70px)" mood={lives === 0 ? 'sad' : res === true ? 'happy' : res === false ? 'sad' : 'idle'} />
              <div className="flex flex-col">
                <span className="font-display text-[clamp(0.8rem,1.3vw,1.7rem)] leading-tight font-bold">{p.name}</span>
                <Hearts lives={lives} />
              </div>
              {sv.stage === 'answering' && answered && <span className="font-display font-bold">✓</span>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
