import { shareTotal, type ShareV1 } from './share';
import { backendReady, supabase, supabaseAnon, supabaseUrl } from './supabase';

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

// Llave de edición: secreta, solo vive en el navegador del creador.
const KEY_ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function genEditKey(n = 24): string {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  let s = '';
  for (const x of a) s += KEY_ABC[x % KEY_ABC.length];
  return s;
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isShortCode(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9]{4,10}$/.test(s.trim());
}

export function defaultLabel(): string {
  const f = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  return `Súper ${f}`;
}

export interface SavedOnline {
  code: string;
  editKey: string;
}

// Guarda una foto del carrito tal como está. La editKey se muestra una sola
// vez: con ella se puede actualizar el mismo código después.
export async function saveListOnline(share: ShareV1, label?: string): Promise<SavedOnline> {
  if (!supabase) throw new Error('Backend no configurado.');
  const editKey = genEditKey();
  const row = {
    branch: share.b || null,
    store_name: share.n || null,
    creator_name: share.by || null,
    label: label?.trim() || null,
    edit_key: await sha256Hex(editKey),
    share,
    item_count: share.p.length,
    est_total: Math.round(shareTotal(share) * 100) / 100,
  };
  for (let i = 0; i < 5; i++) {
    const code = genCode();
    const { error } = await supabase.from('lists').insert({ ...row, code });
    if (!error) return { code, editKey };
    if (error.code !== '23505') throw error; // reintenta solo en colisión
  }
  throw new Error('No pude generar código, reintenta.');
}

// Sobrescribe el contenido de un código (verifica la llave en el servidor).
export async function updateListOnline(
  code: string,
  editKey: string,
  share: ShareV1,
  label?: string,
): Promise<void> {
  if (!supabaseUrl || !supabaseAnon) throw new Error('Backend no configurado.');
  const res = await fetch(`${supabaseUrl}/functions/v1/update-list`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnon,
      Authorization: 'Bearer ' + supabaseAnon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code: code.trim().toUpperCase(),
      edit_key: editKey,
      share,
      label: label?.trim() || null,
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || 'HTTP ' + res.status);
  }
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

// Suscripción en vivo: avisa cuando alguien actualiza este código.
export function subscribeList(code: string, onUpdate: (share: ShareV1) => void): () => void {
  const client = supabase;
  if (!client) return () => {};
  const upper = code.trim().toUpperCase();
  const ch = client
    .channel('list-' + upper)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'lists', filter: `code=eq.${upper}` },
      (payload) => {
        const s = (payload.new as { share?: unknown }).share;
        if (s && typeof s === 'object') onUpdate(s as ShareV1);
      },
    )
    .subscribe();
  return () => {
    client.removeChannel(ch);
  };
}
