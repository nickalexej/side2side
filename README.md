# side2side

**WHOOP vs. Garmin – 1:1-Vergleich deiner Wearable-Daten.**

Du trägst ein WHOOP und ein Garmin-Gerät gleichzeitig und willst wissen, wie gut die Messungen übereinstimmen? side2side holt die Daten beider Anbieter über deren offizielle APIs und stellt sie Nacht für Nacht, Tag für Tag und Workout für Workout nebeneinander – mit Abweichung, Korrelation und Trends.

Läuft komplett lokal auf deinem Rechner. Deine Gesundheitsdaten verlassen ihn nicht (außer bei den API-Abrufen bei WHOOP und Garmin selbst).

## Was verglichen wird

| Bereich | Werte |
|---|---|
| **Nächte** | Schlafdauer, Tief-/REM-/Leichtschlaf, Wachzeit, HRV, Ruhepuls, Atemfrequenz, SpO2, Schlaf-Score, Recovery vs. Body Battery |
| **Tage** | Kalorien und Schritte (auf 24 h normiert), Ruhepuls, Max. Puls, Wochenvergleich |
| **Workouts** | Automatisches Matching per Zeitüberlappung, Dauer, Ø/Max. Puls, Kalorien, Distanz, Höhenmeter |
| **Trends** | Verlaufskurven beider Geräte für die Schlafwerte |

Besonderheiten:

- **Brustgurt als Referenz:** Hatte ein Garmin-Workout einen Pulsgurt gekoppelt, gilt Garmins Puls als Referenz. side2side zeigt dann getrennt, wie genau WHOOP gegenüber dem Gurt misst.
- **Tragposition:** Pro Nacht und Workout lässt sich festhalten, ob die Geräte am Handgelenk oder Bizeps getragen wurden. Die Auswertung trennt danach.
- **Cycle vs. Kalendertag:** WHOOP rechnet von Einschlafen bis Einschlafen (22–27 h), Garmin pro Kalendertag. Kalorien und Schritte werden deshalb auf 24 h normiert und zusätzlich wochenweise verglichen.

## Voraussetzungen

- Node.js 24 (nutzt das eingebaute `node:sqlite`)
- WHOOP-Mitgliedschaft und eine eigene App im [WHOOP Developer Dashboard](https://developer-dashboard.whoop.com)
- Garmin-Connect-Konto mit [Personal API Key](https://developer.garmin.com/gc-developer-program/personal/personal-api/)

## Einrichtung

```bash
npm install
cp .env.example .env
npm run dev   # http://localhost:3000
```

1. **Garmin:** In Garmin Connect (Web) einen Personal API Key erzeugen. Er wird nur einmal angezeigt. In `.env` als `GARMIN_API_KEY` eintragen, das gewählte Ablaufdatum als `GARMIN_API_KEY_EXPIRES`.
2. **WHOOP:** Im Developer Dashboard eine App anlegen, Redirect-URL `http://localhost:3000/api/whoop/callback` eintragen, alle `read:*`-Scopes aktivieren. Client-ID und Secret in `.env` eintragen.
3. App öffnen, **„Mit WHOOP verbinden“** klicken und bei WHOOP einloggen.
4. Zeitraum wählen und **„Daten ziehen“** klicken.

### Konfiguration (`.env`)

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `GARMIN_API_KEY` | ja | Personal API Key aus Garmin Connect |
| `GARMIN_API_KEY_EXPIRES` | nein | Ablaufdatum des Keys (`YYYY-MM-DD`), Warnung 30 Tage vorher |
| `GARMIN_STRAP_IMPORTS` | nein | Hersteller importierter Aktivitäten mit Brustgurt, kommagetrennt (z. B. `ZWIFT`) |
| `WHOOP_CLIENT_ID` | ja | Client-ID deiner WHOOP-App |
| `WHOOP_CLIENT_SECRET` | ja | Client-Secret deiner WHOOP-App |
| `WHOOP_REDIRECT_URI` | nein | Standard: `http://localhost:3000/api/whoop/callback` |
| `TIMEZONE` | nein | IANA-Zeitzone für Anzeige, Standard `Europe/Berlin` |

## Funktionsweise

- **Kein Hintergrund-Sync.** Daten werden nur auf Knopfdruck geholt. Tokens erneuern sich dabei automatisch (Garmin: 24-h-Token aus dem API-Key, WHOOP: Refresh-Token).
- **Rohdaten bleiben erhalten:** Alle API-Antworten landen in `data/compare.db` (SQLite). Daraus werden die Vergleichstabellen bei jedem Abruf neu berechnet.
- **Nachtzuordnung:** Eine Nacht zählt zum Datum des Aufwachens.
- **Rate Limits:** WHOOP erlaubt 100 Requests/Minute, side2side drosselt entsprechend. Garmin-Abrufe werden gemäß den dokumentierten Range-Limits in Blöcke aufgeteilt.

## Grenzen

- WHOOP liefert über die API nur Zusammenfassungen, keine Pulsverläufe.
- Die Garmin Personal API liefert u. a. keine Training Readiness und keine Hauttemperatur.
- Proprietäre Scores (Recovery, Body Battery, Strain, Schlaf-Score) sind nur als Trend vergleichbar.
- Ohne echte Referenzmessung (Brustgurt, Labor) zeigt ein Vergleich nur Abweichungen, nicht, welches Gerät recht hat.

## Entstehung

side2side ist in Zusammenarbeit mit [Claude](https://claude.ai) (Anthropic) entstanden: API-Analyse, Architektur und Code wurden gemeinsam mit Claude Code entwickelt, Anforderungen, Tests mit echten Daten und Entscheidungen kamen von mir.

## Hinweis

side2side ist ein privates Open-Source-Projekt und steht in keiner Verbindung zu WHOOP, Inc. oder Garmin Ltd. WHOOP und Garmin sind Marken ihrer jeweiligen Inhaber. Keine medizinische Software.

## Lizenz

[MIT](LICENSE)
