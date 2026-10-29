import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PublicPlayer, PublicState } from '../game/view';
import type { Mood } from '../ui/Avatar';
import { Logo } from '../ui/decor';
import { ScoreStrip } from './tv/common';
import { HostControls } from './tv/HostControls';
import { Lobby } from './tv/Lobby';
import { QuestionStage, RevealStage } from './tv/QuestionStage';
import { GameResults, RoundIntro, RoundResults } from './tv/Results';
import { useHostGame } from './useHostGame';

function stripBadge(pub: PublicState) {
  return (p: PublicPlayer): string | null => {
    const q = pub.question;
    if (pub.phase === 'REVEAL' && pub.reveal) {
      const r = pub.reveal.results.find((x) => x.playerId === p.id);
      if (r?.delta) return r.delta > 0 ? `+${r.delta}` : `${r.delta}`;
      return null;
    }
    if (pub.phase !== 'QUESTION' || !q) return null;
    if (q.answered.includes(p.id)) return '✓ in';
    if (q.buzz) {
      if (q.buzz.activeId === p.id) return 'BUZZ!';
      if (q.buzz.lockedOut.includes(p.id)) return '✕ out';
    }
    if (q.bomb?.holder === p.id) return 'BOMB';
    if (q.bingo) {
      const m = q.bingo.marks[p.id]?.length ?? 0;
      return m ? `${m}/9` : null;
    }
    return null;
  };
}

function stripMood(pub: PublicState) {
  return (p: PublicPlayer): Mood => {
    if (pub.phase === 'REVEAL' && pub.reveal) {
      const r = pub.reveal.results.find((x) => x.playerId === p.id);
      if (r?.delta && r.delta > 0) return 'happy';
      if ((r?.delta ?? 0) < 0 || r?.correct === false) return 'sad';
    }
    if (pub.question?.bomb?.holder === p.id || pub.question?.buzz?.activeId === p.id) return 'wow';
    return 'idle';
  };
}

export default function HostGame() {
  const nav = useNavigate();
  const game = useHostGame();
  const { pub, state } = game;
  const needsSpotify = useMemo(
    () => !!state?.pack?.rounds.some((r) => [...r.questions.map((q) => q.clip?.uri ?? ''), ...r.tracks.map((t) => t.uri)].some((u) => u.startsWith('spotify:'))),
    [state?.pack],
  );

  if (game.error) {
    return (
      <main className="stage-bg grid min-h-dvh place-items-center p-6">
        <div className="chunky flex max-w-lg flex-col gap-4 bg-cream p-8">
          <h1 className="font-display text-3xl font-bold">Something went wrong</h1>
          <p>{game.error}</p>
          <button className="btn-primary self-start" onClick={() => nav('/host')}>
            Back to setup
          </button>
        </div>
      </main>
    );
  }

  if (!pub || !state) {
    return (
      <main className="stage-bg grid min-h-dvh place-items-center">
        <p className="font-display text-3xl text-cream">Opening the room…</p>
      </main>
    );
  }

  const reduced = pub.settings.reducedMotion;
  const showStrip = pub.phase !== 'LOBBY' && pub.phase !== 'GAME_RESULTS' && pub.phase !== 'ROUND_RESULTS';

  return (
    <main
      className={`stage-bg relative flex h-dvh flex-col overflow-hidden px-[2vw] pt-[1.5vh] pb-[calc(2vh+72px)] ${reduced ? 'reduced-motion' : ''} ${pub.settings.highContrast ? 'high-contrast' : ''}`}
    >
      <header className="flex shrink-0 items-center justify-between gap-4 pb-[1.5vh]">
        <div className="text-[clamp(0.6rem,1vw,1.3rem)]">
          <Logo size="sm" />
        </div>
        {pub.round && pub.phase !== 'LOBBY' && (
          <span className="chunky-sm bg-ink-3 px-[1vw] py-[0.3vw] font-display text-[clamp(0.9rem,1.4vw,1.8rem)] font-semibold text-cream">
            Round {pub.round.index + 1}/{pub.round.total} · {pub.round.title}
          </span>
        )}
        <div className="flex items-center gap-2">
          {game.status !== 'online' && (
            <span className="chunky-sm bg-tomato px-2 py-0.5 font-display text-sm text-cream">
              {game.status === 'connecting' ? 'Connecting…' : 'Connection lost, retrying…'}
            </span>
          )}
          {pub.phase !== 'LOBBY' && (
            <span className="chunky-sm bg-sunflower px-[0.8vw] py-[0.2vw] font-display text-[clamp(0.8rem,1.2vw,1.6rem)] font-bold">
              Join: {pub.roomCode}
            </span>
          )}
        </div>
      </header>

      <section className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${pub.phase}-${pub.round?.index ?? 0}-${pub.question?.qid ?? ''}`}
            initial={{ opacity: 0, y: reduced ? 0 : 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -30 }}
            transition={{ duration: reduced ? 0.1 : 0.25 }}
            className="h-full"
          >
            {pub.phase === 'LOBBY' && <Lobby pub={pub} onStart={() => game.command('start')} />}
            {pub.phase === 'ROUND_INTRO' && <RoundIntro pub={pub} />}
            {pub.phase === 'QUESTION' && <QuestionStage pub={pub} />}
            {pub.phase === 'REVEAL' && <RevealStage pub={pub} />}
            {pub.phase === 'ROUND_RESULTS' && <RoundResults pub={pub} />}
            {pub.phase === 'GAME_RESULTS' && <GameResults pub={pub} reduced={reduced} />}
          </motion.div>
        </AnimatePresence>

        {pub.paused && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-ink/70">
            <div className="chunky bg-sunflower px-[4vw] py-[3vh] text-center">
              <p className="font-display text-[clamp(2rem,6vw,7rem)] leading-none font-bold">Paused</p>
              <p className="tv-text-md font-display">Press Resume (or P) to carry on</p>
            </div>
          </div>
        )}
      </section>

      {showStrip && (
        <footer className="mt-[2vh] shrink-0">
          <ScoreStrip pub={pub} badge={stripBadge(pub)} mood={stripMood(pub)} />
        </footer>
      )}

      <HostControls
        game={game}
        needsSpotify={needsSpotify}
        onCloseRoom={() => {
          void game.closeRoom().then(() => nav('/'));
        }}
        onNewQuestions={() => nav('/host')}
      />
    </main>
  );
}
