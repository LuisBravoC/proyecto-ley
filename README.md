# Mi lista Casa Ley

Comparte tu carrito de [Casa Ley en línea](https://tusuper.casaley.com.mx/) con un link: la otra persona ve la lista bonita y, con su sesión, la clona a su carrito. Sin cuentas, sin fricción.

- **Ver + clonar:** `https://luisbravoc.github.io/proyecto-ley/`
- **Link corto online** (`?c=ABC123`) con Supabase; **link con datos** (`#c=…`) sin backend.
- **Tiempo real opcional:** el dueño actualiza su lista personal y los visores se refrescan solos.

## Estructura

| Carpeta/archivo | Qué es |
|---|---|
| `web/` | App React + TypeScript (Vite). Lo que se publica en Pages. |
| `extension/` | Extensión Chrome MV3: lee el carrito, abre/copia links, clona, auto-sync. |
| `ley-share.js` | Script de consola (alternativa sin extensión). |
| `viewer.html` | Visor estático legado (respaldo). |
| `supabase/` | `schema.sql` + Edge Function `update-list`. |
| `extension.zip` | Extensión empaquetada lista para descargar (regenerar si cambia `extension/`). |

El link **nunca** lleva sesión (sin `CustomerID`, `token_web`, `WebId`): solo productos, precios, tienda y nombre de pila.

## Desarrollo web

```bash
cd web
npm install
cp .env.example .env.local  # opcional: llena VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev
```

Sin `.env.local` la app funciona en modo link local. Build con chequeo de tipos: `npm run build`.

## Backend (Supabase)

1. Crea el proyecto en [supabase.com](https://supabase.com) y corre `supabase/schema.sql` en el SQL Editor (incluye tabla, RLS y Realtime; abajo del archivo van las migraciones si ya la habías creado).
2. Edge Functions → New Function `update-list` → pega `supabase/functions/update-list/index.ts` → Deploy.
3. Local: `web/.env.local` con `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (**publishable**).
4. Producción: repo → Settings → Secrets → Actions con esas dos variables.

## Extensión (desarrollo)

`chrome://extensions` → modo desarrollador → Cargar descomprimida → carpeta `extension/`. Recárgala tras cada cambio.

## Deploy

Automático: push a `main` → GitHub Actions compila `web/` y publica en Pages. `npm run deploy` (en `web/`) queda como respaldo manual.
