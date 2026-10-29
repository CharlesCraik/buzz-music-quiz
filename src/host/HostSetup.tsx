import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { shuffle } from '../game/ctx';
import { ROUND_INFO } from '../game/rounds';
import { ROUND_TYPES, type Question, type RoundType, type Settings, type Track } from '../game/types';
import { env, hasSpotify } from '../lib/env';
import { OpenAiKeyPanel } from './OpenAiKeyPanel';
import { getMe, getMyPlaylists, getPlaylistTracks, type PlaylistSummary } from '../music/spotifyApi';
import {
  disconnectSpotify,
  isSpotifyConnected,
  startSpotifyLogin,
} from '../music/spotifyAuth';
import { buildPack, feasibleRounds } from '../questions/buildPack';
import {
  cacheMaterial,
  cachedMaterials,
  canGenerate,
  deleteCachedMaterial,
  generateMaterial,
  rememberPrompts,
  type CachedMaterial,
} from '../questions/generate';
import { MOCK_TRACKS, SAMPLE_QUESTIONS } from '../questions/samplePack';
import { isOnlineMode } from '../realtime';
import { Equaliser, Logo } from '../ui/decor';
import { reduce } from '../game/engine';
import { clearSession, loadSession, savePrepared, saveSession } from './prepared';

type Source = 'sample' | 'playlist' | 'category' | 'cached';

interface Material {
  title: string;
  questions: Question[];
  tracks: Track[];
}

const CATEGORIES = [
  'Pop',
  'Rock',
  'Indie',
  'Britpop',
  'Dance',
  'Electronic',
  'Disco & Funk',
  'Hip-hop',
  'Rap',
  'Soul & R&B',
  'Motown',
  'Reggae',
  'Country',
  'Folk',
  'Blues',
  'Jazz',
  'Classical',
  'Metal',
  'Punk',
  'Grunge',
  'Emo & pop-punk',
  'K-pop',
  'Latin',
  'Afrobeats',
  'Eurovision',
  'Musicals',
  'Film soundtracks',
  'TV themes',
  'Disney',
  'Video game music',
  'Christmas',
  'Kids & family',
  'Boy & girl bands',
  'One-hit wonders',
  'Love songs',
  'Party anthems',
];
const DECADES = ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'];

const ROUND_EMOJI: Record<RoundType, string> = {
  multipleChoice: 'ABCD',
  fastestFinger: 'FAST',
  nameThatTune: 'TUNE',
  introSprint: 'INTRO',
  whoSings: 'ARTIST',
  decadeDash: 'DECADE',
  stealPoints: 'STEAL',
  passTheBomb: 'BOMB',
  musicalChairs: 'CHAIRS',
  beatMash: 'MASH',
  lastStanding: 'SURVIVE',
  musicBingo: 'BINGO',
};

function Section({ n, title, children, tone = 'bg-cream' }: { n: number; title: string; children: ReactNode; tone?: string }) {
  return (
    <section className={`chunky ${tone} flex flex-col gap-4 p-4 sm:p-6`}>
      <h2 className="flex items-center gap-3 font-display text-2xl font-bold sm:text-3xl">
        <span className="chunky-sm grid h-10 w-10 shrink-0 place-items-center bg-ink text-xl text-cream">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`chunky-sm press px-3 py-2 font-display text-base font-semibold ${on ? 'bg-ink text-cream' : 'bg-paper text-ink'}`}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span>
        <span className="font-display text-lg font-semibold">{label}</span>
        {hint && <span className="block text-sm text-ink/60">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`chunky-sm relative h-9 w-16 shrink-0 ${on ? 'bg-lime' : 'bg-paper'}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full border-[3px] border-ink bg-cream transition-all ${on ? 'left-8' : 'left-1'}`}
        />
      </button>
    </label>
  );
}

