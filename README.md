# asap

Dating-App, in der man konkrete Date-Ideen statt Profile likt – „Erst die Idee, dann das Date“. Arbeitstitel, vorher „dabei“.

Stand: klickbarer Prototyp mit simuliertem Backend (localStorage, Testpersonen) als Vite-Projekt. Nächster Schritt ist das echte Backend mit Supabase – siehe `docs/ROADMAP.md`.

## Loslegen (Mac)

Voraussetzungen: Git, Node.js (LTS-Version), VS Code mit der Erweiterung „Claude Code“.

```bash
cd ~/Projekte/asap-app   # Ordner, in den du das Startpaket entpackt hast
npm install              # lädt Vite (einmalig)
npm run dev              # startet die App unter http://localhost:5173
```

Test-Login: `test1@datedate.app` / `Test1234` (zweiter Account: `test2@datedate.app`). Das Entwickler-Panel (Zahnrad) setzt Daten zurück und wechselt Accounts.

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

## Arbeiten mit Claude Code

`CLAUDE.md` enthält Ziel, Struktur und Regeln; Claude Code liest die Datei automatisch. Pro Sitzung eine Aufgabe, am besten ein Issue aus `docs/ROADMAP.md`.
