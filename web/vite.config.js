import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function shortSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

// Id único por build para detectar versión nueva desde la app.
const SHA = shortSha();
const STAMP = Date.now();
const BUILD_ID = `${SHA}-${STAMP}`;
const BUILD_LABEL = SHA;

// Emite dist/version.json para que la app compare su versión con la publicada.
function versionFile() {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ id: BUILD_ID, time: new Date().toISOString() }),
      });
    },
  };
}

// base './' → funciona con cualquier nombre de repo en GitHub Pages.
// Hash routing (#/c/...) → no necesita reescritura del servidor.
export default defineConfig({
  plugins: [react(), versionFile()],
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __BUILD_LABEL__: JSON.stringify(BUILD_LABEL) },
});