export default function HostSetup() {
  const nav = useNavigate();
  const resumable = loadSession();

  // ---- Spotify ----
  const [spotifyOn, setSpotifyOn] = useState(isSpotifyConnected());
  const [spotifyName, setSpotifyName] = useState<string | null>(null);
  const [spotifyErr, setSpotifyErr] = useState<string | null>(null);
  const [musicMode, setMusicMode] = useState<'sdk' | 'manual'>(env.spotifyWebPlayback ? 'sdk' : 'manual');
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);

  useEffect(() => {
    if (!spotifyOn) return;
    getMe()
      .then((me) => setSpotifyName(me.display_name ?? me.id))
      .catch((e: Error) => {
        setSpotifyErr(e.message);
        if (e.message.includes('NOT_CONNECTED') || e.message.includes('expired')) setSpotifyOn(false);
      });
  }, [spotifyOn]);

  // ---- Source ----
  const [source, setSource] = useState<Source>('sample');
  const [categories, setCategories] = useState<string[]>(['Pop', 'Rock']);
  const [decades, setDecades] = useState<string[]>(['80s', '90s', '2000s']);
  const [difficulties, setDifficulties] = useState<('easy' | 'medium' | 'hard')[]>(['easy', 'medium']);
  const [familyFriendly, setFamilyFriendly] = useState(true);
  const [material, setMaterial] = useState<Material | null>({
    title: 'Sample pack',
    questions: SAMPLE_QUESTIONS,
    tracks: MOCK_TRACKS,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [cached, setCached] = useState<CachedMaterial[]>(cachedMaterials());
  // Bumped when the OpenAI key changes so canGenerate() re-evaluates.
  const [, setKeyVersion] = useState(0);

  // ---- Rounds & settings ----
  const [enabled, setEnabled] = useState<RoundType[]>([...ROUND_TYPES]);
  const [roundCount, setRoundCount] = useState(6);
  const [randomOrder, setRandomOrder] = useState(false);
  const [qpr, setQpr] = useState(5);
  const [settings, setSettings] = useState<Partial<Settings>>({
    timerMultiplier: 1,
    autoAdvance: false,
    speedBonus: false,
    allowLateJoin: true,
    reducedMotion: false,
    highContrast: false,
    wrongPenalty: 50,
  });
  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  const feasible = useMemo(
    () => feasibleRounds(material?.questions ?? [], material?.tracks ?? []),
    [material],
  );

  const roundPlan = useMemo(() => {
    const usable = enabled.filter((t) => feasible[t]);
    if (usable.length === 0) return [];
    const order = randomOrder ? shuffle(usable, Math.random) : usable;
    return Array.from({ length: roundCount }, (_, i) => order[i % order.length]);
  }, [enabled, feasible, randomOrder, roundCount]);


  function pickSource(s: Source) {
    setSource(s);
    setError(null);
    setNotes([]);
    if (s === 'sample') setMaterial({ title: 'Sample pack', questions: SAMPLE_QUESTIONS, tracks: MOCK_TRACKS });
    else setMaterial(null);
    if (s === 'playlist' && spotifyOn && !playlists) {
      setBusy('Loading your playlists…');
      getMyPlaylists()
        .then(setPlaylists)
        .catch((e: Error) => setError(e.message))
        .finally(() => setBusy(null));
    }
  }

  async function choosePlaylist(p: PlaylistSummary) {
    setPlaylistId(p.id);
    setError(null);
    setMaterial(null);
    setBusy(`Loading songs from "${p.name}"…`);
    try {
      const tracks = await getPlaylistTracks(p.id);
      setPlaylistTracks(tracks);
      // Audio rounds work straight away; text rounds use samples until AI questions are written.
      setMaterial({ title: p.name, questions: SAMPLE_QUESTIONS, tracks });
      setNotes([
        `${tracks.length} songs loaded.`,
        canGenerate()
          ? 'Tap "Write questions" to create trivia about these songs. Until then, text rounds use the sample questions.'
          : 'Add your OpenAI key below to write trivia about these songs; until then text rounds use the sample questions.',
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    setError(null);
    setNotes([]);
    try {
      const count = 64;
      const tracksForAi = shuffle(playlistTracks, Math.random).slice(0, 80);
      const res = await generateMaterial(
        {
          mode: source === 'playlist' ? 'playlist' : 'category',
          categories,
          decades,
          difficulties,
          count,
          songCount: source === 'category' ? 52 : 0,
          familyFriendly,
          tracks:
            source === 'playlist'
              ? tracksForAi.map((t) => ({ title: t.title, artists: t.artists, album: t.album ?? null, year: t.year ?? null }))
              : undefined,
        },
        source === 'playlist' ? playlistTracks : [],
        setBusy,
      );
      const title =
        source === 'playlist'
          ? `${playlists?.find((p) => p.id === playlistId)?.name ?? 'Playlist'} quiz`
          : `${categories.join(', ') || 'Mixed'} · ${decades.join(', ') || 'all decades'}`;
      const m = { title, questions: res.questions, tracks: res.tracks };
      setMaterial(m);
      rememberPrompts(res.questions.map((q) => q.prompt));
      cacheMaterial(m);
      setCached(cachedMaterials());
      const n: string[] = [`${res.questions.length} questions ready.`];
      if (res.report.rejected.length) n.push(`${res.report.rejected.length} dodgy questions were thrown out automatically.`);
      if (source === 'category') n.push(`${res.tracks.length} songs found on Spotify for audio rounds.`);
      if (res.unresolvedSongs.length) n.push(`Couldn't find: ${res.unresolvedSongs.slice(0, 5).join('; ')}${res.unresolvedSongs.length > 5 ? '…' : ''}`);
      if (source === 'category' && !spotifyOn) n.push('Connect Spotify to add audio rounds (Name That Tune, Bingo).');
      setNotes(n);
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : String(e)} — you can still play with the sample pack or a saved pack.`,
      );
    } finally {
      setBusy(null);
    }
  }

  function removeQuestion(id: string) {
    setMaterial((m) => (m ? { ...m, questions: m.questions.filter((q) => q.id !== id) } : m));
  }

  function openRoom() {
    if (!material || roundPlan.length === 0) return;
    const pack = buildPack({
      title: material.title,
      source: source === 'sample' ? 'sample' : source === 'playlist' ? 'playlist' : 'category',
      questions: material.questions,
      tracks: material.tracks,
      roundTypes: roundPlan,
      questionsPerRound: qpr,
    });
    const fullSettings = { ...settings, questionsPerRound: qpr };
    savePrepared({ pack, settings: fullSettings, musicMode });
    // If a room is open between games, keep it (and its players) and swap in the new pack.
    const session = loadSession();
    if (session) {
      let st = session.state;
      const now = Date.now();
      if (st.phase !== 'LOBBY') {
        if (st.paused) st = reduce(st, { type: 'host', cmd: 'resume' }, now).state;
        st = reduce(st, { type: 'host', cmd: 'end' }, now).state;
        st = reduce(st, { type: 'host', cmd: 'toLobby' }, now).state;
      }
      st = reduce(st, { type: 'settings', settings: fullSettings }, now).state;
      st = reduce(st, { type: 'loadPack', pack }, now).state;
      saveSession({ ...session, state: st, savedAt: now });
    } else {
      clearSession();
    }
    nav('/host/room');
  }

  const needsSpotifyAudio =
    material?.tracks.some((t) => t.uri.startsWith('spotify:')) &&
    roundPlan.some((t) => ROUND_INFO[t].audio);

  return (
    <main className="stage-bg min-h-dvh px-3 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <button onClick={() => nav('/')} aria-label="Home">
            <Logo size="md" />
          </button>
          <div className="flex items-center gap-3">
            <span className={`chunky-sm px-3 py-1 font-display text-sm ${isOnlineMode() ? 'bg-lime' : 'bg-tangerine'}`}>
              {isOnlineMode() ? 'Online mode: phones join over the internet' : 'Local test mode: phones = other tabs'}
            </span>
          </div>
        </header>

        {resumable && (
          <div className="chunky flex flex-wrap items-center justify-between gap-3 bg-tangerine p-4">
            <p className="font-display text-lg">Room {resumable.code} is still open. Opening the room below keeps your players (ending any game in progress) and loads the new questions.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => nav('/host/room')}>
                Return to the game
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  clearSession();
                  window.location.reload();
                }}
              >
                Start a fresh room
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 1. Music */}
          <Section n={1} title="Music" tone="bg-sky">
            {!hasSpotify() ? (
              <p className="chunky-sm bg-cream p-3">
                Spotify isn't configured yet. Add <code>VITE_SPOTIFY_CLIENT_ID</code> (see README). You can still play with the built-in sample tunes.
              </p>
            ) : spotifyOn ? (
              <div className="chunky-sm flex flex-wrap items-center justify-between gap-3 bg-cream p-3">
                <div>
                  <p className="font-display text-lg font-semibold">
                    Spotify connected{spotifyName ? ` as ${spotifyName}` : ''}
                  </p>
                  {spotifyErr && <p className="text-sm text-tomato">{spotifyErr}</p>}
                </div>
                <button
                  className="btn-ghost text-base"
                  onClick={() => {
                    disconnectSpotify();
                    setSpotifyOn(false);
                    setSpotifyName(null);
                    setPlaylists(null);
                  }}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button className="btn-primary self-start" onClick={() => void startSpotifyLogin('/host')}>
                  Connect Spotify
                </button>
                <p className="text-sm">Only the host connects. Spotify Premium needed for in-browser playback.</p>
              </div>
            )}
            {spotifyOn && (
              <div className="flex flex-col gap-2">
                <span className="label">How should songs play?</span>
                <div className="flex flex-wrap gap-2">
                  <Chip on={musicMode === 'sdk'} onClick={() => setMusicMode('sdk')}>
                    Through this browser (auto)
                  </Chip>
                  <Chip on={musicMode === 'manual'} onClick={() => setMusicMode('manual')}>
                    I'll press play in Spotify
                  </Chip>
                </div>
              </div>
            )}
          </Section>

          {/* 2. Questions */}
          <Section n={2} title="Questions & songs" tone="bg-sunflower">
            <div className="flex flex-wrap gap-2">
              <Chip on={source === 'sample'} onClick={() => pickSource('sample')}>
                Sample pack
              </Chip>
              <Chip on={source === 'playlist'} onClick={() => pickSource('playlist')}>
                My playlist
              </Chip>
              <Chip on={source === 'category'} onClick={() => pickSource('category')}>
                Pick a vibe (AI)
              </Chip>
              {cached.length > 0 && (
                <Chip on={source === 'cached'} onClick={() => pickSource('cached')}>
                  Saved packs ({cached.length})
                </Chip>
              )}
            </div>

            {(source === 'playlist' || source === 'category') && (
              <OpenAiKeyPanel onChange={() => setKeyVersion((v) => v + 1)} />
            )}

            {source === 'sample' && (
              <p>30 classic music questions and 15 made-up songs played as synth tunes. Works with no setup.</p>
            )}

            {source === 'playlist' &&
              (!spotifyOn ? (
                <p>Connect Spotify first (step 1).</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm">Pick one of your own playlists (Spotify only shares songs from playlists you own or collaborate on). 15+ songs works best.</p>
                  <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                    {playlists?.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => void choosePlaylist(p)}
                        className={`chunky-sm press flex items-center gap-2 p-2 text-left ${playlistId === p.id ? 'bg-ink text-cream' : 'bg-paper'}`}
                      >
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-md border-2 border-ink object-cover" />
                        ) : (
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border-2 border-ink bg-grape">♪</span>
                        )}
                        <span className="line-clamp-2 text-sm font-semibold">{p.name}</span>
                      </button>
                    ))}
                    {playlists?.length === 0 && <p>No playlists found.</p>}
                  </div>
                  {playlistTracks.length > 0 && canGenerate() && (
                    <button className="btn-ghost self-start" disabled={!!busy} onClick={() => void generate()}>
                      Write questions about these songs (AI)
                    </button>
                  )}
                </div>
              ))}

            {source === 'category' && (
              <div className="flex flex-col gap-3">

                <span className="label">Genres</span>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <Chip
                      key={c}
                      on={categories.includes(c)}
                      onClick={() => setCategories((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))}
                    >
                      {c}
                    </Chip>
                  ))}
                </div>
                <span className="label">Decades</span>
                <div className="flex flex-wrap gap-2">
                  {DECADES.map((d) => (
                    <Chip
                      key={d}
                      on={decades.includes(d)}
                      onClick={() => setDecades((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))}
                    >
                      {d}
                    </Chip>
                  ))}
                </div>
                <span className="label">Difficulty (pick one or more to mix)</span>
                <div className="flex flex-wrap gap-2">
                  {(['easy', 'medium', 'hard'] as const).map((d) => (
                    <Chip
                      key={d}
                      on={difficulties.includes(d)}
                      onClick={() =>
                        setDifficulties((ds) =>
                          ds.includes(d) ? (ds.length > 1 ? ds.filter((x) => x !== d) : ds) : [...ds, d],
                        )
                      }
                    >
                      {d[0].toUpperCase() + d.slice(1)}
                    </Chip>
                  ))}
                </div>
                <Toggle on={familyFriendly} onChange={setFamilyFriendly} label="Family friendly" />
                <button
                  className="btn-primary self-start bg-paper"
                  disabled={!!busy || !canGenerate() || categories.length + decades.length === 0}
                  onClick={() => void generate()}
                >
                  Write my quiz
                </button>
              </div>
            )}

            {source === 'cached' && (
              <div className="flex flex-col gap-2">
                {cached.map((c) => (
                  <div key={c.id} className="chunky-sm flex items-center justify-between gap-2 bg-paper p-2">
                    <button
                      className="flex-1 text-left"
                      onClick={() => setMaterial({ title: c.title, questions: c.questions, tracks: c.tracks })}
                    >
                      <span className="font-display font-semibold">{c.title}</span>
                      <span className="block text-sm text-ink/60">
                        {c.questions.length} questions · {c.tracks.length} songs · {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      className="px-2 text-tomato"
                      aria-label="Delete saved pack"
                      onClick={() => {
                        deleteCachedMaterial(c.id);
                        setCached(cachedMaterials());
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {busy && (
              <div className="chunky-sm flex items-center gap-3 bg-cream p-3">
                <Equaliser className="h-8 w-12" />
                <span className="font-display">{busy}</span>
              </div>
            )}
            {error && <p className="chunky-sm bg-tomato p-3 font-semibold text-cream">{error}</p>}
            {notes.length > 0 && (
              <ul className="chunky-sm bg-cream p-3 text-sm">
                {notes.map((n) => (
                  <li key={n}>• {n}</li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* 3. Rounds */}
        <Section n={3} title="Rounds" tone="bg-lime">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {ROUND_TYPES.map((t) => {
              const on = enabled.includes(t);
              const ok = feasible[t];
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  disabled={!ok}
                  onClick={() => setEnabled((es) => (es.includes(t) ? es.filter((x) => x !== t) : [...es, t]))}
                  className={`chunky-sm press flex flex-col items-start gap-1 p-3 text-left ${on && ok ? 'bg-ink text-cream' : 'bg-paper'} ${ok ? '' : 'opacity-40'}`}
                >
                  <span className="font-display text-xs font-bold tracking-widest opacity-70">{ROUND_EMOJI[t]}</span>
                  <span className="font-display text-lg leading-tight font-bold">{ROUND_INFO[t].title}</span>
                  <span className="text-xs opacity-80">{ok ? ROUND_INFO[t].tagline : 'Needs songs'}</span>
                </button>
              );
            })}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <span className="label">Number of rounds</span>
              <div className="flex flex-wrap gap-2">
                {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                  <Chip key={n} on={roundCount === n} onClick={() => setRoundCount(n)}>
                    {n}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="label">Questions per round: {qpr}</span>
              <input
                type="range"
                min={3}
                max={8}
                value={qpr}
                onChange={(e) => setQpr(Number(e.target.value))}
                className="h-10 accent-ink"
                aria-label="Questions per round"
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="label">Timers</span>
              <div className="flex flex-wrap gap-2">
                {[
                  [1, 'Normal'],
                  [1.5, 'Relaxed'],
                  [2, 'Extra time'],
                ].map(([v, l]) => (
                  <Chip key={l} on={settings.timerMultiplier === v} onClick={() => set({ timerMultiplier: v as number })}>
                    {l}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
            <Toggle on={randomOrder} onChange={setRandomOrder} label="Shuffle round order" />
            <Toggle
              on={!!settings.autoAdvance}
              onChange={(v) => set({ autoAdvance: v })}
              label="Auto-advance"
              hint="Off = the host presses Next (or Space) after each answer, so nobody feels rushed"
            />
            <Toggle on={!!settings.speedBonus} onChange={(v) => set({ speedBonus: v })} label="Speed bonus" hint="Quick Quiz: faster correct answers earn extra" />
            <Toggle on={(settings.wrongPenalty ?? 50) > 0} onChange={(v) => set({ wrongPenalty: v ? 50 : 0 })} label="Wrong buzz penalty" hint="Lose 50 for a wrong buzz (never below zero)" />
            <Toggle on={!!settings.allowLateJoin} onChange={(v) => set({ allowLateJoin: v })} label="Allow late joiners" />
            <Toggle on={!!settings.reducedMotion} onChange={(v) => set({ reducedMotion: v })} label="Reduced motion" hint="No flashing, shaking or confetti" />
            <Toggle on={!!settings.highContrast} onChange={(v) => set({ highContrast: v })} label="High contrast" />
          </div>
          {roundPlan.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="label">Running order:</span>
              {roundPlan.map((t, i) => (
                <span key={i} className="chunky-sm bg-cream px-2 py-1 text-sm font-semibold">
                  {i + 1}. {ROUND_INFO[t].title}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* 4. Preview */}
        {material && material.questions.length > 0 && source !== 'sample' && (
          <Section n={4} title={`Preview: ${material.title}`} tone="bg-cream">
            <p className="text-sm text-ink/70">
              AI questions are checked automatically but may still contain mistakes. Remove any you don't like.
            </p>
            <ol className="grid max-h-96 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
              {material.questions.map((q, i) => (
                <li key={q.id} className="chunky-sm flex gap-2 bg-paper p-3">
                  <span className="font-display font-bold">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{q.prompt}</p>
                    <p className="text-sm text-ink/70">
                      {q.options.map((o) => (
                        <span key={o.id} className={o.id === q.correctOptionId ? 'font-bold text-teal' : ''}>
                          {o.text}
                          {o.id === q.correctOptionId ? ' ✓' : ''} ·{' '}
                        </span>
                      ))}
                    </p>
                  </div>
                  <button className="self-start px-2 text-tomato" aria-label="Remove question" onClick={() => removeQuestion(q.id)}>
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          </Section>
        )}

        <div className="chunky sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 bg-ink-2 p-4 text-cream">
          <div className="font-display">
            {material ? (
              <>
                <span className="text-lg font-semibold">{material.title}</span>
                <span className="block text-sm text-cream/70">
                  {roundPlan.length} rounds · {material.questions.length} questions · {material.tracks.length} songs
                  {needsSpotifyAudio && musicMode === 'sdk' ? ' · Spotify audio' : ''}
                </span>
              </>
            ) : (
              <span>Choose your questions & songs above.</span>
            )}
          </div>
          <button className="btn-primary text-xl" disabled={!material || roundPlan.length === 0 || !!busy} onClick={openRoom}>
            Open the room →
          </button>
        </div>
      </div>
    </main>
  );
}
