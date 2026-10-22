# asap – Roadmap

Rahmen: 5 Std./Woche, Budget unter 1.000 €, Ziel App Store Ende 2027, ca. 250 Std. gesamt.
Entscheidungen: echte Fotos, Start in Frankfurt, Deutsch + Englisch, Arbeitstitel „asap“.

| Phase | Std. | Zeitraum | Abschlusskriterium |
| --- | --- | --- | --- |
| 0 · Setup | 10 | Okt 2026 | Repo, CLAUDE.md, Supabase-Projekt stehen; App läuft mit `npm run dev` |
| 1 · Echtes Backend | 80 | Okt 2026 – Feb 2027 | Zwei echte Handys können sich registrieren, matchen und chatten |
| 2 · Sicherheit & Pflichtfunktionen | 55 | Feb – Apr 2027 | Melden, Blockieren, Account löschen, 18+, Foto-Upload mit Prüfung |
| 3 · Web-Beta Frankfurt | 25 | Apr – Mai 2027 | 15–20 Testpersonen haben die App zwei Wochen genutzt |
| 4 · iOS-App (Capacitor) | 40 | Jun – Aug 2027 | TestFlight-Build läuft auf dem iPhone, inkl. Push |
| 5 · Recht & Store-Vorbereitung | 25 | Sep 2027 | Rechtstexte online, Store-Eintrag vollständig (DE + EN) |
| 6 · Review & Launch | 15 | Okt – Dez 2027 | App ist im App Store veröffentlicht |

## Phase 0 – Setup
- [x] Mac vorbereitet: Git, Node.js (LTS), VS Code + Claude Code
- [x] Repo `asap-app` auf GitHub (privat), Startpaket gepusht
- [x] `npm install` und `npm run dev` laufen
- [x] Supabase-Projekt in Region Frankfurt angelegt, `.env` aus `.env.example` erstellt
- [ ] Namensprüfung „asap“: App Store + DPMA-Markenrecherche (zurückgestellt – vor Phase 5 erledigen)
- [x] Issues für Phase 1 (unten) in GitHub angelegt (#1–#12)

## Phase 1 – Issues zum Kopieren
Jeweils: Titel – Ziel. *Fertig, wenn …*

1. **Supabase-Client einbinden** – `@supabase/supabase-js` installieren, Client in `src/js/supabase.js` aus `.env` erzeugen. *Fertig, wenn die App unverändert startet und die Verbindung im Dev-Modus prüfbar ist.*
2. **Datenbankschema anlegen** – Tabellen `profiles`, `ideas`, `likes`, `matches`, `messages`, `proposals` (+ `passes`, `blocks`, `reports`) als SQL-Migration in `supabase/migrations/`. *Fertig, wenn das Schema dem Datenmodell im Prototyp entspricht und reproduzierbar angelegt werden kann.*
3. **Row Level Security** – Policies je Tabelle: eigene Daten lesen/schreiben, fremde Profile/Ideen nur mit öffentlichen Feldern, Chats nur für Match-Beteiligte. *Fertig, wenn ein Test belegt, dass Person A keine Nachrichten fremder Matches lesen kann.*
4. **Auth umstellen** – `register`, `login`, `logout`, `getCurrentUser` auf Supabase Auth. *Fertig, wenn Registrierung mit Bestätigungs-Mail, Login und „Eingeloggt bleiben“ funktionieren und die SHA-256-Simulation entfernt ist.*
5. **Profil & Onboarding** – `updateProfile`, `completeOnboarding` auf Supabase. *Fertig, wenn das Onboarding in der Datenbank speichert und die 18+-Prüfung auch serverseitig greift.*
6. **Ideen** – `getMyIdeas`, `createIdea`, `updateIdea`, `setIdeaActive`, `deleteIdea`. *Fertig, wenn Anlegen, Bearbeiten, Pausieren und (Soft-)Löschen funktionieren.*
7. **Feed & Likes** – `getFeed` als Postgres-Funktion (Kompatibilität, Filter, Entfernung), `likeIdea`, `passIdea`, `getRequests`, `getSentLikes`, `respondToLike`. *Fertig, wenn zwei Testkonten sich gegenseitig liken und matchen können und Ablehnungen für die likende Person „offen“ bleiben.*
8. **Chat in Echtzeit** – `getMatches`, `getMessages`, `sendMessage`, `markAsRead` + Supabase Realtime für neue Nachrichten und „schreibt …“. *Fertig, wenn eine Nachricht ohne Neuladen auf dem anderen Gerät erscheint.*
9. **Terminvorschläge & Dates** – `proposeDate`, `respondToProposal`, `getMyDates`. *Fertig, wenn bestätigte Dates bei beiden unter „Dates“ erscheinen.*
10. **Simulation entfernen** – Bot-Engine raus, `seed.js` wird SQL-Seed für eine Test-Datenbank; Dev-Panel nur noch im Dev-Modus. *Fertig, wenn der Produktionsbuild keine Testpersonen mehr enthält.*
11. **Texte migrieren (laufend)** – bei jedem Issue die angefassten Texte nach `de.json`/`en.json`. *Fertig (Ende Phase 2), wenn es einen Sprachumschalter im Profil gibt und die App komplett auf Englisch nutzbar ist.*
12. **Abnahmetest mit zwei Handys** – Registrieren → Idee → Like → Match → Chat → Termin. *Fertig, wenn der Ablauf ohne Fehler durchläuft.*
