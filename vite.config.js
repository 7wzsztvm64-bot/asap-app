import { defineConfig } from 'vite';

export default defineConfig({
  base: './',          // relative Pfade: funktioniert auf GitHub Pages und später in Capacitor
  server: { port: 5173, open: true },
  build: { outDir: 'dist', target: 'es2020' },
});
