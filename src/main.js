/* Einstiegspunkt: lädt Styles, startet die App. */
import './styles/app.css';
import { html } from './js/core.js';
import { DataService } from './js/dataService.js';
import { App, UI } from './js/uiCore.js';
import { PWA } from './js/pwa.js';

// Zum Debuggen in der Browser-Konsole (nur im Entwicklungsmodus): asap.DataService.dev.stats()
if (import.meta.env.DEV) window.asap = { App, DataService };

if (import.meta.env.PROD) PWA.setup();
App.boot().catch(err => {
  console.error('[asap] Start fehlgeschlagen:', err);
  const views = document.getElementById('views');
  if (views) views.innerHTML = String(html`<section class="view">${UI.empty({ emoji: '⚠️', title: 'Die App konnte nicht starten', text: (err && err.message) || 'Unbekannter Fehler.' })}</section>`);
});
