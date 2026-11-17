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
- `npm run db:invite -- list | create 20 "Notiz" | required on|off` – Einladungscodes der Beta (#22)
- `npm run db:notify -- setup | test | status | remove` – tägliche Moderations-Mail (#24, braucht `BREVO_API_KEY` in `.env`)
- `npm run db:backup` / `npm run db:restore-check -- <Ordner>` – Backup nach `~/asap-backups/<dev|prod>/` (30 Tage) und Prüfung per Einspielen in PGlite (#25)
- **Produktion:** alle `db:*`-Befehle mit `-- --prod` (Werte aus `.env.prod`, nicht im Repo); `db:seed` ist dort gesperrt. Ohne `--prod` immer das Testprojekt

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
- Moderation: im Supabase-Dashboard unter Schema `moderation` (nicht über die API erreichbar): `feedback_inbox` (Feedback aus der App, #26), `invite_codes` + `config` (Einladungscodes, #22), `open_reports` (Meldungen), `pending_photos` (Fotos zur Prüfung: Datei unter Storage → `photos` → `<owner_id>` ansehen, dann in `public.photos` `status` auf `approved`/`rejected`), `orphan_photo_files` (Dateien ohne Eintrag, unter Storage löschen)
- Fotos (#18): privater Storage-Bucket `photos` (`<user-id>/<uuid>.jpg`), Tabelle `public.photos` mit Prüfstatus; die Farb-Platzhalter in `profiles.photos` bleiben als Ersatz. Dateien lassen sich per SQL nicht löschen – nur über die Storage-API (App bzw. `db:seed`)
- `scripts/db.mjs` – Werkzeug für `db:migrate`, `db:seed`, `db:auth`, `db:query` (Supabase Management-API)
- `docs/ABNAHMETEST.md` – Checkliste für den Test mit zwei Handys (#12)
- `public/` – statische Dateien (Icon, Favicon, `sw.js`)
- `netlify.toml` – Build und Sicherheits-Header (CSP) für die Web-Beta auf Netlify (#21)
- `src/i18n/legal.de.json` / `legal.en.json` – Rechtstexte (Datenschutz, Nutzungsregeln, Impressum), Kontaktangaben aus `VITE_CONTACT_*`; bei wesentlichen Änderungen `LEGAL_VERSION` in `src/i18n/index.js` erhöhen
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

## Aktueller Stand (17.11.2026)
- **Phase 0 und 1** erledigt bis auf #4 (Bestätigungs-Mail) und #12 (Abnahmetest) – Brevo ist eingerichtet (`db:auth` übernommen, SMTP-Anmeldung geprüft, deutsche Vorlagen für Bestätigung und Passwort), es fehlt nur Noahs Mail-Test auf dem Handy.
- **Phase 2** erledigt bis auf #17 (Passwort vergessen – gleicher Mail-Test).
- **Phase 3** (Issues #20–#27, Entscheidungen in `docs/ROADMAP.md`): erledigt #22 Einladungscodes, #25 Backups, #26 Feedback. Technisch fertig, wartet auf Noah: #23 Rechtstexte (Entwürfe prüfen, `VITE_CONTACT_*` setzen), #24 Moderations-Mail (Brevo-API-Schlüssel). #20 erledigt: Produktionsprojekt `asap-prod` (Ref `ygcgvxeaaxpzchosirwk`, Frankfurt, Free) mit allen Migrationen, Brevo-Mails, Weiterleitung auf https://asap-beta.netlify.app, Einladungscode-Pflicht an; Security Advisor ohne echte Befunde (WARN zu security-definer-RPCs ist gewollt). Vorbereitet: #21 (`netlify.toml`, CSP lokal geprüft).
- 48 DB-Tests (`npm run test:db`) und 6 Browser-Tests (`npm run test:e2e`), alle grün. Supabase-Access-Token „asap-claude“ gilt für Test- und Produktionsprojekt und läuft am 15.02.2027 ab (`db:*` warnt vorher).
- Neue DB-Logik immer als Migration + Test in `supabase/tests/`; danach `npm run test:db` und `npm run db:migrate` (und nach #20 zusätzlich `-- --prod`).

## Nächste Schritte (beim Start einer neuen Sitzung)
Getroffene Entscheidungen: Foto-Prüfung manuell; Browser-Tests im Repo; Netlify; Produktionsprojekt Free; Einladungscodes; vorerst keine Domain; Rechtstexte-Entwurf durch Claude.
Offene Entscheidung: **Backup-Rhythmus** – wöchentlich automatisch per macOS-launchd auf Noahs Mac (Empfehlung) oder manuell mit Erinnerung.
Noahs Aufgaben **nacheinander** (die nächste erst, wenn die vorige erledigt ist):
1. **Mail-Test auf dem Handy** (#4, #17, #12 Variante B): `npm run dev:lan` → registrieren → Bestätigungs-Mail (Spam prüfen) → Onboarding → Abmelden → „Passwort vergessen“ → Konto löschen.
2. **Produktionsprojekt anlegen** (#20): supabase.com → New project, Name `asap-prod`, Region Frankfurt (eu-central-1), Free → URL und publishable/anon Key in `.env.prod` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Danach Claude: `db:migrate/auth -- --prod`, `db:invite -- required on --prod`, Codes anlegen. Außerdem im Dashboard die DPA (Organization → Legal Documents) unterschreiben.
3. **Netlify** (#21): Konto mit GitHub → Add new site → Repo `asap-app` → Site-Name `asap-beta` → Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Produktion), `VITE_CONTACT_NAME/ADDRESS/EMAIL`; DPA von Netlify anfordern.
4. **Brevo-API-Schlüssel** (#24): Brevo → SMTP & API → API Keys → Generate → `BREVO_API_KEY` in `.env` → Claude: `db:notify -- setup --prod` und `test`.
5. **Rechtstexte prüfen** (#23): `src/i18n/legal.de.json` lesen (in der App unter Profil → Rechtliches), Korrekturen an Claude.
Danach #27 Beta-Durchführung (Einladung, Anleitung, Begleitung).
