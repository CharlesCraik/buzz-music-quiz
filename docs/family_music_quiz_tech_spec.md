# Family Music Quiz Party Game — Product & Technical Specification

**Working title:** Buzz-style Music Quiz  
**Status:** MVP build brief for Claude Code  
**Target:** Private family/friends game night, hosted on a laptop connected to a TV, with each player using their own phone  
**Primary goal:** Capture the fast, competitive, game-show feel of classic buzzer-based music quiz games without copying proprietary branding or assets.

---

## 1. Product vision

Build a responsive, browser-based multiplayer music quiz. One laptop acts as the host and is displayed on a TV. Players scan a QR code or enter a short room code on their phones. Their phones become personal controllers: answer buttons, buzz-in controls, player status and score.

The host screen shows the game-show presentation, audio/player status, current round, countdown, answer reveal, animations and leaderboard. A host can start, pause, skip or end a round. Players should not need to install an app or create an account.

This is a private, non-commercial family game. Use original UI, names, sounds and visual assets; do not copy Buzz! logos, character designs, exact screen layouts or other protected assets.

## 2. MVP goals

- 2–8 players in one room, with an architecture that can support more later.
- Laptop/TV host screen and phone controller screens.
- Join by QR code or room code on the same Wi-Fi network.
- Player names and optional colour/avatar selection.
- Realtime state synchronisation.
- Multiple music quiz round types.
- A clear scoring engine and end-of-game leaderboard.
- OpenAI-powered generation of structured music-trivia questions.
- Spotify connection for authorised track search/metadata and, where permitted, a clearly separated playback workflow.
- Robust handling of network interruptions, late joins, duplicate taps and host refreshes.
- No accounts, persistent profiles or cloud deployment required for the first local MVP.

## 3. Important Spotify product/policy constraint

**Do not assume Spotify is permitted to provide synchronised song clips inside the quiz UI.** Spotify's developer policies restrict synchronising Spotify recordings with visual media, broadcasting Spotify content, and commercial streaming integrations. The Web Playback SDK also requires an eligible Spotify Premium account and has browser/autoplay limitations. Confirm the current Spotify Developer Terms and policy before implementing playback.

References:
- Spotify Web Playback SDK: https://developer.spotify.com/documentation/web-playback-sdk
- Spotify Web API: https://developer.spotify.com/documentation/web-api/reference
- Spotify playback endpoint requirements: https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback
- Spotify quota modes / development access: https://developer.spotify.com/documentation/web-api/concepts/quota-modes

### Design playback as an adapter, not a hard dependency

Create a `MusicProvider` interface so the game logic is independent from any one audio source.

**Provider A — Manual Spotify companion mode (safe fallback for MVP):**
- Host connects Spotify for track search and metadata where API access permits.
- The host launches or controls the Spotify app separately, following Spotify's rules.
- Host manually starts/stops playback and advances the quiz when ready.
- The game must not extract, record, download, or manipulate Spotify audio.
- Do not claim that Spotify playback is officially supported until validated against current terms and app access.

**Provider B — Licensed/local audio clips (preferred for fully automated clip rounds):**
- Support audio files the user has the rights to use, or a licensed provider that explicitly permits this use.
- Keep audio in its original form and comply with licence requirements.
- Store only file references and metadata in the question bank; do not bundle unlicensed music.
- Provide a local development fixture with synthetic tones or royalty-free sample audio for testing.

**Provider C — Spotify Web Playback SDK (experimental, feature-flagged):**
- Only implement after confirming the intended use complies with current Spotify policies.
- OAuth must be secure; never put a client secret in frontend code.
- Expect Premium eligibility, allowlist/development-mode limitations, token expiry, browser autoplay restrictions and device-transfer issues.
- Keep this behind `ENABLE_SPOTIFY_WEB_PLAYBACK=false` by default.
- If policy or access blocks the experience, fall back to Provider A or B without breaking the game.

Do not scrape Spotify, use unofficial APIs, download tracks, or use preview URLs unless current Spotify terms explicitly permit the intended use.

## 4. Recommended technical stack

Choose a straightforward TypeScript stack with a small number of services.

### Frontend
- Next.js (App Router) + TypeScript.
- React.
- Tailwind CSS for responsive styling.
- Framer Motion or CSS animations for transitions.
- Socket.IO client for realtime game events.
- Zod for validating API payloads.
- QR code component for room joining.

