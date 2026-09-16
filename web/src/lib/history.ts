// Historial local de listas (sin login): todo vive en este navegador.
// Se guarda al ver, abrir o guardar una lista. Máx 20, la más reciente primero.

import { isShortCode } from './backend';
import { shareTotal, storeName, type ShareV1 } from './share';

export interface HistoryEntry {
  kind: 'online' | 'link';
  code: string; // corto (?c=) o base64 largo (#c=)
  title: string;
  count: number;
  total: number;
  when: number;
  editKey?: string; // solo en este navegador: permite actualizar el código
}

const KEY = 'ley-history';
const MAX = 20;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(list: HistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* lleno o sin acceso: se pierde el historial, no la lista */
  }
}

export function recordHistory(
  share: ShareV1,
  kind: HistoryEntry['kind'],
  code: string,
  title?: string,
  editKey?: string,
): HistoryEntry[] {
  const entry: HistoryEntry = {
    kind,
    code,
    title:
      title ||
      `${share.p.length} ${share.p.length === 1 ? 'producto' : 'productos'}` +
        (share.by ? ` · de ${share.by}` : '') +
        (storeName(share) ? ` · ${storeName(share)}` : ''),
    count: share.p.length,
    total: shareTotal(share),
    when: Date.now(),
    ...(editKey ? { editKey } : {}),
  };
  const list = [entry, ...loadHistory().filter((e) => e.code !== code)].slice(0, MAX);
  persist(list);
  return list;
}

export function removeHistory(code: string): HistoryEntry[] {
  const list = loadHistory().filter((e) => e.code !== code);
  persist(list);
  return list;
}

export function clearHistory(): HistoryEntry[] {
  persist([]);
  return [];
}

// Extrae el código crudo de un texto o URL (corto online o largo local).
export function extractCode(text: string): { kind: 'online' | 'link'; code: string } | null {
  const t = String(text || '');
  const q = t.match(/[?&]c=([A-Za-z0-9\-_]+)/);
  if (q) return { kind: isShortCode(q[1]) ? 'online' : 'link', code: q[1] };
  const h = t.match(/#c=([A-Za-z0-9\-_]+)/) || t.match(/#\/c\/([A-Za-z0-9\-_]+)/);
  if (h) return { kind: 'link', code: h[1] };
  const bare = t.trim();
  if (/^[A-Za-z0-9\-_]{20,}$/.test(bare)) return { kind: 'link', code: bare };
  if (isShortCode(bare)) return { kind: 'online', code: bare.toUpperCase() };
  return null;
}

export function codeFromLocation(): { kind: 'online' | 'link'; code: string } | null {
  return extractCode(window.location.search + ' ' + window.location.hash);
}

export function fmtFecha(when: number): string {
  return new Date(when).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
