import { env, hasSupabase } from '../lib/env';
import { LocalHostTransport, LocalPlayerTransport } from './localTransport';
import { SupabaseHostTransport, SupabasePlayerTransport } from './supabaseTransport';
import type { HostTransport, PlayerTransport } from './transport';

export function isOnlineMode(): boolean {
  return env.transport === 'supabase' && hasSupabase();
}

export function createHostTransport(): HostTransport {
  return isOnlineMode() ? new SupabaseHostTransport() : new LocalHostTransport();
}

export function createPlayerTransport(): PlayerTransport {
  return isOnlineMode() ? new SupabasePlayerTransport() : new LocalPlayerTransport();
}

export * from './transport';