### Backend
- Next.js server routes for setup/admin and API calls.
- A dedicated Node.js Socket.IO server for realtime multiplayer, or a single custom Next.js server if this is reliable in the chosen deployment. Prefer a dedicated server for a local LAN host.
- In-memory game state for the MVP, with a serialisable state model and optional JSON persistence for recovery.
- SQLite is optional if a persistent question library/history is wanted. Avoid adding Supabase until online play or cross-session accounts are actually needed.

### Integrations
- OpenAI API through server-side code only.
- Spotify OAuth/API via a server-side integration where permitted.
- Never expose API keys or OAuth client secrets to browser clients.
- `.env.local` for secrets; include `.env.example` with placeholders.

### Hosting
- The laptop runs the app and is the authoritative game host.
- Bind the server to the LAN interface and display a local address such as `http://192.168.x.x:3000`.
- Phones must be on the same Wi-Fi network. Display a QR code containing the laptop's reachable LAN URL and room code.
- Provide setup instructions for macOS and Windows.
- Explain that some guest Wi-Fi networks isolate devices; in that case use a normal home network or later add hosted deployment.
- Do not make local development depend on a public server.

## 5. Player experience and screens

### 5.1 Host setup
1. Open the app on the laptop.
2. Choose game length, categories, round order and music provider.
3. Connect/validate any configured provider.
4. Create a room.
5. Show a large QR code and short room code.
6. Players join from their phones.
7. Host locks the lobby and starts the game.

### 5.2 Lobby / join screen
**TV:**
- Game title and short instructions.
- QR code and room code.
- Player cards as players join.
- Ready indicators.
- Host-only Start button.
- Clear connection status.

**Phone:**
- Enter room code or open QR link.
- Enter a display name.
- Choose a colour/avatar.
- Tap Join/Ready.
- Wait screen with player list and rules.

Reject duplicate names only if necessary; otherwise distinguish duplicates with a small number. Sanitize names and cap their length.

### 5.3 TV host/game screen
- 16:9-first layout that remains usable on a laptop.
- Large readable text from across a room.
- Round title, round number and progress.
- Track/artist information only when it is safe to reveal.
- Playback status, timer and question prompt.
- Answer options and buzz-in order where relevant.
- Player scores and status.
- Round transition animations.
- Pause, resume, replay (where permitted), skip and end-game host controls.
- Host-only controls must never appear as actionable controls on player phones.

### 5.4 Phone controller screen
- Big touch targets; no hover-only interactions.
- Player name, colour, current score and connection state.
- Four large answer buttons for multiple-choice rounds.
- One large Buzzer button for reaction rounds.
- Clear state messages: waiting, locked in, correct, incorrect, too late, round over.
- Disable controls when the player has answered, the timer has ended or the host has paused.
- Vibration feedback where supported, but never rely on it.
- Keep screen awake where browser support allows; do not make this a requirement.

### 5.5 Results screen
- Winner podium / top three.
- Full leaderboard with score totals.
- Correct-answer and round summaries.
- Optional funniest/worst-luck round labels, but avoid inventing performance statistics.
- Play again, return to lobby or end session.

## 6. Game modes and round rules

Build the round engine so rounds are modular. For MVP, implement these six round types first, then add more once the core multiplayer loop is stable.

### Round A — Multiple Choice
- A question and four options are displayed.
- Players answer on their phones.
- Each player may answer once.
- A correct answer scores a configurable fixed amount, e.g. 100 points.
- Optional speed bonus can be enabled; keep it off by default to make scoring transparent.
- Reveal the answer once everyone has answered or the timer expires.

### Round B — Name That Tune
- A licensed/local clip or permitted playback source plays.
- Players tap Buzzer when they know the answer.
- Server records the first valid buzz and locks out other players (configurable).
- First player gets a chance to answer on their phone or verbally, depending on host settings.
- Correct answer awards points; incorrect answer may lose points or allow the next player to answer.
- The game must not reveal the title/artist on the TV before the answer is locked.

### Round C — Fastest Finger
- Play a music prompt or display a music question.
- All players can buzz in.
- Server records a deterministic buzz order using server timestamps and sequence numbers.
- Award more points to earlier correct responses, or use one-buzz-one-answer rules.
- Phone timestamps must not be trusted for ordering.

