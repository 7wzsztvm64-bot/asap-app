# asap – Hinweise für Claude Code

## Projekt
- **asap** (Arbeitstitel, vorher „dabei“): Dating-App, in der man konkrete **Date-Ideen** anderer likt statt Profile. Wer eine Anfrage annimmt, hat ein Match – die Idee ist das geplante Date.
- Lern- und Portfolio-Projekt von Noah, ca. **5 Std./Woche**. Ziel: Veröffentlichung im Apple App Store Ende 2027. Start-Stadt: **Frankfurt**.
- Sprache mit Noah: **Deutsch**. Code-Kommentare Deutsch, Bezeichner (Variablen, Funktionen) Englisch.
- Projektplan mit allen Phasen und den Issues für Phase 1: `docs/ROADMAP.md`.

## Stack
- Vite 8, Vanilla JavaScript als ES-Module, kein UI-Framework.
- Aktuell: Mock-Backend im Browser (localStorage) inkl. simulierter Testpersonen.
- Phase 1: **Supabase** (Projekt in Region Frankfurt, eu-central-1) für Login, Datenbank, Realtime-Chat, Datei-Speicher.
- Phase 4: **Capacitor** für die iOS-App.

## Befehle
- `npm install` – Abhängigkeiten
- `npm run dev` – Entwicklungsserver (http://localhost:5173); im Browser ist `window.asap` zum Debuggen verfügbar
- `npm run build` – Produktionsbuild nach `dist/`
- `npm run preview` – Build lokal ansehen

## Struktur
- `index.html` – Grundgerüst (Smartphone-Rahmen auf dem Desktop, App-Container)
- `src/main.js` – Einstieg, startet die App
- `src/styles/app.css` – alle Styles (Design-Tokens oben in `:root`)
- `src/js/core.js` – Hilfsfunktionen, `html`-Template (escaped!), Formatierung, Icons, Konstanten, SHA-256, Storage-Adapter
- `src/js/seed.js` – Testdaten (20 Personen + 2 Test-Logins)
- `src/js/dataService.js` – **einzige Datenschicht**: Mock-Backend + Bot-Simulation
- `src/js/uiCore.js` – UI-Bausteine, Toasts, Sheets, Match-Overlay, Router (`App`)
- `src/js/views*.js` – Ansichten (Auth/Onboarding, Feed/Anfragen/Profile, Chats/Dates, eigenes Profil/Dev-Panel)
- `src/js/pwa.js` – Icon, Manifest, Service Worker (nur im Produktionsbuild)
- `src/i18n/` – Übersetzungen `de.json`, `en.json` und die Funktion `t()`
- `public/` – statische Dateien (Icon, Favicon, `sw.js`)
- `prototype/dabei-prototype.html` – ursprünglicher Single-File-Prototyp, **nur Referenz, nicht ändern**

## Regeln
1. **Datenzugriff nur über `DataService`.** Die UI greift nie direkt auf localStorage, Supabase oder `fetch` zu. Beim Umbau auf Supabase bleiben Methodennamen, Parameter und Rückgabeformen gleich; Fehler kommen als `ApiError` (mit `fields` bei Validierung).
2. **Texte über `t()`.** Jeder neue oder geänderte sichtbare Text kommt in `de.json` und `en.json`. Bestehende Texte einer Datei migrieren, wenn du sie ohnehin anfasst.
3. **Kein XSS:** HTML nur über das `html`-Tagged-Template (escaped automatisch). Kein `innerHTML` mit ungeprüften Nutzerdaten.
4. **Sicherheit:** Row Level Security auf jeder Supabase-Tabelle. Niemals den `service_role`-Key im Frontend. Geheimnisse nur in `.env` (wird nicht committet).
5. **DSGVO:** Datensparsam arbeiten. „Interessiert an“ (sexuelle Orientierung) und Fotos sind sensible Daten – nur speichern, was die Funktion braucht; Löschen muss vollständig möglich sein.
6. **Zirkuläre Imports** zwischen `uiCore.js` und den `views*.js` sind gewollt. Importierte Werte deshalb nie auf oberster Modulebene benutzen, nur innerhalb von Funktionen.
7. **Kleine Schritte:** Eine Aufgabe = ein GitHub-Issue. Vor „fertig“: `npm run build` ohne Fehler und den Hauptablauf im Browser prüfen (Login `test1@datedate.app` / `Test1234` → liken → Chat). Am Ende kurz beschreiben, wie Noah es selbst testet.
8. **Keine neuen Abhängigkeiten** ohne kurze Begründung und Rückfrage.
9. **Commits** auf Deutsch, kurz und beschreibend; nie direkt `.env` oder Schlüssel committen.

## Aktueller Stand
- Phase 0 (Setup) läuft. Danach Phase 1, Issues siehe `docs/ROADMAP.md`.
