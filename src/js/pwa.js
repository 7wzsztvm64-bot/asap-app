import { icon } from './core.js';

/* =============================================================================
   PWA: App-Icon, Manifest & Offline-Cache (nur wenn über eine Web-Adresse geladen,
   z. B. GitHub Pages). Lokal per Doppelklick geöffnet passiert hier nichts.
   ============================================================================= */
const PWA = {
  CACHE: 'asap-v1',
  PIN: 'M12 2C7.6 2 4 5.5 4 9.9c0 5.6 6.6 11.4 7.3 12a1 1 0 0 0 1.4 0c.7-.6 7.3-6.4 7.3-12C20 5.5 16.4 2 12 2z',
  HEART: 'M12 13.4l-.6-.5C9.4 11.2 8.2 10.1 8.2 8.8c0-1 .8-1.8 1.8-1.8.6 0 1.2.3 1.6.7l.4.4.4-.4c.4-.4 1-.7 1.6-.7 1 0 1.8.8 1.8 1.8 0 1.3-1.2 2.4-3.2 4.1l-.6.5z',
  /** Zeichnet das App-Icon (warmer Hintergrund, Pin mit Herz) als PNG-Data-URL. */
  icon(size = 512) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const bg = g.createLinearGradient(0, 0, size, size);
      bg.addColorStop(0, '#FFF6EE'); bg.addColorStop(1, '#FFD8C4');
      g.fillStyle = bg; g.fillRect(0, 0, size, size);
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.beginPath(); g.arc(size * 0.86, size * 0.12, size * 0.3, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,181,71,.18)';
      g.beginPath(); g.arc(size * 0.08, size * 0.95, size * 0.34, 0, Math.PI * 2); g.fill();
      const s = (size * 0.64) / 20;               // Pin ist 20 Einheiten hoch
      g.save();
      g.translate(size / 2 - 12 * s, size / 2 - 12 * s + size * 0.01);
      g.scale(s, s);
      const pin = g.createLinearGradient(4, 2, 20, 22);
      pin.addColorStop(0, '#FF8456'); pin.addColorStop(1, '#E23E2A');
      g.shadowColor = 'rgba(226,62,42,.35)'; g.shadowBlur = size * 0.05; g.shadowOffsetY = size * 0.02;
      g.fillStyle = pin; g.fill(new Path2D(PWA.PIN));
      g.shadowColor = 'transparent';
      g.fillStyle = '#FFFFFF'; g.fill(new Path2D(PWA.HEART));
      g.restore();
      return c.toDataURL('image/png');
    } catch (e) { return null; }
  },
  setup() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const big = PWA.icon(512);
      const base = location.href.split('#')[0];
      const manifest = {
        name: 'asap – Erst die Idee, dann das Date', short_name: 'asap', lang: 'de',
        start_url: base, scope: base.replace(/[^/]*$/, ''), display: 'standalone', orientation: 'portrait',
        background_color: '#FFF7EF', theme_color: '#FFF7EF',
        icons: big ? [{ src: big, sizes: '512x512', type: 'image/png', purpose: 'any' }] : [],
      };
      const m = document.createElement('link');
      m.rel = 'manifest';
      m.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
      document.head.appendChild(m);
      // Offline-Cache: liegt eine sw.js neben dieser Datei, wird sie genutzt – sonst passiert nichts.
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
          .then(() => (window.caches ? caches.open(PWA.CACHE).then(c => c.add(base)) : null))
          .catch(() => { /* optional */ });
      }
    } catch (e) { /* optional */ }
  },
};

export { PWA };
