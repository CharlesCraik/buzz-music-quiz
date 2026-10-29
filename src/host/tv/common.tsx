import { AnimatePresence, motion } from 'framer-motion';
import type { PublicPlayer, PublicState } from '../../game/view';
import { Avatar, type Mood } from '../../ui/Avatar';
import { useRollingNumber } from '../../ui/hooks';
import { ANSWER_STYLES, COLOUR_HEX, COLOUR_SHAPE } from '../../ui/tokens';

export function playerById(pub: PublicState, id: string | null | undefined): PublicPlayer | undefined {
  return id ? pub.players.find((p) => p.id === id) : undefined;
}

export function Score({ value, className = '' }: { value: number; className?: string }) {
  const v = useRollingNumber(value);
  return <span className={`tabular-nums ${className}`}>{v}</span>;
}

/** Bottom strip on the TV: every player, their score and live status. */
export function ScoreStrip({
  pub,
  badge,
  mood,
}: {
  pub: PublicState;
  badge?: (p: PublicPlayer) => string | null;
  mood?: (p: PublicPlayer) => Mood;
}) {
  const n = pub.players.length;
  return (
    <div
      className="grid w-full gap-[clamp(6px,0.8vw,16px)]"
      style={{ gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(0, 1fr))` }}
    >
      {pub.players.map((p) => {
        const b = badge?.(p);
        return (
          <motion.div
            key={p.id}
            layout
            className={`chunky-sm relative flex min-w-0 items-center gap-[0.5vw] px-[0.6vw] py-[0.4vw] ${p.connected ? '' : 'opacity-40'}`}
            style={{ background: COLOUR_HEX[p.colour] }}
          >
            <Avatar id={p.avatar} colour={p.colour} mood={mood?.(p) ?? 'idle'} size="clamp(28px, 3.6vw, 72px)" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[clamp(0.75rem,1.15vw,1.5rem)] leading-tight font-semibold">
                <span aria-hidden className="mr-1 opacity-60">
                  {COLOUR_SHAPE[p.colour]}
                </span>
                {p.name}
              </div>
              <Score value={p.score} className="font-display text-[clamp(1rem,2vw,2.75rem)] leading-none font-bold" />
            </div>
            {p.streak >= 3 && (
              <span className="absolute -top-3 -left-2 rounded-full border-2 border-ink bg-tangerine px-1.5 font-display text-[clamp(0.6rem,0.9vw,1rem)] font-bold">
                {p.streak} in a row!
              </span>
            )}
            <AnimatePresence>
              {b && (
                <motion.span
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  className="absolute -top-3 -right-2 rounded-full border-2 border-ink bg-cream px-2 font-display text-[clamp(0.6rem,1vw,1.1rem)] font-bold"
                >
                  {b}
                </motion.span>
              )}
            </AnimatePresence>
            {!p.connected && (
              <span className="absolute inset-x-0 -bottom-3 mx-auto w-fit rounded-full bg-ink px-2 text-[clamp(0.55rem,0.8vw,0.9rem)] text-cream">
                reconnecting…
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/** 2x2 answer grid for the TV. */
export function OptionsGrid({
  options,
  correctId,
  dimWrong,
  pickedBy,
}: {
  options: { id: string; text: string }[];
  correctId?: string | null;
  dimWrong?: boolean;
  pickedBy?: Record<string, PublicPlayer[]>;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-[clamp(8px,1.4vw,28px)]">
      {options.map((o, i) => {
        const st = ANSWER_STYLES[i];
        const isCorrect = correctId === o.id;
        const faded = dimWrong && correctId && !isCorrect;
        return (
          <motion.div
            key={o.id}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: faded ? 0.3 : 1, scale: isCorrect ? 1.04 : 1 }}
            transition={{ delay: i * 0.08, type: 'spring', stiffness: 260, damping: 20 }}
            className="chunky relative flex min-h-[clamp(56px,9vh,140px)] items-center gap-[1vw] px-[1.2vw] py-[0.8vw]"
            style={{ background: st.bg, color: st.fg }}
          >
            <span className="grid aspect-square w-[clamp(36px,4vw,80px)] shrink-0 place-items-center rounded-full border-[3px] border-ink bg-cream font-display text-[clamp(1rem,2vw,2.5rem)] font-bold">
              {st.letter}
            </span>
            <span className="tv-text-lg font-display font-semibold">{o.text}</span>
            <span aria-hidden className="ml-auto text-[clamp(1rem,2vw,2.5rem)] opacity-50">
              {st.shape}
            </span>
            {isCorrect && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-4 -right-3 rounded-full border-[3px] border-ink bg-lime px-3 font-display text-[clamp(0.8rem,1.4vw,1.6rem)] font-bold"
              >
                ✓ Correct
              </motion.span>
            )}
            {pickedBy?.[o.id]?.length ? (
              <div className="absolute -bottom-4 left-4 flex -space-x-2">
                {pickedBy[o.id].map((p) => (
                  <Avatar key={p.id} id={p.avatar} colour={p.colour} size="clamp(24px,2.6vw,52px)" mood={isCorrect ? 'happy' : 'sad'} />
                ))}
              </div>
            ) : null}
          </motion.div>
        );
      })}
    </div>
  );
}

/** Ranked leaderboard with animated bars. */
export function Leaderboard({ pub, deltas }: { pub: PublicState; deltas?: Record<string, number> | null }) {
  const max = Math.max(1, ...pub.standings.map((s) => s.score));
  return (
    <ol className="flex w-full flex-col gap-[clamp(6px,1vh,16px)]">
      {pub.standings.map((s, i) => {
        const p = playerById(pub, s.playerId);
        if (!p) return null;
        const d = deltas?.[p.id] ?? 0;
        return (
          <motion.li
            key={p.id}
            layout
            initial={{ x: -60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: i * 0.08, type: 'spring', stiffness: 200, damping: 22 }}
            className="flex items-center gap-[1vw]"
          >
            <span className="w-[3ch] text-right font-display text-[clamp(1.2rem,2.4vw,3rem)] font-bold text-cream">{s.rank}</span>
            <Avatar id={p.avatar} colour={p.colour} size="clamp(36px,4.5vw,90px)" mood={s.rank === 1 ? 'happy' : 'idle'} />
            <div className="relative h-[clamp(36px,5.5vh,80px)] flex-1">
              <motion.div
                className="chunky-sm absolute inset-y-0 left-0 flex items-center px-[1vw]"
                style={{ background: COLOUR_HEX[p.colour] }}
                initial={{ width: '12%' }}
                animate={{ width: `${Math.max(18, (s.score / max) * 100)}%` }}
                transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 + i * 0.05 }}
              >
                <span className="truncate font-display text-[clamp(1rem,1.8vw,2.25rem)] font-semibold">{p.name}</span>
              </motion.div>
            </div>
            <div className="w-[8ch] text-right font-display text-cream">
              <Score value={s.score} className="block text-[clamp(1.2rem,2.4vw,3rem)] leading-none font-bold" />
              {d !== 0 && (
                <span className={`text-[clamp(0.8rem,1.2vw,1.5rem)] font-semibold ${d > 0 ? 'text-lime' : 'text-tomato'}`}>
                  {d > 0 ? '+' : ''}
                  {d}
                </span>
              )}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
