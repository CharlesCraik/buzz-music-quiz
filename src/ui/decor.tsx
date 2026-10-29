import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { COLOUR_HEX, INK } from './tokens';

const PALETTE = Object.values(COLOUR_HEX);

export function Logo({ size = 'md', light = true }: { size?: 'sm' | 'md' | 'lg'; light?: boolean }) {
  const text = size === 'lg' ? 'text-6xl sm:text-7xl md:text-8xl' : size === 'md' ? 'text-4xl sm:text-5xl' : 'text-2xl';
  return (
    <div className={`flex items-center gap-3 font-display font-bold ${text}`}>
      <svg viewBox="0 0 64 64" className="h-[1.1em] w-[1.1em] shrink-0" aria-hidden>
        <circle cx="32" cy="36" r="26" fill="#ff5a4e" stroke={INK} strokeWidth="4" />
        <ellipse cx="32" cy="30" rx="18" ry="12" fill="#ffd23f" stroke={INK} strokeWidth="4" />
        <ellipse cx="27" cy="26" rx="6" ry="3" fill="#fff" opacity="0.7" />
      </svg>
      <span className={light ? 'text-cream' : 'text-ink'}>
        Buzzer<span className="text-sunflower [-webkit-text-stroke:2px_#1b1f3b]">Beat</span>
      </span>
    </div>
  );
}

export function Equaliser({ bars = 5, playing = true, className = '' }: { bars?: number; playing?: boolean; className?: string }) {
  return (
    <div className={`flex items-end gap-[6%] ${className}`} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={`block h-full flex-1 origin-bottom rounded-t-md border-2 border-ink ${playing ? 'animate-eq' : ''}`}
          style={{
            background: PALETTE[i % PALETTE.length],
            animationDelay: `${(i * 137) % 600}ms`,
            transform: playing ? undefined : 'scaleY(0.25)',
          }}
        />
      ))}
    </div>
  );
}

export function Confetti({ count = 60, reduced = false }: { count?: number; reduced?: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        dur: 2.4 + Math.random() * 2,
        rot: Math.random() * 720 - 360,
        size: 8 + Math.random() * 12,
        colour: PALETTE[i % PALETTE.length],
        shape: i % 3,
      })),
    [count],
  );
  if (reduced) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0 block border-2 border-ink"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.shape === 2 ? p.size * 0.5 : p.size,
            background: p.colour,
            borderRadius: p.shape === 0 ? '50%' : 3,
          }}
          initial={{ y: -40, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', rotate: p.rot, opacity: [1, 1, 0.8] }}
          transition={{ duration: p.dur, delay: p.delay, ease: 'easeIn', repeat: Infinity, repeatDelay: 0.5 }}
        />
      ))}
    </div>
  );
}

export function Bomb({ size = 160, shake = true, lit = true }: { size?: number | string; shake?: boolean; lit?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={shake ? 'animate-wiggle' : ''} aria-label="bomb" role="img">
      <path d="M78 30 Q92 14 104 18" fill="none" stroke="#a0673a" strokeWidth="6" strokeLinecap="round" />
      {lit && (
        <g>
          <circle cx="106" cy="16" r="10" fill="#ffd23f" stroke={INK} strokeWidth="3" />
          <circle cx="106" cy="16" r="5" fill="#ff5a4e" />
        </g>
      )}
      <rect x="62" y="26" width="22" height="16" rx="4" transform="rotate(35 73 34)" fill="#4a5088" stroke={INK} strokeWidth="4" />
      <circle cx="54" cy="70" r="40" fill="#343a6b" stroke={INK} strokeWidth="5" />
      <ellipse cx="38" cy="54" rx="10" ry="6" fill="#fff" opacity="0.35" transform="rotate(-30 38 54)" />
      <circle cx="42" cy="72" r="5" fill="#fff6e9" />
      <circle cx="66" cy="72" r="5" fill="#fff6e9" />
      <path d="M44 88 Q54 80 64 88" fill="none" stroke="#fff6e9" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Explosion({ size = 260 }: { size?: number | string }) {
  const pts = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? 58 : 34;
    return `${60 + Math.cos(a) * r},${60 + Math.sin(a) * r}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
      <polygon points={pts} fill="#ffd23f" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      <polygon points={pts} transform="translate(60 60) scale(0.6) translate(-60 -60)" fill="#ff5a4e" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      <text x="60" y="68" textAnchor="middle" fontFamily="Fredoka" fontWeight="700" fontSize="22" fill={INK}>
        BOOM
      </text>
    </svg>
  );
}

/** Circular countdown ring. */
export function TimerRing({
  remainingMs,
  totalMs,
  size = 120,
  dark = true,
}: {
  remainingMs: number;
  totalMs: number;
  size?: number | string;
  dark?: boolean;
}) {
  const frac = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const secs = Math.ceil(remainingMs / 1000);
  const r = 44;
  const circ = 2 * Math.PI * r;
  const colour = frac > 0.5 ? '#8bd346' : frac > 0.25 ? '#ffd23f' : '#ff5a4e';
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="timer" aria-label={`${secs} seconds left`}>
      <circle cx="50" cy="50" r={r} fill={dark ? '#262b52' : '#fff'} stroke={INK} strokeWidth="5" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={colour}
        strokeWidth="9"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - frac)}
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dashoffset 250ms linear, stroke 300ms' }}
      />
      <text
        x="50"
        y="51"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Fredoka"
        fontWeight="700"
        fontSize="34"
        fill={dark ? '#fff6e9' : INK}
      >
        {Math.max(0, secs)}
      </text>
    </svg>
  );
}

export function FloatingNotes({ count = 10 }: { count?: number }) {
  const notes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 97) % 100,
        top: (i * 53) % 100,
        size: 18 + ((i * 7) % 26),
        rot: ((i * 37) % 60) - 30,
        colour: PALETTE[i % PALETTE.length],
        delay: (i * 0.4) % 3,
        glyph: i % 2 ? '♪' : '♫',
      })),
    [count],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {notes.map((n, i) => (
        <span
          key={i}
          className="animate-bob absolute font-display font-bold opacity-25"
          style={{
            left: `${n.left}%`,
            top: `${n.top}%`,
            fontSize: n.size,
            color: n.colour,
            transform: `rotate(${n.rot}deg)`,
            animationDelay: `${n.delay}s`,
          }}
        >
          {n.glyph}
        </span>
      ))}
    </div>
  );
}
