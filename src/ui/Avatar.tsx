import type { AvatarId, ColourId } from '../game/types';
import { COLOUR_HEX, INK } from './tokens';

export type Mood = 'idle' | 'happy' | 'sad' | 'wow';

const S = { stroke: INK, strokeWidth: 3.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

function Face({ cx, cy, mood, gap = 13, scale = 1 }: { cx: number; cy: number; mood: Mood; gap?: number; scale?: number }) {
  const ey = cy - 4 * scale;
  const my = cy + 8 * scale;
  const w = 9 * scale;
  return (
    <g>
      {mood === 'sad' ? (
        <>
          <path d={`M${cx - gap - 4} ${ey} l8 0`} {...S} />
          <path d={`M${cx + gap - 4} ${ey} l8 0`} {...S} />
        </>
      ) : (
        <>
          <circle cx={cx - gap} cy={ey} r={4 * scale} fill={INK} />
          <circle cx={cx + gap} cy={ey} r={4 * scale} fill={INK} />
          <circle cx={cx - gap + 1.4} cy={ey - 1.4} r={1.3 * scale} fill="#fff" />
          <circle cx={cx + gap + 1.4} cy={ey - 1.4} r={1.3 * scale} fill="#fff" />
        </>
      )}
      {mood === 'happy' && <path d={`M${cx - w} ${my - 2} Q${cx} ${my + 10 * scale} ${cx + w} ${my - 2} Z`} fill={INK} {...S} />}
      {mood === 'idle' && <path d={`M${cx - w * 0.7} ${my} Q${cx} ${my + 6 * scale} ${cx + w * 0.7} ${my}`} fill="none" {...S} />}
      {mood === 'sad' && <path d={`M${cx - w * 0.7} ${my + 4} Q${cx} ${my - 3 * scale} ${cx + w * 0.7} ${my + 4}`} fill="none" {...S} />}
      {mood === 'wow' && <ellipse cx={cx} cy={my + 2} rx={4.5 * scale} ry={5.5 * scale} fill={INK} />}
      <circle cx={cx - gap - 6} cy={my - 2} r={3.5 * scale} fill="#ff8fa3" opacity={0.6} />
      <circle cx={cx + gap + 6} cy={my - 2} r={3.5 * scale} fill="#ff8fa3" opacity={0.6} />
    </g>
  );
}

function Body({ id, c, mood }: { id: AvatarId; c: string; mood: Mood }) {
  switch (id) {
    case 'vinyl':
      return (
        <g>
          <circle cx="50" cy="52" r="42" fill="#2a2f5a" {...S} />
          <circle cx="50" cy="52" r="33" fill="none" stroke="#3d4378" strokeWidth="2" />
          <circle cx="50" cy="52" r="24" fill={c} {...S} />
          <Face cx={50} cy={53} mood={mood} gap={9} scale={0.8} />
        </g>
      );
    case 'cassette':
      return (
        <g>
          <rect x="8" y="22" width="84" height="60" rx="10" fill={c} {...S} />
          <rect x="20" y="32" width="60" height="26" rx="13" fill="#fff6e9" {...S} />
          <circle cx="35" cy="45" r="7" fill={INK} />
          <circle cx="65" cy="45" r="7" fill={INK} />
          <circle cx="37" cy="43" r="2" fill="#fff" />
          <circle cx="67" cy="43" r="2" fill="#fff" />
          {mood === 'sad' ? (
            <path d="M42 74 Q50 66 58 74" fill="none" {...S} />
          ) : mood === 'wow' ? (
            <ellipse cx="50" cy="70" rx="5" ry="5" fill={INK} />
          ) : (
            <path d={mood === 'happy' ? 'M38 66 Q50 80 62 66 Z' : 'M42 68 Q50 74 58 68'} fill={mood === 'happy' ? INK : 'none'} {...S} />
          )}
        </g>
      );
    case 'headphones':
      return (
        <g>
          <circle cx="50" cy="56" r="32" fill={c} {...S} />
          <path d="M16 54 Q16 12 50 12 Q84 12 84 54" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
          <rect x="8" y="44" width="16" height="26" rx="7" fill="#fff6e9" {...S} />
          <rect x="76" y="44" width="16" height="26" rx="7" fill="#fff6e9" {...S} />
          <Face cx={50} cy={58} mood={mood} />
        </g>
      );
    case 'mic':
      return (
        <g>
          <rect x="42" y="66" width="16" height="28" rx="6" fill="#4a5088" {...S} />
          <circle cx="50" cy="42" r="32" fill={c} {...S} />
          <path d="M26 26 Q50 14 74 26" fill="none" stroke={INK} strokeWidth="2" opacity="0.35" />
          <path d="M20 40 L80 40" stroke={INK} strokeWidth="2" opacity="0.2" />
          <Face cx={50} cy={46} mood={mood} />
        </g>
      );
    case 'boombox':
      return (
        <g>
          <path d="M28 26 Q50 6 72 26" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <rect x="6" y="26" width="88" height="56" rx="10" fill={c} {...S} />
          <circle cx="27" cy="54" r="14" fill="#fff6e9" {...S} />
          <circle cx="73" cy="54" r="14" fill="#fff6e9" {...S} />
          <Face cx={50} cy={50} mood={mood} gap={23} scale={1} />
        </g>
      );
    case 'guitar':
      return (
        <g>
          <rect x="45" y="2" width="10" height="38" rx="3" fill="#a0673a" {...S} />
          <circle cx="50" cy="48" r="20" fill={c} {...S} />
          <circle cx="50" cy="72" r="24" fill={c} {...S} />
          <path d="M33 60 Q50 54 67 60" fill="none" stroke={c} strokeWidth="8" />
          <circle cx="50" cy="80" r="7" fill={INK} opacity="0.85" />
          <Face cx={50} cy={60} mood={mood} gap={11} scale={0.85} />
        </g>
      );
    case 'drum':
      return (
        <g>
          <path d="M22 4 L44 30" stroke="#a0673a" strokeWidth="5" strokeLinecap="round" />
          <path d="M78 4 L56 30" stroke="#a0673a" strokeWidth="5" strokeLinecap="round" />
          <rect x="12" y="34" width="76" height="54" rx="8" fill={c} {...S} />
          <ellipse cx="50" cy="34" rx="38" ry="11" fill="#fff6e9" {...S} />
          <path d="M14 50 L30 84 L46 50 L62 84 L78 50" fill="none" stroke={INK} strokeWidth="2.5" opacity="0.35" />
          <Face cx={50} cy={62} mood={mood} />
        </g>
      );
    case 'keytar':
    default:
      return (
        <g transform="rotate(-12 50 50)">
          <rect x="6" y="26" width="88" height="54" rx="12" fill={c} {...S} />
          <rect x="18" y="64" width="64" height="11" rx="3" fill="#fff6e9" {...S} />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <path key={i} d={`M${27 + i * 9} 64 L${27 + i * 9} 75`} stroke={INK} strokeWidth="2" />
          ))}
          <Face cx={50} cy={43} mood={mood} gap={14} scale={0.8} />
        </g>
      );
  }
}

export function Avatar({
  id,
  colour,
  mood = 'idle',
  size = 64,
  bob = false,
  className = '',
  title,
}: {
  id: AvatarId;
  colour: ColourId;
  mood?: Mood;
  size?: number | string;
  bob?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`${bob ? 'animate-bob' : ''} ${className}`}
      role="img"
      aria-label={title ?? `${id} avatar`}
      style={{ overflow: 'visible' }}
    >
      <Body id={id} c={COLOUR_HEX[colour]} mood={mood} />
    </svg>
  );
}
