import { createClient } from '@supabase/supabase-js';

// Config en web/.env.local (ver README del repo). Sin esto la app sigue
// funcionando en modo link local (legado).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseUrl = url || '';
export const supabaseAnon = key || '';
export const supabase = url && key ? createClient(url, key) : null;
export const backendReady = supabase !== null;
