import { useState } from 'react';
import { AVATARS, COLOURS, MAX_NAME_LENGTH, type AvatarId, type ColourId } from '../game/types';
import type { PublicState } from '../game/view';
import { Avatar } from '../ui/Avatar';
import { COLOUR_HEX, COLOUR_LABEL, COLOUR_SHAPE } from '../ui/tokens';
import type { JoinProfile } from '../realtime';

export function JoinForm({
  pub,
  initial,
  onJoin,
  busy,
  error,
}: {
  pub: PublicState | null;
  initial: JoinProfile | null;
  onJoin: (p: JoinProfile) => void;
  busy: boolean;
  error: string | null;
}) {
  const taken = new Set(pub?.players.map((p) => p.colour) ?? []);
  const firstFree = COLOURS.find((c) => !taken.has(c)) ?? 'tomato';
  const [name, setName] = useState(initial?.name ?? '');
  const [colour, setColour] = useState<ColourId>(
    initial?.colour && !taken.has(initial.colour) ? initial.colour : firstFree,
  );
  const [avatar, setAvatar] = useState<AvatarId>(initial?.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]);

  return (
    <form
      className="paper-bg flex min-h-dvh flex-col gap-4 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onJoin({ name: name.trim(), colour, avatar });
      }}
    >
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Join room {pub?.roomCode}</h1>
      </div>

      <div className="flex justify-center">
        <div className="chunky grid h-36 w-36 place-items-center" style={{ background: COLOUR_HEX[colour] }}>
          <Avatar id={avatar} colour={colour} size={110} mood="happy" bob />
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="label">Your name</span>
        <input
          className="field"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Grandma Jo"
          autoComplete="nickname"
          enterKeyHint="go"
          autoFocus
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-1">Colour</legend>
        <div className="grid grid-cols-4 gap-2">
          {COLOURS.map((c) => {
            const isTaken = taken.has(c);
            return (
              <button
                type="button"
                key={c}
                disabled={isTaken}
                onClick={() => setColour(c)}
                aria-pressed={colour === c}
                aria-label={`${COLOUR_LABEL[c]}${isTaken ? ' (taken)' : ''}`}
                className={`chunky-sm press grid h-14 place-items-center font-display text-2xl ${isTaken ? 'opacity-25' : ''} ${colour === c ? 'ring-4 ring-ink ring-offset-2' : ''}`}
                style={{ background: COLOUR_HEX[c] }}
              >
                {COLOUR_SHAPE[c]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-1">Character</legend>
        <div className="grid grid-cols-4 gap-2">
          {AVATARS.map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => setAvatar(a)}
              aria-pressed={avatar === a}
              aria-label={a}
              className={`chunky-sm press grid aspect-square place-items-center bg-paper p-1 ${avatar === a ? 'bg-sunflower' : ''}`}
            >
              <Avatar id={a} colour={colour} size="100%" />
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p className="chunky-sm bg-tomato p-3 font-semibold text-cream">{error}</p>}

      <button className="btn-primary mt-auto min-h-16 text-2xl" disabled={!name.trim() || busy}>
        {busy ? 'Joining…' : "Let's go!"}
      </button>
    </form>
  );
}