### Round D — Artist or Song?
- Play a permitted track clip or use a text/music clue.
- Ask for song title, artist, decade, album or another configured field.
- Phone answer choices or typed response depending on configuration.
- Typed answers should be normalised and judged against an accepted-answer list, not by unconstrained AI during live play.

### Round E — Pass the Bomb (family party mode)
- A visible countdown/bomb indicator passes between players after a correct response.
- If time expires while a player holds it, apply a configurable penalty.
- The server controls the timer and holder; clients only display it.
- Include reduced-intensity mode without flashing or startling effects.

### Round F — Steal Points
- A question is shown to all players.
- A player buzzes in; if correct, they choose an opponent and steal a configured amount, capped at the opponent's current score.
- Incorrect answers can lock out that player and pass the opportunity to the next player.
- All transfers are validated and applied server-side.

### Later rounds
- Gradual reveal: clues/options are revealed in stages; earlier correct answers score more.
- Category pick: players select a category.
- Decade challenge: identify music from a chosen decade.
- Playlist challenge: host selects a prepared playlist/category.
- Team mode for larger family groups.

### Configurable game settings
- Number of rounds: 4, 6 or 8.
- Round duration: configurable, default 15–25 seconds depending on round.
- Points per correct answer.
- Wrong-answer penalty.
- Allow/deny steals.
- Number of attempts.
- Music categories, decades and difficulty.
- Randomised or fixed round order.
- Accessibility mode: longer timers, reduced motion and high contrast.

Do not describe the implementation as an exact reproduction of the original game's rules unless each round has been verified. Treat the above as an original Buzz-inspired ruleset.

## 7. Multiplayer architecture

The server is authoritative. Clients send actions; they do not determine scores, correct answers, timers or buzz order.

### Room lifecycle
`LOBBY -> COUNTDOWN -> ROUND_INTRO -> QUESTION_ACTIVE -> REVEAL -> ROUND_RESULTS -> NEXT_ROUND -> GAME_RESULTS -> LOBBY/CLOSED`

Represent the current phase as a typed enum. Enforce allowed transitions on the server.

### Suggested Socket.IO events

**Client to server**
- `room:create`
- `room:join`
- `player:ready`
- `host:start-game`
- `host:pause-game`
- `host:resume-game`
- `host:skip-question`
- `host:end-game`
- `player:submit-answer`
- `player:buzz`
- `player:choose-target`
- `host:playback-status`
- `host:next-question`

**Server to client**
- `room:created`
- `room:state`
- `room:player-joined`
- `room:player-left`
- `game:started`
- `round:started`
- `question:started`
- `question:locked`
- `player:answered`
- `player:buzzed`
- `question:revealed`
- `score:updated`
- `round:ended`
- `game:ended`
- `host:error`
- `connection:status`

Use acknowledgements for join, answer and buzz requests so the UI can show whether an action was accepted. Validate every payload with Zod. Rate-limit buzz/answer events and reject events from non-members or non-hosts.

### Fairness and reliability
- Server time is authoritative.
- The server starts and ends timers; client countdowns are display-only.
- Use monotonically increasing event sequence numbers per room.
- Ignore duplicate answer submissions and duplicate buzzes.
- Never send correct answers to clients before reveal.
- Do not send hidden answer metadata in a question payload.
- On reconnect, restore the player's room and send a fresh public state snapshot.
- If the host disconnects, pause the game and offer a host-reconnect flow.
- If a player disconnects, retain their score and mark them disconnected for a grace period.
- Prevent multiple host sockets from creating conflicting game state.
- Make host actions idempotent where practical.

## 8. OpenAI question generation

Call OpenAI only from the backend. Generate question packs before a game or between rounds, not on every live question. This avoids delays and rate-limit failures during play.

Official documentation: https://developers.openai.com/api/docs/guides/structured-outputs

### Generation inputs
- Category: pop, rock, indie, dance, hip-hop, soul, country, musical theatre, film soundtracks, etc.
- Decade or year range.
- Difficulty: easy, medium, hard.
- Question type.
- Number of questions.
- Optional family-friendly setting.
- Optional user-provided playlist/track metadata, if obtained lawfully through the provider.

### Required output schema
Each generated question should contain:
- `id`
- `category`
- `difficulty`
- `questionType`
- `prompt`
- `options`: exactly four options for multiple-choice questions
- `correctOptionId`
- `acceptedAnswers`: normalised accepted strings for typed answers
- `explanation`: short answer explanation
- `trackTitle`: nullable
- `artist`: nullable
- `releaseYear`: nullable
- `spotifyUri`: nullable metadata reference only, if available and permitted
- `sourceNotes`: concise basis for verification, not presented as proof unless independently checked

