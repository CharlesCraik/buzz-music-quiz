# Buzzer Beat 🎵

A family music quiz party game in the spirit of the classic PS2 buzzer quizzes, built as a web app.

- **The TV (laptop) is the stage.** It shows the questions, timers, buzz-ins, reveals and scores.
- **Phones are the buzzers.** Players scan a QR code or type a 4-letter code. No app, no accounts.
- **Spotify plays the music** for Name That Tune and Music Bingo, through the host's browser.
- **OpenAI writes the questions**, either about your own Spotify playlist or a genre/decade mix.
- Individual players only (2–8), with original artwork, sounds and branding.

## Rounds

| Round | How it works |
|---|---|
| **Quick Quiz** | 4 options, everyone answers on their phone, +100 per correct answer (optional speed bonus). |
| **Fastest Finger** | Everyone answers. Correct answers are ranked by server order: 300 / 200 / 150 / 100. |
| **Name That Tune** | A song plays. First to buzz answers on their phone. Earlier = more points (300/200/100). Wrong = −50 (never below 0) and locked out, and the music carries on for everyone else. |
| **Intro Sprint** | A song plays **from its very first note**. Everyone picks the title; fastest correct answers score 300 / 200 / 150 / 100. |
| **Who Sings It?** | A song plays. Everyone picks the artist. +100 each. |
| **Decade Dash** | A song plays. Pick the decade it came out (from Spotify's release date). +100 each. |
| **Point Thief** | Buzz in and answer. Correct = +100, then pick a rival to steal up to 150 from (capped at their score). |
| **Hot Potato Bomb** | One player holds the bomb and answers questions. Right answer = pass it on. The fuse is secret. Holding it when it blows = −200. |
| **Musical Chairs** | Mini-game. Dance while the music plays; when it stops, tap **SIT!** There's one chair fewer than players, so the slowest is out, and anyone tapping before the music stops is out too. +50 per song survived, +300 to the winner. |
| **Beat Mash** | Mini-game. When the music starts, tap as fast as you can for 10 seconds. Live bar race on the TV. Most taps: 200 / 150 / 100 / 50. |
| **Last One Standing** | Mini-game. Everyone has 2 lives. Wrong or no answer loses a life (unless nobody gets it right). Last player standing wins 300. |
| **Music Bingo** | Everyone gets a 3×3 card of song titles. Clips play one after another; tap a song when you hear it. +50 per tick, −25 for a wrong tap, +50 per line, +200 for the first line, +500 and round over for a full house. |

**Music timing:** a song is only requested once its question has been on screen for 1.5 seconds, so music never starts during a reveal or results screen. In every music round, the countdown, buzzers and answer buttons stay locked ("Get ready… the music is starting") until Spotify confirms the song is actually playing. A slow connection never eats into anyone's time. If a song doesn't start within 15 seconds, the host gets **Retry music** / **Play without music** buttons.

The host picks 3–12 rounds, which round types, questions per round and timers. Optional **"Lose points for wrong or missed answers"** (−50, scores never go below 0). There are accessibility options for relaxed timers, reduced motion (no shaking, flashing or confetti) and high contrast. Colours always come with a shape and letter, so colour is never the only cue.

---

## 1. Try it in 1 minute (no keys needed)

```bash
pnpm install
```

```bash
pnpm dev
```

1. Open <http://127.0.0.1:5173/host>, keep **Sample pack**, and click **Open the room**.
2. Open the join link shown on the TV (`http://127.0.0.1:5173/join/ABCD`) in **two or more new tabs** of the same browser. Each tab is a player.

In this **local test mode**, tabs talk to each other through the browser, with no backend. The sample pack uses 30 built-in questions and 15 made-up songs played as synth tunes. To use real phones you need Supabase (section 2).

> Use `127.0.0.1`, not `localhost`. Spotify only accepts loopback IP addresses for local sign-in, so the app redirects `localhost` automatically.

---

## 2. Supabase setup (dashboard only, no CLI)

Supabase provides the realtime channel between phones and the TV and anonymous player identities. (OpenAI is called straight from the host browser; see section 4.)

1. **Enable anonymous sign-ins.** Dashboard → **Authentication** → **Sign In / Providers** → turn on **Allow anonymous sign-ins** → Save.
2. **Create the database tables.** Dashboard → **SQL Editor** → **New query** → paste the whole of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**. It is safe to run again. If you set up an earlier version, also run [`0002_tap_action.sql`](supabase/migrations/0002_tap_action.sql); the mini-games need it.
3. **Copy your keys.** Dashboard → **Project Settings** → **API Keys** (or **Data API**): copy the **Project URL** and the **anon / publishable** key.
4. Create `.env.local` (copy `.env.example`) and set:

   ```
   VITE_TRANSPORT=supabase
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
   ```

   Restart `pnpm dev`. The setup page header now says **Online mode**.

Optional housekeeping: rooms are deleted when the host clicks **Close room**. To remove abandoned rooms automatically, enable the `pg_cron` extension (Database → Extensions) and schedule `select public.cleanup_old_rooms();` hourly from **Integrations → Cron**.

**Security model:** The anon key is public by design. Row Level Security means only the room's host can read player actions, and players can only submit actions through a checked, rate-limited function. Answers never leave the host's browser until the reveal.

---

## 3. Spotify setup walkthrough

Spotify is used for two things:
- reading your playlists and searching for songs (metadata)
- playing clips through the host's browser with the **Web Playback SDK**

Only the host signs in. Players never need Spotify.

**Requirements:** a **Spotify Premium** account. Spotify requires Premium both for in-browser playback and for owning a Development Mode app.

### 3.1 Create the app

1. Go to <https://developer.spotify.com/dashboard> and log in with your Spotify account.
2. Click **Create app**.
3. Fill in:
   - **App name:** `Buzzer Beat` (anything works)
   - **App description:** `Private family music quiz`
   - **Website:** leave blank
   - **Redirect URIs:** add **both** of these, clicking **Add** after each:
     - `http://127.0.0.1:5173/callback` (local)
     - `https://YOUR-SITE.netlify.app/callback` (add this once you know your Netlify URL, see section 5)
   - **Which API/SDKs are you planning to use?** tick **Web API** and **Web Playback SDK**.
4. Accept the terms and click **Save**.

### 3.2 Allow your account

New apps run in **Development Mode**, so only listed users can sign in.

1. Open your app → **Settings** → **User Management**.
2. Add the **name and email of the Spotify account you'll host with**, then save.

You can add up to 5 people, but only the host needs to be listed.

### 3.3 Copy the Client ID

1. Go to **Settings** → **Basic Information** and copy the **Client ID**.
2. Put it in `.env.local`:

   ```
   VITE_SPOTIFY_CLIENT_ID=your-client-id
   VITE_ENABLE_SPOTIFY_WEB_PLAYBACK=true
   ```

You do **not** need the Client Secret. The app uses the Authorization Code with PKCE flow, which is designed for browser apps, so no secret is used or stored. Never paste the secret into this project.

### 3.4 Letting other families host (their own Spotify app)

Development Mode apps only allow the app owner plus 5 listed users. So other people hosting on your site should use **their own** free Spotify app:

1. On `/host`, under **Music**, click **Use my own Spotify app**.
2. Follow the 4 steps shown: create an app at developer.spotify.com, tick Web API and Web Playback SDK, add the redirect URI shown (there's a copy button), and paste the app's **Client ID**.

The Client ID is saved only in that browser. No client secret is ever needed or accepted. Each host then signs in with their own Spotify Premium account. **Use the default app** switches back.

### 3.5 Connect in the game

1. Restart `pnpm dev` and open <http://127.0.0.1:5173/host>.
2. Click **Connect Spotify** and approve the permissions.
3. Under **How should songs play?**:
   - **Through this browser (auto)** makes the TV tab a Spotify device called "Buzzer Beat TV". When the room opens, click **Enable audio** once, because browsers block autoplay until you click.
   - **I'll press play in Spotify** is manual companion mode. The host panel tells you when to start each song in your own Spotify app.
4. Under **Questions & songs**, choose **My playlist** and pick one of **your own** playlists with 15 or more songs. Spotify only shares tracks from playlists you own or collaborate on, not Spotify-made editorial playlists. Then click **Write questions about these songs (AI)**. Or choose **Pick a vibe (AI)**, select genres and decades, and the AI suggests well-known songs, which the app looks up on Spotify.

**Spotify notes:**
- The February 2026 Development Mode rules apply: playlist tracks come from `/playlists/{id}/items`, and search returns at most 10 results. The app already follows these rules.
- Playback is meant for private, in-home family use. The game never records, downloads or extracts audio, and it never uses preview clips. Check Spotify's Developer Terms if your use is different.
- If playback fails (no Premium, blocked device, policy change), the host panel offers **Switch to manual play** and the game carries on.

---

## 4. OpenAI question generation

The host's browser calls OpenAI directly. No server or Supabase function is involved.

1. Create a key at <https://platform.openai.com/api-keys>. Give the project a low monthly spending limit (Settings → Limits). A full pack costs a few cents.
2. On `/host`, pick **My playlist** or **Pick a vibe (AI)**. An **OpenAI API key** box appears. Paste the key and click **Save key**. You can also change the model there (default `gpt-5-mini`; any model that supports Structured Outputs works).
3. The key is saved in **that browser on that laptop only** and sent only to `api.openai.com`. It is never in the code, the Netlify build or Supabase. Use **Remove** to forget it.

For local development only, you can put `VITE_OPENAI_API_KEY=sk-...` in `.env.local` instead. `pnpm dev` reads it, but production builds strip it. **Never add it to Netlify's environment variables**: anything starting with `VITE_` that the production code reads becomes public in the site's JavaScript.

How generation works:
- Each AI pack has **64 questions** and, in genre mode, **52 songs**. It's written as two parallel batches (about a minute), across 36 genres and any mix of easy, medium and hard.
- Questions are generated **before** the game, never during it.
- Every question is schema-checked: 4 distinct options, a valid correct answer, sensible length, no repeats from recent games, and consistency with Spotify metadata for year questions. Failing questions are discarded automatically.
- Questions are marked **unverified**. The setup page lists them all so you can delete any you don't trust before you start.
- Generated packs are saved in the browser (and in the `question_packs` table when Supabase is configured). **Saved packs** lets you replay one if OpenAI is down.

---

## 5. Deploy to Netlify (web UI only, no CLI)

Netlify serves the static site. All realtime and AI work runs on Supabase, so the free plan is plenty.

1. **Put the code on GitHub.** Create an empty private repo at <https://github.com/new>, then run these from this folder:

   ```bash
   git add -A
   ```

   ```bash
   git commit -m "Buzzer Beat"
   ```

   ```bash
   git remote add origin https://github.com/YOUR-USER/buzzer-beat.git
   ```

   ```bash
   git push -u origin main
   ```

2. **Import the repo.** In Netlify, go to **Add new site** → **Import an existing project** → **GitHub** → pick the repo. The build settings come from `netlify.toml` (`pnpm build`, publish `dist`), so leave them as they are.
3. **Add environment variables.** Before deploying, go to **Site configuration** → **Environment variables** and add:

   | Key | Value |
   |---|---|
   | `VITE_TRANSPORT` | `supabase` |
   | `VITE_SUPABASE_URL` | your Supabase URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon/publishable key |
   | `VITE_SPOTIFY_CLIENT_ID` | your Spotify Client ID |
   | `VITE_ENABLE_SPOTIFY_WEB_PLAYBACK` | `true` |

4. Click **Deploy**.
5. Back in the Spotify dashboard, add `https://YOUR-SITE.netlify.app/callback` to the app's **Redirect URIs** (section 3.1).

Each `git push` triggers a single build, which takes about 1 minute of the free plan's build minutes. Nothing else uses build minutes.

---

## 6. Game night

1. On the laptop, open `https://YOUR-SITE.netlify.app/host` and plug it into the TV. Full-screen the browser (macOS: Ctrl+Cmd+F, Windows: F11).
2. Choose music, questions and rounds, then click **Open the room**. Browsers only allow sound after you interact, so **click anywhere on the TV page once** (or press any key). After that, music plays automatically for every round.
3. Players scan the QR code with their phones. Phones can use any network, including mobile data. Each player picks a name, colour and character, then taps **Ready**.
4. Click **Start the show!**

**Host controls** sit in the bottom-right bar. On smaller screens it starts collapsed; tap **Host controls** to open it. Keyboard shortcuts:

| Key | Action |
|---|---|
| Space or → | Start / next |
| P | Pause / resume |
| S | Skip the current question; on an intro or reveal, skip the rest of the round |
| H | Show / hide host controls |

By default the game waits for the host after each reveal: press **Space** / **Next ›** when everyone's ready. Turn on **Auto-advance** in setup if you prefer it to move on by itself.

**Keep the host tab visible.** Browsers slow down hidden tabs, which stalls animations and timers.

**Recovery:**
- **Host refresh or crash:** reopen `/host/room` (or click **Return to the game** on `/host`). The game resumes **paused** in the same room with the same scores. Press P to continue.
- **Player refresh, lock or Wi-Fi drop:** reopen the same link. They rejoin automatically with their score kept.
- **New game, same players:** goes back to setup and keeps the room open, so nobody has to rejoin.
- **Close room:** disconnects everyone and deletes the room data.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| "Supabase anonymous sign-in failed" | Turn on anonymous sign-ins (section 2, step 1). |
| Phones say "We couldn't find that room" | Check that `VITE_TRANSPORT=supabase` is set on the host **and** the deployed site. Local test mode only works between tabs of one browser. |
| Spotify: `INVALID_CLIENT: Invalid redirect URI` | The app uses `<the site you opened>/callback`. Add that exact URL (e.g. `https://YOUR-SITE.netlify.app/callback` and `http://127.0.0.1:5173/callback`) under Redirect URIs in the Spotify dashboard. |
| Spotify: "Check your account is added under User Management" | Add your Spotify account under your app's **User Management** (section 3.2). |
| "Spotify Premium is required" | In-browser playback needs Premium. Switch to **I'll press play in Spotify**. |
| No sound on the TV | Click anywhere on the TV page (or press a key) to unlock sound, then press **Retry music**. Check the laptop volume and that the browser tab isn't muted. Safari has limited Web Playback SDK support, so use Chrome, Edge or Firefox. |
| "No playable tracks found" | Pick a playlist you own. Spotify doesn't share the contents of other people's or Spotify-made playlists with new apps. |
| AI generation errors | "Could not reach OpenAI" or "rejected the API key": the key is wrong or revoked (OpenAI's error replies are blocked in browsers, so a bad key looks like a network error). Re-save it on `/host`. "rate limit or quota": check billing/limits on platform.openai.com. Unknown model: change the model field. You can still play with the sample pack or a saved pack. |
| Phone keeps sleeping | The app requests a screen wake lock where the browser supports it. Otherwise, raise the phone's auto-lock time. |

---

## 8. Development

```bash
pnpm dev
```

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm build
```

### Architecture

```
src/
  game/        Pure, tested game engine. The host browser is the authority.
    engine.ts    reduce(state, event, now) → { state, effects }; phases, timers, pause
    rounds/      one handler per round type (answer, buzz, bomb, bingo)
    view.ts      toPublic(): the only state sent to phones/TV, with no answers before reveal
  realtime/    Transport interface + Supabase (online) and BroadcastChannel (local) versions
  music/       MusicProvider adapters: Spotify Web Playback SDK, manual, mock synth tones
  questions/   Sample pack, pack builder, Zod schemas, validation, OpenAI client (openai.ts)
  host/        Setup wizard, host game loop (useHostGame), TV screens
  play/        Phone join form and controller
  ui/          Design tokens, SVG avatars, illustrations, hooks
supabase/
  migrations/0001_init.sql            tables, RLS, RPCs (create/join room, submit action)
```

**Fairness:**
- Phones send actions through `submit_action()`, which stamps a server time and a global sequence number. Buzz order and Fastest Finger ranking use that sequence, never phone clocks.
- The host keeps the question pack in its own memory. Phones only ever receive `PublicState`.
- Timers run on a game clock that stops while the game is paused.
- Answers still in flight when the clock hits zero get a 0.8s grace period.
- The host de-duplicates actions by sequence number. Realtime push can deliver simultaneous answers out of order, so it never drops one for arriving "late", and it polls recent actions every 1.5s as a backup. Phones show **Sending…** until the TV confirms the answer, and resend automatically if needed.

This is an original, Buzz-inspired ruleset with original art and sounds, made for private, non-commercial family use.
