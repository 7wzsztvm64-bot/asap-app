#!/usr/bin/env bash
# Legt die Issues einer Phase aus docs/ROADMAP.md auf GitHub an: scripts/create-issues.sh 2  (Standard: Phase 1)
# Voraussetzung: gh ist installiert und angemeldet (gh auth login).
# Bereits vorhandene Issues mit gleichem Titel werden übersprungen – das Skript darf also mehrfach laufen.
set -euo pipefail
cd "$(dirname "$0")/.."

gh auth status >/dev/null 2>&1 || { echo "Bitte zuerst anmelden: gh auth login"; exit 1; }

PHASE="${1:-1}"
LABEL="phase-$PHASE"
PHASE_NAME=$(grep -E "^## Phase $PHASE " docs/ROADMAP.md | head -1 | sed -E "s/^## Phase $PHASE – //; s/ – Issues.*//")
gh label create "$LABEL" --color 5B3CC4 --description "Phase $PHASE · $PHASE_NAME" --force >/dev/null

existing=$(gh issue list --state all --limit 200 --json title --jq '.[].title')

# Nur die nummerierten Zeilen im Abschnitt „Phase N – … Issues …“
sed -n "/^## Phase $PHASE /,/^## /p" docs/ROADMAP.md | grep -E '^[0-9]+\. \*\*' | while IFS= read -r line; do
  num=$(sed -E 's/^([0-9]+)\..*/\1/' <<<"$line")
  name=$(sed -E 's/^[0-9]+\. \*\*([^*]+)\*\*.*/\1/' <<<"$line")
  goal=$(sed -E 's/^[0-9]+\. \*\*[^*]+\*\* – (.*) \*Fertig[^*]*, wenn .*/\1/' <<<"$line")
  # „Fertig (Ende Phase 2), wenn …“ → Zusatz in Klammern bleibt erhalten
  done_when=$(sed -E 's/.*\*Fertig( \([^)]*\))?, wenn (.*)\*$/\2\1/' <<<"$line")
  title="$num · $name"

  if grep -qxF "$title" <<<"$existing"; then
    echo "übersprungen (gibt es schon): $title"
    continue
  fi

  body=$(printf '## Ziel\n%s\n\n## Fertig, wenn …\n- [ ] %s\n- [ ] `npm run build` ohne Fehler\n- [ ] Hauptablauf im Browser geprüft (Login → liken → Chat)\n\n_Aus docs/ROADMAP.md, Phase %s._\n' "$goal" "$done_when" "$PHASE")
  gh issue create --title "$title" --body "$body" --label "$LABEL" >/dev/null
  echo "angelegt: $title"
done