Use strict structured output/schema validation. Ask the model to avoid uncertain claims, ambiguous wording, duplicate options and questions where more than one option could be correct. The model can still hallucinate, so schema-valid output is not automatically factually correct.

### Validation pipeline
1. Validate schema and required fields.
2. Check options are unique after normalisation.
3. Check the correct option exists.
4. Reject blank or excessively long prompts.
5. Reject repeated questions within the same pack and recently used questions.
6. If track metadata is provided, ensure question fields are consistent with it.
7. Mark generated questions as `unverified` unless independently checked.
8. Allow host to preview/edit a pack before starting.
9. Cache successful packs in local storage/database so the game can continue if OpenAI becomes unavailable.

### Important distinction
Use Spotify for metadata/search where authorised; use OpenAI to write questions. Do not treat model-generated music facts as authoritative. For high confidence, verify factual fields against trustworthy sources or curated data. Never ask the AI to identify a song from audio unless the selected API explicitly supports that use and the user has the necessary rights.

### Example question
- Category: 1990s pop
- Difficulty: easy
- Prompt: “Which artist released the song [example track]?”
- Options: four plausible artists
- Correct option: one validated answer
- Explanation: one concise sentence

Use fictional/sample questions in development fixtures until real questions are verified.

## 9. Spotify integration design

Create a provider interface such as:

```ts
interface MusicProvider {
  connect(): Promise<ProviderConnectionState>;
  searchTracks(query: string): Promise<TrackMetadata[]>;
  getTrackMetadata(id: string): Promise<TrackMetadata | null>;
  getPlaybackStatus(): Promise<PlaybackStatus>;
  play?(trackId: string): Promise<PlaybackCommandResult>;
  pause?(): Promise<PlaybackCommandResult>;
  seek?(positionMs: number): Promise<PlaybackCommandResult>;
}
```

Optional methods must be capability-checked; never assume every provider supports playback.

### Track metadata model
- `provider`
- `providerTrackId`
- `uri`
- `title`
- `artists`
- `album`
- `releaseDate` if returned
- `durationMs` if returned
- `externalUrl` if returned
- `artworkUrl` only if display is permitted
- `playbackCapabilities`

### OAuth/security
- Use the appropriate OAuth flow recommended by Spotify for the app architecture.
- Store refresh/access tokens server-side or in a secure, appropriate session store.
- Never log tokens.
- Never expose client secrets in browser bundles.
- Request the minimum scopes needed.
- Implement expiry, revocation and reconnect states.
- Clearly explain when Premium or developer allowlisting is required.
- Show an informative fallback when the API is unavailable or the account lacks access.

### Spotify app-development limitations
Spotify development-mode apps may have user allowlist and account requirements, and access rules can change. Do not assume all family members can authenticate with one app. Prefer a single host-controlled integration if allowed, and make the provider optional.

## 10. Data model

The MVP can use in-memory room state plus optional SQLite persistence.

### `GameRoom`
- `id`
- `roomCode`
- `hostPlayerId`
- `phase`
- `settings`
- `currentRoundIndex`
- `currentQuestionIndex`
- `createdAt`
- `updatedAt`

### `Player`
- `id`
- `roomId`
- `displayName`
- `colour`
- `avatarId`
- `score`
- `isReady`
- `isConnected`
- `joinedAt`
- `lastSeenAt`

### `Round`
- `id`
- `roomId`
- `roundType`
- `roundIndex`
- `settings`
- `status`

### `Question`
- `id`
- `category`
- `difficulty`
- `questionType`
- `prompt`
- `options`
- `correctOptionId`
- `acceptedAnswers`
- `explanation`
- `trackMetadata`
- `verificationStatus`
- `createdAt`

### `AnswerSubmission`
- `id`
- `roomId`
- `questionId`
- `playerId`
- `submittedOptionId`
- `isCorrect`
- `serverReceivedAt`
- `pointsAwarded`

### `BuzzEvent`
- `id`
- `roomId`
- `questionId`
- `playerId`
- `serverReceivedAt`
- `sequenceNumber`
- `accepted`

