import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Id único por build para detectar versión nueva desde la app.
// En Actions usa el commit sha; local dice 'dev'.
const BUILD_ID = `${process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'dev'}-${Date.now()}`;

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
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
});
