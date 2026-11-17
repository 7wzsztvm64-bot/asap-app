import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Version für Feedback und Profil: package.json + Commit (Netlify setzt COMMIT_REF beim Build)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const APP_VERSION = `${pkg.version}+${(process.env.COMMIT_REF || 'dev').slice(0, 7)}`;

export default defineConfig({
  base: './',          // relative Pfade: funktioniert auf GitHub Pages und später in Capacitor
  server: { port: 5173, open: true },
  build: { outDir: 'dist', target: 'es2020' },
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
});
