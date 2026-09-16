import { shareTotal, type ShareV1 } from './share';
import { backendReady, supabase } from './supabase';

export { backendReady };

// Código corto: 6 chars sin ambigüedad (sin 0/O/1/I).
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode(n = 6): string {
  let s = '';
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  for (const x of a) s += ABC[x % ABC.length];
  return s;
}

export function isShortCode(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9]{4,10}$/.test(s.trim());
}

export function defaultLabel(): string {
  const f = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  return `Súper ${f}`;
}

// Guarda una foto del carrito tal como está. Devuelve el código corto.
export async function saveListOnline(share: ShareV1, label?: string): Promise<string> {
  if (!supabase) throw new Error('Backend no configurado.');
  const row = {
    branch: share.b || null,
    store_name: share.n || null,
    creator_name: share.by || null,
    label: label?.trim() || null,
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

export interface SnapshotMeta {
  label: string | null;
  savedAt: string | null;
}

export async function loadListOnline(
  code: string,
): Promise<{ share: ShareV1; meta: SnapshotMeta }> {
  if (!supabase) throw new Error('Backend no configurado.');
  const { data, error } = await supabase
    .from('lists')
    .select('share,label,created_at')
    .eq('code', code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('código no encontrado o expirado');
  return {
    share: data.share as ShareV1,
    meta: {
      label: (data.label as string | null) ?? null,
      savedAt: (data.created_at as string | null) ?? null,
    },
  };
}
