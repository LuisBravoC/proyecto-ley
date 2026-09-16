// Detección de versión nueva: compara el BUILD_ID compilado contra
// version.json publicado. Si difieren, hay deploy más reciente.
// En dev (sin version.json) o file://, no hace nada.

declare const __BUILD_ID__: string;
declare const __BUILD_LABEL__: string;

export const BUILD_ID: string =
  typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

// Etiqueta visible (commit corto + hora del build) para identificar la compilación.
export const BUILD_LABEL: string =
  typeof __BUILD_LABEL__ !== 'undefined' ? __BUILD_LABEL__ : 'dev';

// Capacidad de hover del navegador (para diagnosticar apertura por proximidad).
export const HOVER_CAPABLE: boolean =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover)').matches;

export async function checkForUpdate(): Promise<boolean> {
  try {
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return false;
    const { id } = (await res.json()) as { id?: unknown };
    return typeof id === 'string' && id !== BUILD_ID;
  } catch {
    return false;
  }
}