### `ScoreEvent`
- `id`
- `roomId`
- `playerId`
- `reason`
- `delta`
- `createdAt`

Store score changes as auditable events or calculate them centrally to prevent inconsistent totals. Do not persist OAuth secrets or unnecessary personal data in game tables.

## 11. API routes

Possible server endpoints:
- `POST /api/rooms` — create room.
- `GET /api/rooms/:roomCode` — return safe public room state.
- `POST /api/questions/generate` — generate a question pack.
- `POST /api/questions/validate` — validate a proposed pack.
- `GET /api/music/search?q=...` — search metadata through the configured provider.
- `GET /api/music/connect` — begin OAuth flow if enabled.
- `GET /api/music/callback` — OAuth callback.
- `POST /api/music/disconnect` — revoke/clear the connection.
- `GET /api/health` — local health check.

All host-only actions must verify host identity. Do not expose answer keys through public room endpoints.

## 12. Visual and audio design

Aim for a lively, modern TV game show:
- Dark stage-like background with bright colour accents.
- Bold typography and oversized scores.
- High-contrast player colours.
- Large countdown and clear answer reveal.
- Simple animated equaliser or sound-wave motif where appropriate.
- Punchy transitions, short stings and original sound effects.
- No visual clutter; the TV should be readable from several metres away.
- Phone UI should feel like a dedicated buzzer controller rather than a miniature TV screen.

Create original branding and assets. Do not use Buzz! character art, logos, sounds, or copied proprietary screens.

Accessibility:
- Support colour-independent labels/icons.
- Provide reduced-motion and high-contrast settings.
- Avoid relying on audio cues alone.
- Let the host increase timers and turn off flashing effects.
- Ensure text remains legible on a TV.

## 13. Security and privacy

- Keep OpenAI and Spotify secrets on the server.
- Validate all client messages.
- Use cryptographically random room codes/IDs where appropriate.
- Prevent arbitrary clients from using host controls.
- Apply rate limits to joins, buzzes, answer submissions and AI generation.
- Avoid collecting emails, dates of birth or other personal data.
- Clear room data after the session unless the host opts into local history.
- Provide a “close room and clear data” control.
- Do not store raw audio or record players.
- Document that LAN play requires devices to be on a network that permits device-to-device traffic.

## 14. Error states to handle

- Phone cannot reach laptop.
- Invalid or expired room code.
- Room is full or game already started.
- Duplicate player name.
- Host refresh/disconnect.
- Player refresh/disconnect.
- Spotify not connected, token expired, Premium unavailable, playback blocked or device unavailable.
- OpenAI API key missing, rate limit, timeout, invalid response or factual validation failure.
- Audio source unavailable.
- Question pack exhausted.
- Player buzzes after lockout or submits multiple answers.
- Timer expires during a network interruption.

Every error should give the host a plain-English explanation and a next action. Do not leave the game in an unrecoverable state.

## 15. Build plan for Claude Code

Work in small, testable phases. Do not try to build every integration and round at once.

### Phase 0 — Project foundation
- Inspect the repository and report existing stack/conventions before making changes.
- Create a concise implementation plan and file structure.
- Scaffold TypeScript app, linting, formatting, environment validation and basic tests.
- Add `.env.example` and a README.
- Verify the app runs locally.

**Acceptance:** clean startup, no secrets in source, basic lint/typecheck passes.

### Phase 1 — Local room and phone joining
- Create room and short room code.
- Generate QR code containing the laptop LAN URL and room code.
- Build lobby on TV and join form on phones.
- Implement player list, ready state and host permissions.
- Add Socket.IO synchronisation and reconnect snapshots.

**Acceptance:** four phones can join one laptop-hosted room on the same Wi-Fi and see state changes in realtime.

### Phase 2 — Game engine
- Implement authoritative room state machine.
- Implement Multiple Choice and Fastest Finger.
- Add server-controlled timers, answer locking, scoring and results.
- Build the leaderboard and game-end screen.
- Add deterministic tests for score calculations and phase transitions.

**Acceptance:** a full game can be played using sample questions without Spotify or OpenAI.

### Phase 3 — Question packs and OpenAI
- Define Zod schemas and OpenAI structured-output schema.
- Generate packs in advance, validate them and cache them.
- Add category/difficulty settings and host preview.
- Add fallback sample pack when API credentials are absent.
- Keep secrets server-side.

