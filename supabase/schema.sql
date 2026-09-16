-- Listas compartidas Casa Ley — correr en Supabase SQL Editor.
-- Guarda SOLO productos + display. Jamás session/tokens (CustomerID, token_web, WebId).

create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  branch text,
  store_name text,
  creator_name text, -- solo nombre de pila, opcional
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

-- Migración si ya creaste la tabla antes (corre una vez):
-- alter table lists add column if not exists creator_name text;
