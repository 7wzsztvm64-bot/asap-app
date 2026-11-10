# asap – Hinweise für Claude Code

## Projekt
- **asap** (Arbeitstitel, vorher „dabei“): Dating-App, in der man konkrete **Date-Ideen** anderer likt statt Profile. Wer eine Anfrage annimmt, hat ein Match – die Idee ist das geplante Date.
- Lern- und Portfolio-Projekt von Noah, ca. **5 Std./Woche**. Ziel: Veröffentlichung im Apple App Store Ende 2027. Start-Stadt: **Frankfurt**.
- Sprache mit Noah: **Deutsch**. Code-Kommentare Deutsch, Bezeichner (Variablen, Funktionen) Englisch.
- Projektplan mit allen Phasen und den Issues für Phase 1: `docs/ROADMAP.md`.

## Stack
- Vite 8, Vanilla JavaScript als ES-Module, kein UI-Framework.
- Backend: **Supabase** (Projekt in Region Frankfurt, eu-central-1) für Login, Datenbank, Realtime-Chat, später Datei-Speicher. Das frühere Mock-Backend ist entfernt (#10). Das jetzige Projekt ist das Entwicklungs-/Testprojekt.
- Phase 4: **Capacitor** für die iOS-App.

## Befehle
- `npm install` – Abhängigkeiten
- `npm run dev` – Entwicklungsserver (http://localhost:5173); im Browser ist `window.asap` zum Debuggen verfügbar, Entwickler-Panel mit Test-Logins nur hier
- `npm run dev:lan` – wie `dev`, aber im WLAN erreichbar (für Handys, siehe `docs/ABNAHMETEST.md`)
- `npm run build` – Produktionsbuild nach `dist/`
- `npm run preview` – Build lokal ansehen
- `npm run test:db` – spielt alle Migrationen in ein lokales Test-Postgres (PGlite) und prüft die RLS-Regeln
- `npm run test:e2e` – Browser-Test mit zwei Personen (Jonas/Mia) gegen das echte Supabase-Projekt: liken → annehmen → Match → Chat in Echtzeit, Foto-Upload mit Freigabe; nutzt das installierte Chrome (`playwright-core`), seedet vorher und nachher (`HEADED=1` zum Zuschauen)
- `npm run db:migrate` – spielt fehlende Migrationen ins echte Supabase-Projekt ein (braucht `SUPABASE_ACCESS_TOKEN` in `.env`); vorher `npm run test:db`
- `npm run db:seed` – Testpersonen in Supabase neu anlegen (alle `@datedate.app`-Konten, Passwort `Test1234`; löscht vorher die alten)
- `npm run db:auth` – Auth-Einstellungen aus `supabase/auth/` übernehmen (+ SMTP aus `.env`, falls gesetzt)
- `npm run db:query -- "SQL"` – einzelne Abfrage gegen das echte Projekt (nur lesend benutzen, Änderungen immer als Migration; `--json` für JSON-Ausgabe)

## Struktur
- `index.html` – Grundgerüst (Smartphone-Rahmen auf dem Desktop, App-Container)
- `src/main.js` – Einstieg, startet die App
- `src/styles/app.css` – alle Styles (Design-Tokens oben in `:root`)
- `src/js/core.js` – Hilfsfunktionen, `html`-Template (escaped!), Formatierung, Icons, Konstanten, Storage-Adapter
- `src/js/seed.js` – Testdaten (20 Personen + 2 Test-Logins) für `npm run db:seed` und das Entwickler-Panel; nicht im Produktionsbuild
- `src/js/dataService.js` – **einzige Datenschicht**: Supabase-Zugriff inkl. Realtime-Events; Fehler aus DB-Funktionen kommen als Code (`raise exception … message = 'CODE'`) und werden über `t('errors.CODE')` übersetzt. `DataService.dev` gibt es nur mit `npm run dev`
- `src/js/domain.js` – Fachlogik der Datenschicht (Validierung, Entfernung, Feed-Sortierung)
- `src/js/supabase.js` – Supabase-Client („Eingeloggt bleiben“ über eigenen Storage-Adapter)
- `src/js/uiCore.js` – UI-Bausteine, Toasts, Sheets, Match-Overlay, Router (`App`)
- `src/js/views*.js` – Ansichten (Auth/Onboarding, Feed/Anfragen/Profile, Chats/Dates, eigenes Profil/Dev-Panel)
- `src/js/pwa.js` – Icon, Manifest, Service Worker (nur im Produktionsbuild)
- `src/i18n/` – Übersetzungen `de.json`, `en.json` und die Funktion `t()`
- `supabase/migrations/` – SQL-Migrationen (Schema, RLS); eingespielt mit `npm run db:migrate`, bereits angewendete stehen in `supabase_migrations.schema_migrations`. Eingespielte Dateien nie ändern, sondern neue Migration anlegen
- `supabase/tests/` – Datenbank-Tests (`npm run test:db`); neue Policies hier mit einem Test absichern
- `e2e/` – Browser-Tests (`npm run test:e2e`); neue Hauptabläufe hier ergänzen
- `supabase/auth/` – Auth-Einstellungen und Mail-Vorlage (übernehmen mit `npm run db:auth`)
- Moderation: im Supabase-Dashboard unter Schema `moderation` (nicht über die API erreichbar): `open_reports` (Meldungen), `pending_photos` (Fotos zur Prüfung: Datei unter Storage → `photos` → `<owner_id>` ansehen, dann in `public.photos` `status` auf `approved`/`rejected`), `orphan_photo_files` (Dateien ohne Eintrag, unter Storage löschen)
- Fotos (#18): privater Storage-Bucket `photos` (`<user-id>/<uuid>.jpg`), Tabelle `public.photos` mit Prüfstatus; die Farb-Platzhalter in `profiles.photos` bleiben als Ersatz. Dateien lassen sich per SQL nicht löschen – nur über die Storage-API (App bzw. `db:seed`)
- `scripts/db.mjs` – Werkzeug für `db:migrate`, `db:seed`, `db:auth`, `db:query` (Supabase Management-API)
- `docs/ABNAHMETEST.md` – Checkliste für den Test mit zwei Handys (#12)
- `public/` – statische Dateien (Icon, Favicon, `sw.js`)
- `prototype/dabei-prototype.html` – ursprünglicher Single-File-Prototyp, **nur Referenz, nicht ändern**

## Regeln
1. **Datenzugriff nur über `DataService`.** Die UI greift nie direkt auf localStorage, Supabase oder `fetch` zu. Beim Umbau auf Supabase bleiben Methodennamen, Parameter und Rückgabeformen gleich; Fehler kommen als `ApiError` (mit `fields` bei Validierung).
2. **Texte über `t()`.** Jeder sichtbare Text steht in `de.json` **und** `en.json` (beide gleiche Schlüssel) und wird über `t('bereich.schluessel', { platzhalter })` genutzt – auch `aria-label`, Platzhalter und Toasts. Gespeicherte Werte (Kategorie, Budget, Tageszeit, Dauer, Geschlecht, Interessen) bleiben deutsch in der Datenbank und werden über `Label.*` bzw. die `name`/`label`-Getter aus `core.js` angezeigt; Datum/Zahlen über `Fmt`. Schleifenvariablen nie `t` nennen (verdeckt die Übersetzungsfunktion). Die Sprachwahl merkt sich `src/i18n/index.js` selbst (Gerät, keine Nutzerdaten); bei Wechsel zeichnet `App.applyLang()` neu.
3. **Kein XSS:** HTML nur über das `html`-Tagged-Template (escaped automatisch). Kein `innerHTML` mit ungeprüften Nutzerdaten.
4. **Sicherheit:** Row Level Security auf jeder Supabase-Tabelle. Niemals den `service_role`-Key im Frontend. Geheimnisse nur in `.env` (wird nicht committet).
5. **DSGVO:** Datensparsam arbeiten. „Interessiert an“ (sexuelle Orientierung) und Fotos sind sensible Daten – nur speichern, was die Funktion braucht; Löschen muss vollständig möglich sein.
6. **Zirkuläre Imports** zwischen `uiCore.js` und den `views*.js` sind gewollt. Importierte Werte deshalb nie auf oberster Modulebene benutzen, nur innerhalb von Funktionen.
7. **Kleine Schritte:** Eine Aufgabe = ein GitHub-Issue. Vor „fertig“: `npm run build` ohne Fehler und den Hauptablauf im Browser prüfen mit zwei Konten in zwei getrennten Fenstern (`test1@datedate.app` und `test2@datedate.app`, Passwort `Test1234`: liken → annehmen → Chat in Echtzeit). Am Ende kurz beschreiben, wie Noah es selbst testet.
8. **Keine neuen Abhängigkeiten** ohne kurze Begründung und Rückfrage.
9. **Commits** auf Deutsch, kurz und beschreibend; nie direkt `.env` oder Schlüssel committen.

## Arbeitsweise mit Noah (verbindlich)
1. **So weit arbeiten, wie es ohne Noah geht** – selbst ausführen (Migrationen, Seeds, Tests, Commits auf `main` + push, Issues schließen) und nach Best Practice entscheiden.
2. **Entscheidungen, die Noah treffen muss** (neue Abhängigkeiten, Kosten, Rechtliches, Produktfragen, Irreversibles): als **interaktive Auswahl** (AskUserQuestion), **eine Frage nach der anderen**, Empfehlung als erste Option.
3. **Aufgaben, die Noah selbst erledigen muss** (Konten anlegen, Dashboards, Handys): **nacheinander**, jeweils mit genauen Angaben (wo klicken, was eintragen) – die nächste erst, wenn die vorige erledigt ist.
4. Zum Testen im Browser: `npm run test:e2e` (zwei getrennte Browser-Kontexte, seedet selbst). Für Einzelprüfungen/Screenshots eigene Skripte im Scratchpad mit `playwright-core` aus `node_modules` und `channel: 'chrome'`; danach `npm run db:seed`.

## Aktueller Stand (10.11.2026)
- **Phase 0 und 1** erledigt bis auf #4 (Bestätigungs-Mail – wartet auf Brevo) und #12 (Abnahmetest mit zwei Handys, Checkliste `docs/ABNAHMETEST.md`). App komplett DE/EN (#11).
- **Phase 2:** erledigt #13 Blockieren, #14 Melden, #15 Konto löschen, #16 Datenexport, #18 Foto-Upload mit manueller Prüfung, #19 Missbrauchsschutz. #17 Passwort vergessen gebaut, Mail-Rundweg wartet auf Brevo.
- 40 DB-Tests (`npm run test:db`) und 3 Browser-Tests (`npm run test:e2e`), alle grün. Supabase-Access-Token läuft am 09.12.2026 ab (`db:*` warnt vorher).
- Neue DB-Logik immer als Migration + Test in `supabase/tests/`; danach `npm run test:db` und `npm run db:migrate`.

## Nächste Schritte (beim Start einer neuen Sitzung)
Getroffene Entscheidungen (10.11.2026): Foto-Prüfung **manuell durch Noah** im Dashboard; Browser-Tests mit `playwright-core` im Repo.
Zuerst offene Entscheidungen **nacheinander** als Auswahl stellen, dann Noahs Aufgaben **nacheinander** geben, parallel alles Übrige selbst erledigen:
- **Aufgabe A – Brevo einrichten** (Anleitung am 10.11. gegeben; danach #4 und #17 abschließen): Konto auf brevo.com → Senders: Absender „asap“ mit privater Adresse bestätigen → SMTP & API → SMTP-Schlüssel erzeugen → in `.env`: `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER_EMAIL` → dann `npm run db:auth` und Registrierung + Passwort vergessen mit Noahs Adresse testen.
- **Aufgabe B – #12 Handy-Test** nach `docs/ABNAHMETEST.md` (Variante A geht sofort, inkl. Foto-Upload; B nach Brevo).
- Danach Phase 3 (Web-Beta: Hosting, eigenes Produktions-Supabase-Projekt, siehe „Für später vermerkt“ in `docs/ROADMAP.md`). Vor der Beta klären: Foto-Pflicht (mind. ein echtes Foto?) und wie Noah über neue Fotos zur Prüfung erfährt.
