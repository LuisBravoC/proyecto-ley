import { createClient } from '@supabase/supabase-js';

// Config en web/.env.local (ver .env.example). Sin esto la app sigue
// funcionando en modo link local (legado).
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (url && key) ? createClient(url, key) : null;
export const backendReady = !!supabase;
