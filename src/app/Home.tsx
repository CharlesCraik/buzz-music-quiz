import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AVATARS, COLOURS } from '../game/types';
import { normaliseCode } from '../lib/id';
import { Avatar } from '../ui/Avatar';
import { Equaliser, FloatingNotes, Logo } from '../ui/decor';

export function Home() {
  const nav = useNavigate();
  const [code, setCode] = useState('');

  return (
    <main className="stage-bg relative flex min-h-dvh flex-col items-center justify-center gap-8 overflow-hidden px-4 py-10">
      <FloatingNotes count={14} />
      <div className="relative z-10 flex flex-col items-center gap-4 text-center">
        <Logo size="lg" />
        <p className="max-w-md font-display text-lg text-cream/80 sm:text-xl">
          The family music quiz. TV is the stage, phones are the buzzers.
        </p>
        <div className="flex flex-wrap justify-center gap-1 sm:gap-2">
          {AVATARS.map((a, i) => (
            <div key={a} style={{ animationDelay: `${i * 0.2}s` }} className="animate-bob">
              <Avatar id={a} colour={COLOURS[i]} size="clamp(40px, 9vw, 72px)" mood={i % 3 === 0 ? 'happy' : 'idle'} />
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 grid w-full max-w-3xl gap-5 md:grid-cols-2">
        <section className="chunky flex flex-col gap-4 bg-sunflower p-5 sm:p-6">
          <h2 className="font-display text-3xl font-bold">Join a game</h2>
          <p className="text-ink/80">On your phone? Type the code shown on the TV.</p>
          <form
            className="flex gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === 4) nav(`/join/${code}`);
            }}
          >
            <input
              className="field min-w-0 flex-1 text-center text-3xl tracking-[0.3em] uppercase"
              value={code}
              onChange={(e) => setCode(normaliseCode(e.target.value))}
              placeholder="ABCD"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              aria-label="Room code"
            />
            <button className="btn-ghost shrink-0" disabled={code.length !== 4}>
              Go
            </button>
          </form>
        </section>
        <section className="chunky flex flex-col gap-4 bg-sky p-5 sm:p-6">
          <h2 className="font-display text-3xl font-bold">Host a game</h2>
          <p className="text-ink/80">On the laptop plugged into the TV. Connect Spotify, pick rounds, go!</p>
          <div className="mt-auto flex items-end gap-4">
            <button className="btn-primary flex-1" onClick={() => nav('/host')}>
              Set up the show
            </button>
            <Equaliser className="h-12 w-16" />
          </div>
        </section>
      </div>
      <p className="relative z-10 max-w-xl text-center text-sm text-cream/50">
        An original Buzz-inspired party game for private, non-commercial family use.
      </p>
    </main>
  );
}
