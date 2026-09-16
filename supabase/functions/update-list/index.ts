// Edge Function: update-list — actualiza una lista existente verificando
// la llave de edición (sin login). Despliegue: dashboard → Edge Functions
// → New Function "update-list" → pegar este archivo → Deploy.
// Env vars (automáticas en Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const MAX_ITEMS = 100;

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function validShare(s: unknown): s is { v: number; b?: string; n?: string; by?: string; p: unknown[][] } {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  if (o['v'] !== 1 || !Array.isArray(o['p'])) return false;
  if (o['p'].length === 0 || o['p'].length > MAX_ITEMS) return false;
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
  }
  try {
    const { code, edit_key, share, label } = (await req.json()) as {
      code?: unknown;
      edit_key?: unknown;
      share?: unknown;
      label?: unknown;
    };
    if (typeof code !== 'string' || typeof edit_key !== 'string' || !validShare(share)) {
      return new Response(JSON.stringify({ error: 'payload inválido' }), { status: 400, headers: cors });
    }
    const supa = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const upper = code.trim().toUpperCase();
    const { data: row, error: selErr } = await supa
      .from('lists')
      .select('edit_key')
      .eq('code', upper)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row?.edit_key) {
      return new Response(JSON.stringify({ error: 'código no editable (guárdalo de nuevo)' }), {
        status: 404,
        headers: cors,
      });
    }
    if ((await sha256Hex(edit_key)) !== row.edit_key) {
      return new Response(JSON.stringify({ error: 'clave incorrecta' }), { status: 403, headers: cors });
    }
    const total = Math.round(
      share.p.reduce((a: number, r) => a + Number((r as unknown[])[8] ?? 0), 0) * 100,
    ) / 100;
    const { error: upErr } = await supa
      .from('lists')
      .update({
        share,
        item_count: share.p.length,
        est_total: total,
        store_name: share.n || null,
        creator_name: share.by || null,
        label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 60) : null,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      })
      .eq('code', upper);
    if (upErr) throw upErr;
    return new Response(JSON.stringify({ ok: true, code: upper }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: cors,
    });
  }
});
