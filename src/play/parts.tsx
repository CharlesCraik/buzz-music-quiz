import { motion } from 'framer-motion';
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { BingoCell } from '../game/state';
import type { PublicPlayer } from '../game/view';
import { Avatar } from '../ui/Avatar';
import { useRemaining, vibrate } from '../ui/hooks';
import { ANSWER_STYLES, COLOUR_HEX, COLOUR_SHAPE } from '../ui/tokens';

/** Thin countdown bar across the top of the phone. */
export function TimeBar({ deadline, total, offset, paused }: { deadline: number | null; total: number; offset: number; paused: boolean }) {
  const remaining = useRemaining(deadline, offset, paused);
  if (!deadline || total <= 0) return null;
  const frac = Math.max(0, Math.min(1, remaining / total));
  const colour = frac > 0.5 ? '#8bd346' : frac > 0.25 ? '#ffd23f' : '#ff5a4e';
  return (
    <div className="chunky-sm h-5 w-full overflow-hidden bg-paper" role="timer" aria-label={`${Math.ceil(remaining / 1000)} seconds left`}>
      <div className="h-full transition-[width] duration-200 ease-linear" style={{ width: `${frac * 100}%`, background: colour }} />
    </div>
  );
}

/** Big pressable that fires on pointerdown for instant feel. */
function Pad({
  onPress,
  disabled,
  className = '',
  style,
  children,
  label,
}: {
  onPress: () => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  label: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      data-pressed={pressed}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        setPressed(true);
        vibrate(15);
        onPress();
      }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onPress();
        }
      }}
      className={`chunky press select-none ${className}`}
      style={style}
    >
      {children}
    </button>
  );
}

export function AnswerPad({
  options,
  onPick,
  picked,
  disabled,
}: {
  options: { id: string; text: string }[];
  onPick: (id: string) => void;
  picked?: string | null;
  disabled?: boolean;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3 landscape:grid-cols-4 landscape:grid-rows-1">
      {options.map((o, i) => {
        const st = ANSWER_STYLES[i];
        const isPicked = picked === o.id;
        return (
          <Pad
            key={o.id}
            label={`${st.letter}: ${o.text}`}
            disabled={disabled || !!picked}
            onPress={() => onPick(o.id)}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 overflow-hidden p-2 ${picked && !isPicked ? 'opacity-30' : ''}`}
            style={{ background: st.bg, color: st.fg }}
          >
            <span className="flex items-center gap-2 font-display text-[clamp(2rem,10vw,3.5rem)] leading-none font-bold">
              {st.letter}
              <span aria-hidden className="text-[0.6em] opacity-60">
                {st.shape}
              </span>
            </span>
            <span className="line-clamp-3 text-center font-display text-[clamp(0.9rem,4.2vw,1.35rem)] leading-tight font-semibold break-words">
              {o.text}
            </span>
          </Pad>
        );
      })}
    </div>
  );
}

export function Buzzer({ onBuzz, disabled, colour }: { onBuzz: () => void; disabled?: boolean; colour: string }) {
  return (
    <div className="relative grid flex-1 place-items-center">
      {!disabled && (
        <span
          className="animate-pulse-ring absolute aspect-square rounded-full border-[6px]"
          style={{ width: 'min(78vw, 52dvh)', borderColor: colour }}
          aria-hidden
        />
      )}
      <Pad
        label="Buzz"
        onPress={onBuzz}
        disabled={disabled}
        className={`relative grid aspect-square place-items-center rounded-full! ${disabled ? 'opacity-40' : ''}`}
        style={{
          width: 'min(78vw, 52dvh)',
          background: `radial-gradient(circle at 50% 38%, #ffffff55 0 18%, transparent 19%), ${colour}`,
          boxShadow: '0 10px 0 0 #1b1f3b',
        }}
      >
        <span className="font-display text-[clamp(2.5rem,14vw,5rem)] font-bold text-ink">BUZZ!</span>
      </Pad>
    </div>
  );
}

export function TargetPicker({
  title,
  players,
  onPick,
}: {
  title: string;
  players: PublicPlayer[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <h2 className="text-center font-display text-3xl font-bold">{title}</h2>
      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-3 overflow-y-auto">
        {players.map((p) => (
          <Pad
            key={p.id}
            label={p.name}
            onPress={() => onPick(p.id)}
            className="flex min-h-20 flex-col items-center justify-center gap-1 p-2"
            style={{ background: COLOUR_HEX[p.colour] }}
          >
            <Avatar id={p.avatar} colour={p.colour} size={56} mood="wow" />
            <span className="max-w-full truncate font-display text-lg font-bold">
              {COLOUR_SHAPE[p.colour]} {p.name}
            </span>
            <span className="font-display text-sm font-semibold">{p.score} pts</span>
          </Pad>
        ))}
      </div>
    </div>
  );
}

export function BingoCard({
  cells,
  marks,
  misses,
  onTick,
}: {
  cells: BingoCell[];
  marks: number[];
  misses: number[];
  onTick: (i: number) => void;
}) {
  return (
    <div className="mx-auto grid aspect-square max-h-full w-full max-w-[min(100%,62dvh)] grid-cols-3 grid-rows-3 gap-2">
      {cells.map((c, i) => {
        const marked = marks.includes(i);
        const missed = misses.includes(i);
        return (
          <motion.button
            key={c.trackId}
            type="button"
            aria-pressed={marked}
            aria-label={`${c.title} by ${c.artist}`}
            disabled={marked}
            animate={missed ? { x: [0, -6, 6, -4, 4, 0] } : { scale: marked ? [1.15, 1] : 1 }}
            transition={{ duration: 0.35 }}
            onPointerDown={(e) => {
              e.preventDefault();
              if (marked) return;
              vibrate(15);
              onTick(i);
            }}
            className={`chunky-sm relative flex flex-col items-center justify-center overflow-hidden p-1 text-center ${
              marked ? 'bg-ink text-cream' : missed ? 'bg-tomato/30' : 'bg-paper'
            }`}
          >
            <span className="line-clamp-3 font-display text-[clamp(0.7rem,3.3vw,1.05rem)] leading-tight font-bold break-words">
              {c.title}
            </span>
            <span className="line-clamp-1 text-[clamp(0.55rem,2.4vw,0.8rem)] opacity-70">{c.artist}</span>
            {marked && (
              <span className="absolute inset-0 grid place-items-center" aria-hidden>
                <span className="h-[70%] w-[70%] rounded-full border-4 border-sunflower opacity-80" />
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

export function Center({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">{children}</div>;
}
