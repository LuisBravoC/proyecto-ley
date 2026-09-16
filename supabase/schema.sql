-- Listas compartidas Casa Ley — correr en Supabase SQL Editor.
-- Guarda SOLO productos + display. Jamás session/tokens (CustomerID, token_web, WebId).

create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  branch text,
  store_name text,
  creator_name text, -- solo nombre de pila, opcional
  label text, -- nombre de la foto ("Súper quincena"), opcional
  edit_key text, -- sha256 de la llave de edición (solo el creador la tiene)
  share jsonb not null,
  item_count int not null default 0,
  est_total numeric,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);

alter table lists enable row level security;

drop policy if exists "lists_read" on lists;
create policy "lists_read" on lists
  for select using (expires_at > now());

drop policy if exists "lists_insert" on lists;
create policy "lists_insert" on lists
  for insert with check (item_count <= 100 and expires_at > now());
-- Sin update/delete para anon: la app nunca los necesita.

create index if not exists lists_code_idx on lists (code);

-- Tiempo real para el visor (cambios de la fila llegan solos):
-- alter publication supabase_realtime add table lists;
-- (o Database → Replication → activar lists en el dashboard)

-- Migración si ya creaste la tabla antes (corre una vez):
-- alter table lists add column if not exists creator_name text;
-- alter table lists add column if not exists label text;
-- alter table lists add column if not exists edit_key text;
