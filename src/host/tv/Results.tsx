import { motion } from 'framer-motion';
import type { PublicState } from '../../game/view';
import { Avatar } from '../../ui/Avatar';
import { Confetti } from '../../ui/decor';
import { COLOUR_HEX } from '../../ui/tokens';
import { Leaderboard, Score, playerById } from './common';

const ROUND_COLOURS = ['#ff5a4e', '#3fa7ff', '#8bd346', '#ffd23f', '#8f5bff', '#ff6fb5'];

export function RoundIntro({ pub }: { pub: PublicState }) {
  const r = pub.round;
  if (!r) return null;
  const colour = ROUND_COLOURS[r.index % ROUND_COLOURS.length];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3vh] text-center">
      <motion.p
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="tv-text-lg font-display font-semibold tracking-widest text-cream/70 uppercase"
      >
        Round {r.index + 1} of {r.total}
      </motion.p>
      <motion.div
        initial={{ scale: 3, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: -2, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 12 }}
        className="chunky px-[4vw] py-[2vh]"
        style={{ background: colour }}
      >
        <h1 className="font-display text-[clamp(2.5rem,8vw,10rem)] leading-none font-bold">{r.title}</h1>
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="tv-text-lg font-display font-semibold text-sunflower"
      >
        {r.tagline}
      </motion.p>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        className="tv-text-md max-w-[60vw] text-balance text-cream/80"
      >
        {r.rules}
      </motion.p>
    </div>
  );
}

export function RoundResults({ pub }: { pub: PublicState }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[90vw] flex-col gap-[3vh]">
      <h2 className="tv-text-xl text-center font-display font-bold text-cream">
        {pub.round ? `End of ${pub.round.title}` : 'Scores'}
      </h2>
      <Leaderboard pub={pub} deltas={pub.roundDeltas} />
    </div>
  );
}

export function GameResults({ pub, reduced }: { pub: PublicState; reduced: boolean }) {
  const top = pub.standings.slice(0, 3);
  const order = [1, 0, 2].filter((i) => top[i]);
  const heights = ['h-[26vh]', 'h-[18vh]', 'h-[12vh]'];
  const winners = pub.standings.filter((s) => s.rank === 1).map((s) => playerById(pub, s.playerId)?.name);
  return (
    <div className="relative flex h-full flex-col items-center gap-[2vh]">
      <Confetti reduced={reduced} />
      <motion.h1
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 10 }}
        className="text-center font-display text-[clamp(2rem,6vw,8rem)] leading-none font-bold text-sunflower"
      >
        {winners.length > 1 ? "It's a tie!" : `${winners[0] ?? 'Nobody'} wins!`}
      </motion.h1>
      <div className="flex flex-1 items-end justify-center gap-[2vw]">
        {order.map((i) => {
          const s = top[i];
          const p = playerById(pub, s.playerId)!;
          return (
            <motion.div
              key={p.id}
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 + (2 - i) * 0.35, type: 'spring', stiffness: 160, damping: 16 }}
              className="flex w-[clamp(110px,18vw,360px)] flex-col items-center"
            >
              <div className={i === 0 ? 'animate-bob' : ''}>
                <Avatar id={p.avatar} colour={p.colour} mood="happy" size={i === 0 ? 'clamp(80px,12vw,260px)' : 'clamp(64px,9vw,190px)'} />
              </div>
              <p className="w-full truncate text-center font-display text-[clamp(1rem,2vw,2.6rem)] font-bold text-cream">{p.name}</p>
              <Score value={s.score} className="font-display text-[clamp(1rem,2vw,2.6rem)] font-bold text-sunflower" />
              <div
                className={`chunky mt-2 flex w-full items-start justify-center pt-2 ${heights[i]}`}
                style={{ background: COLOUR_HEX[p.colour] }}
              >
                <span className="font-display text-[clamp(2rem,5vw,6rem)] leading-none font-bold">{s.rank}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
      {pub.standings.length > 3 && (
        <div className="flex flex-wrap justify-center gap-[1vw]">
          {pub.standings.slice(3).map((s) => {
            const p = playerById(pub, s.playerId)!;
            return (
              <span key={p.id} className="chunky-sm flex items-center gap-2 px-3 py-1" style={{ background: COLOUR_HEX[p.colour] }}>
                <span className="font-display font-bold">{s.rank}.</span>
                <span className="font-display font-semibold">{p.name}</span>
                <span className="font-display font-bold">{s.score}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