**Acceptance:** a valid pack can be generated and used; invalid/duplicate questions are rejected; the game still works without OpenAI.

### Phase 4 — Music provider abstraction
- Define `MusicProvider` interface and a mock provider.
- Add Spotify OAuth/search metadata only after checking current requirements.
- Implement host connection status and useful failure messages.
- Keep actual Spotify playback behind a feature flag until policy and access are confirmed.
- Add a licensed/local audio provider interface for permitted clip playback.

**Acceptance:** the quiz works with the mock provider and can degrade gracefully if music integrations are unavailable.

### Phase 5 — Additional rounds and polish
- Add Name That Tune for a permitted audio source, Artist or Song, Pass the Bomb and Steal Points.
- Improve transitions, sound effects, TV readability and phone haptics.
- Add pause/resume, skip, replay where permitted, accessibility settings and host recovery.
- Add event logs for debugging without logging secrets.

**Acceptance:** all rounds have clear rules, deterministic scoring and end-to-end tests.

### Phase 6 — Family game-night testing
Test with a laptop plus a mix of iPhones and Android phones:
- 2, 4, 6 and 8 players.
- Slow Wi-Fi and one phone temporarily disconnecting.
- Host refresh/reconnect.
- Rapid simultaneous buzzes.
- Repeated taps.
- Long names and duplicate names.
- Missing API keys and offline question cache.
- Spotify unavailable / playback not permitted.
- Full game from lobby through results and replay.

Fix bugs and prioritise reliability over extra features.

## 16. Testing requirements

Unit tests:
- Scoring for each round.
- Accepted-answer normalisation.
- Phase transition validation.
- Timer expiry and lockout.
- Point steals cannot take more than the target's score.
- Bomb holder and timeout penalties.
- Host-only permission checks.
- Duplicate event idempotency.

Integration tests:
- Room creation/join/leave.
- Reconnect and room state restoration.
- Answer and buzz event ordering.
- Question reveal does not leak the answer early.
- OpenAI malformed/failed response fallback.
- Music provider unavailable fallback.

Manual acceptance test:
1. Start the app on a laptop.
2. Open the host screen full-screen on a TV.
3. Join with at least four phones using the QR code.
4. Play at least four round types.
5. Confirm all devices show the same round and scores.
6. Disconnect and reconnect one phone.
7. Finish the game and verify the final leaderboard.
8. Start another game without restarting the server.

## 17. MVP exclusions

Do not build these unless the core game is already reliable:
- User accounts or public matchmaking.
- Online play across different homes.
- Native iOS/Android apps.
- Complex persistent profiles or global rankings.
- Paid subscriptions or monetisation.
- AI audio recognition.
- Automatic extraction of audio from Spotify.
- Unlicensed track downloads or audio storage.
- An elaborate admin dashboard.
- Exact reproduction of proprietary Buzz! presentation or assets.

## 18. Environment variables

Use server-side environment variables, with safe validation at startup:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=
ENABLE_SPOTIFY_WEB_PLAYBACK=false
PORT=3000
```

Only add variables that are actually used. Never prefix secrets with `NEXT_PUBLIC_`.

## 19. Definition of done

The MVP is complete when:
- The host can run it locally on a laptop and show it on a TV.
- Family members can join on phones through a QR code/room code.
- The host can run a complete multiplayer game with at least two round types.
- Scores and buzz order are decided by the server and synchronised in realtime.
- A generated or sample question pack can be played.
- The final leaderboard is correct.
- Disconnects and missing integrations do not crash the game.
- Spotify integration is clearly labelled as metadata, manual companion, licensed playback or experimental playback according to what is actually permitted and working.
- Setup and troubleshooting instructions are in the README.
- Tests, linting and type checks pass.

## 20. Instructions to Claude Code

Before coding:
1. Inspect the current repository, package manager and existing implementation.
2. Summarise the proposed architecture and identify any choices that conflict with the current codebase.
3. Check current Spotify developer documentation and terms before implementing any audio playback integration.
4. Ask only essential questions; otherwise choose sensible defaults and document them.
5. Implement one phase at a time and run checks after each phase.
6. Keep the core game playable without API keys by using mock music data and sample questions.
7. Never invent a successful Spotify capability. If the intended playback flow is not permitted or available, implement the provider abstraction and a compliant fallback instead.
8. Keep `README.md` updated with setup, LAN access, environment variables, API setup and troubleshooting.
