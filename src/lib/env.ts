const e = import.meta.env;

export const env = {
  // Local (same-browser tabs) mode is a dev-only convenience. Deployed builds always use
  // Supabase when it is configured, whatever VITE_TRANSPORT says.
  transport: (!e.DEV && e.VITE_SUPABASE_URL && e.VITE_SUPABASE_ANON_KEY
    ? 'supabase'
    : e.VITE_TRANSPORT === 'supabase'
      ? 'supabase'
      : 'local') as 'supabase' | 'local',
  supabaseUrl: (e.VITE_SUPABASE_URL as string | undefined) ?? '',
  supabaseAnonKey: (e.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  spotifyClientId: (e.VITE_SPOTIFY_CLIENT_ID as string | undefined) ?? '',
  // Always the current site's /callback, so one build works locally and on Netlify.
  // Both URLs must be listed under Redirect URIs in the Spotify dashboard.
  spotifyRedirectUri: typeof window !== 'undefined' ? `${window.location.origin}/callback` : '',
  spotifyWebPlayback: e.VITE_ENABLE_SPOTIFY_WEB_PLAYBACK !== 'false',
};

export const hasSupabase = () => !!(env.supabaseUrl && env.supabaseAnonKey);
export const hasSpotify = () => !!env.spotifyClientId;
