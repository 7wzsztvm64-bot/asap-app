# asap

Dating-App, in der man konkrete Date-Ideen statt Profile likt – „Erst die Idee, dann das Date“. Arbeitstitel, vorher „dabei“.

Stand: Vite-Web-App mit echtem Backend (Supabase, Frankfurt): Registrierung, Onboarding, Ideen, Feed, Likes, Matches, Echtzeit-Chat und Termine. Plan und nächste Schritte: `docs/ROADMAP.md`.

## Loslegen (Mac)

Voraussetzungen: Git, Node.js (LTS-Version), VS Code mit der Erweiterung „Claude Code“.

```bash
cd ~/Projekte/asap-app   # Ordner, in den du das Startpaket entpackt hast
npm install              # lädt Vite (einmalig)
cp .env.example .env     # Supabase-URL und Keys eintragen (siehe Kommentare in der Datei)
npm run dev              # startet die App unter http://localhost:5173
```

Test-Logins: `test1@datedate.app` und `test2@datedate.app`, Passwort `Test1234` – für zwei Konten gleichzeitig ein zweites, privates Browserfenster nutzen. Das Entwickler-Panel (Zahnrad, nur mit `npm run dev`) wechselt Accounts; `npm run db:seed` setzt die Testdaten zurück.

## Mit GitHub verbinden (einmalig)

1. Auf github.com ein **neues, privates** Repo `asap-app` anlegen – **ohne** README, .gitignore oder Lizenz.
2. Im Terminal im Projektordner:

```bash
git init
git add .
git commit -m "Startpaket: Prototyp als Vite-Projekt"
git branch -M main
git remote add origin https://github.com/DEINNAME/asap-app.git
git push -u origin main
```

Beim ersten Push fragt Git nach Zugangsdaten. Gib als Benutzernamen deinen GitHub-Namen ein und als Passwort ein Personal Access Token (github.com → Settings → Developer settings → Personal access tokens).

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver mit automatischem Neuladen |
| `npm run build` | Produktionsbuild nach `dist/` |
| `npm run preview` | Produktionsbuild lokal ansehen |
| `npm run dev:lan` | Entwicklungsserver im WLAN (für Tests auf Handys) |
| `npm run test:db` | Datenbank-Tests (Migrationen + RLS) lokal |
| `npm run db:migrate` | Neue Migrationen ins Supabase-Projekt einspielen |
| `npm run db:seed` | Testpersonen in Supabase neu anlegen |
| `npm run db:auth` | Auth-Einstellungen (und Mailversand) übernehmen |

## Arbeiten mit Claude Code

`CLAUDE.md` enthält Ziel, Struktur und Regeln; Claude Code liest die Datei automatisch. Pro Sitzung eine Aufgabe, am besten ein Issue aus `docs/ROADMAP.md`.
