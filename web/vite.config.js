import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' → funciona con cualquier nombre de repo en GitHub Pages.
// Hash routing (#/c/...) → no necesita reescritura del servidor.
export default defineConfig({
  plugins: [react()],
  base: './',
});
