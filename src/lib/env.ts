// IMPORTANT: always read env vars as `import.meta.env.VITE_NAME` directly.
// Assigning `import.meta.env` to a variable makes Vite embed the WHOLE env
// object (every VITE_* value, secrets included) into the public bundle.

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export const env = {
  // Local (same-browser tabs) mode is a dev-only convenience. Deployed builds always use
  // Supabase when it is configured, whatever VITE_TRANSPORT says.
  transport: ((!import.meta.env.DEV && supabaseUrl && supabaseAnonKey) ||
  import.meta.env.VITE_TRANSPORT === 'supabase'
    ? 'supabase'
    : 'local') as 'supabase' | 'local',
  supabaseUrl,
  supabaseAnonKey,
  // Always the current site's /callback, so one build works locally and on Netlify.
  // Both URLs must be listed under Redirect URIs in the Spotify dashboard.
  spotifyRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/callback` : '',
  spotifyWebPlayback: import.meta.env.VITE_ENABLE_SPOTIFY_WEB_PLAYBACK !== 'false',
};

export const hasSupabase = () => !!(env.supabaseUrl && env.supabaseAnonKey);
