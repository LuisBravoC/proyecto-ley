// Detección de versión nueva: compara el BUILD_ID compilado contra
// version.json publicado. Si difieren, hay deploy más reciente.
// En dev (sin version.json) o file://, no hace nada.

export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

export async function checkForUpdate() {
  try {
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return false;
    const { id } = await res.json();
    return !!id && id !== BUILD_ID;
  } catch {
    return false;
  }
}
