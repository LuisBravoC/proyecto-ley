import { shareTotal } from './share.js';
import { backendReady, supabase } from './supabase.js';

export { backendReady };

// Código corto: 6 chars sin ambigüedad (sin 0/O/1/I).
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode(n = 6) {
  let s = '';
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  for (const x of a) s += ABC[x % ABC.length];
  return s;
}

export function isShortCode(s) {
  return typeof s === 'string' && /^[A-Za-z0-9]{4,10}$/.test(s.trim());
}

export async function saveListOnline(share) {
  if (!supabase) throw new Error('Backend no configurado.');
  const row = {
    branch: share.b || null,
    store_name: share.n || null,
    share,
    item_count: share.p.length,
    est_total: Math.round(shareTotal(share) * 100) / 100,
  };
  for (let i = 0; i < 5; i++) {
    const code = genCode();
    const { error } = await supabase.from('lists').insert({ ...row, code });
    if (!error) return code;
    if (error.code !== '23505') throw error; // reintenta solo en colisión
  }
  throw new Error('No pude generar código, reintenta.');
}

export async function loadListOnline(code) {
  if (!supabase) throw new Error('Backend no configurado.');
  const { data, error } = await supabase
    .from('lists').select('share').eq('code', String(code).trim().toUpperCase()).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('código no encontrado o expirado');
  return data.share;
}
