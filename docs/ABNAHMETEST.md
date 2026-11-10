# Abnahmetest mit zwei Handys (Issue #12)

Ziel: Registrieren → Idee → Like → Match → Chat → Termin läuft auf zwei echten Handys ohne Fehler.

## Vorbereitung (Mac)

1. Mac und beide Handys im **selben WLAN**.
2. Testdaten frisch anlegen: `npm run db:seed`
3. App fürs WLAN starten: `npm run dev:lan`
   Vite zeigt zwei Adressen – für die Handys gilt die Zeile **Network**, z. B. `http://192.168.0.253:5173/`
   (die IP kann sich ändern, also immer die aktuelle aus dem Terminal nehmen).
4. Fragt macOS „Eingehende Verbindungen für node erlauben?“ → **Erlauben**.
5. Adresse auf beiden Handys im Browser öffnen (Safari/Chrome). Tipp: „Zum Home-Bildschirm“ fühlt sich wie eine App an.

## Variante A – mit Testkonten (geht sofort)

| Schritt | Handy 1 (Jonas) | Handy 2 (Mia) | ✔ |
| --- | --- | --- | --- |
| Login | `test1@datedate.app` / `Test1234` | `test2@datedate.app` / `Test1234` | ☐ |
| Feed | Ideen werden angezeigt, Filter funktionieren | | ☐ |
| Like | Mias Idee „Durch den Stadtwald zum Goetheturm“ liken (am schnellsten über ihr Profil) – gern mit Nachricht | Hinweis „Jonas ist dabei!“ erscheint **ohne Neuladen** | ☐ |
| Match | | Anfragen → Annehmen → Match-Bildschirm | ☐ |
| Match | Match-Bildschirm erscheint **ohne Neuladen** | | ☐ |
| Chat | Chat öffnen, tippen | „schreibt …“ erscheint, dann die Nachricht | ☐ |
| Chat | | Antworten → bei Jonas erscheint sie sofort, „Gelesen“ unter seiner Nachricht | ☐ |
| Termin | Kalender-Symbol → Termin vorschlagen | Vorschlag erscheint im Chat → Bestätigen | ☐ |
| Termin | Hinweis „Mia hat zugesagt!“ | | ☐ |
| Dates | Date steht unter „Dates“ | Date steht unter „Dates“ | ☐ |
| Abmelden | Profil → Abmelden → wieder einloggen, alles noch da | | ☐ |

## Variante B – mit Registrierung (sobald der Mailversand eingerichtet ist)

Wie A, aber Handy 1 registriert vorher ein **neues Konto** mit einer echten E-Mail-Adresse:
Registrieren → Bestätigungs-Mail auf dem Handy öffnen → Link antippen → einloggen → Onboarding
(Name, Geburtsdatum, Profilbild …) → erste Idee anlegen → Feed ist freigeschaltet. Danach weiter wie in A.

## Wenn etwas hakt

- **Seite lädt nicht auf dem Handy:** gleiches WLAN? Firewall-Abfrage erlaubt? IP aus dem Terminal korrekt?
- **Nichts kommt in Echtzeit an:** Seite einmal neu laden; bleibt es so, Fehlermeldung/Screenshot notieren.
- **Testdaten durcheinander:** `npm run db:seed` setzt alle `@datedate.app`-Konten zurück.
- Gefundene Fehler bitte mit Handy-Modell, Browser und Schritt im Issue #12 notieren.
