const e = import.meta.env;

export const env = {
  transport: (e.VITE_TRANSPORT === 'supabase' ? 'supabase' : 'local') as 'supabase' | 'local',
  supabaseUrl: (e.VITE_SUPABASE_URL as string | undefined) ?? '',
  supabaseAnonKey: (e.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  spotifyClientId: (e.VITE_SPOTIFY_CLIENT_ID as string | undefined) ?? '',
  spotifyRedirectUri:
    (e.VITE_SPOTIFY_REDIRECT_URI as string | undefined) ||
    (typeof window !== 'undefined' ? `${window.location.origin}/callback` : ''),
  spotifyWebPlayback: e.VITE_ENABLE_SPOTIFY_WEB_PLAYBACK !== 'false',
};

export const hasSupabase = () => !!(env.supabaseUrl && env.supabaseAnonKey);
export const hasSpotify = () => !!env.spotifyClientId;
