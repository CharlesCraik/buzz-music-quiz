import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { MAX_PLAYERS } from '../../game/types';
import type { PublicState } from '../../game/view';
import { isOnlineMode } from '../../realtime';
import { Avatar } from '../../ui/Avatar';
import { Equaliser } from '../../ui/decor';
import { COLOUR_HEX, COLOUR_SHAPE } from '../../ui/tokens';

export function joinUrl(code: string) {
  return `${window.location.origin}/join/${code}`;
}

export function Lobby({ pub, onStart }: { pub: PublicState; onStart: () => void }) {
  const url = joinUrl(pub.roomCode);
  const online = isOnlineMode();
  const ready = pub.players.filter((p) => p.ready).length;

  return (
    <div className="grid h-full min-h-0 w-full gap-[2vw] md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="chunky flex min-h-0 flex-col items-center justify-center gap-[1vh] overflow-hidden bg-cream p-[1.5vw] text-center">
        <p className="tv-text-md font-display font-semibold">Scan to join</p>
        <div className="chunky-sm bg-paper p-[1vw]">
          <QRCodeSVG value={url} size={512} className="h-auto w-[clamp(120px,min(20vw,30vh),420px)]" fgColor="#1b1f3b" marginSize={0} />
        </div>
        <p className="tv-text-md font-display">or go to</p>
        <p className="font-display text-[clamp(0.9rem,1.4vw,1.8rem)] font-semibold break-all">
          {window.location.host}/join
        </p>
        <p className="tv-text-md font-display">and enter</p>
        <p className="chunky-sm bg-sunflower px-[1.5vw] font-display text-[clamp(2rem,min(7vw,11vh),9rem)] leading-none font-bold tracking-[0.15em]">
          {pub.roomCode}
        </p>
        {!online && (
          <p className="text-sm text-ink/60">Local test mode: open the join link in another tab of this browser.</p>
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-[2vh]">
        <div className="flex items-end justify-between gap-4">
          <h2 className="tv-text-xl font-display font-bold text-cream">
            Players <span className="text-sunflower">{pub.players.length}</span>
            <span className="text-cream/40">/{MAX_PLAYERS}</span>
          </h2>
          <Equaliser className="h-[6vh] w-[8vw]" />
        </div>
        <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-[1.2vw] lg:grid-cols-4">
          <AnimatePresence>
            {pub.players.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ scale: 0, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                className={`chunky relative flex flex-col items-center justify-center gap-[0.5vh] p-[1vw] ${p.connected ? '' : 'opacity-50'}`}
                style={{ background: COLOUR_HEX[p.colour] }}
              >
                <div style={{ animationDelay: `${i * 0.3}s` }} className="animate-bob">
                  <Avatar id={p.avatar} colour={p.colour} size="clamp(48px,7vw,150px)" mood={p.ready ? 'happy' : 'idle'} />
                </div>
                <span className="w-full truncate text-center font-display text-[clamp(1rem,1.8vw,2.4rem)] font-bold">
                  <span aria-hidden className="mr-1 opacity-60">{COLOUR_SHAPE[p.colour]}</span>
                  {p.name}
                </span>
                <span
                  className={`rounded-full border-2 border-ink px-3 font-display text-[clamp(0.7rem,1vw,1.3rem)] font-semibold ${p.ready ? 'bg-lime' : 'bg-cream'}`}
                >
                  {p.ready ? 'Ready!' : p.connected ? 'Getting ready…' : 'Reconnecting…'}
                </span>
              </motion.div>
            ))}
            {Array.from({ length: Math.max(0, Math.min(4, MAX_PLAYERS) - pub.players.length) }, (_, i) => (
              <div
                key={`empty-${i}`}
                className="grid place-items-center rounded-[1.25rem] border-[3px] border-dashed border-cream/25 font-display text-[clamp(0.9rem,1.4vw,1.8rem)] text-cream/40"
              >
                Waiting for player…
              </div>
            ))}
          </AnimatePresence>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="tv-text-md font-display text-cream/80">
            {pub.players.length === 0
              ? 'Grab your phones!'
              : `${ready} of ${pub.players.length} ready`}
          </p>
          <button className="btn-primary px-8 text-[clamp(1.1rem,1.8vw,2.2rem)]" onClick={onStart} disabled={pub.players.length === 0}>
            Start the show!
          </button>
        </div>
      </div>
    </div>
  );
}
