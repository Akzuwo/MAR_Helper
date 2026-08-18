# MAR Helper

MAR Helper ist eine lokale Electron-Desktop-App für Maturaarbeiten. Arbeitsjournal, Promptprotokoll und Zeitplan sind vollständig unabhängig aktivierbar; deaktivierte Module behalten ihre Daten.

## Starten

Voraussetzung: Node.js 20 oder neuer.

```powershell
npm install
npm run dev
```

Produktions-Build und lokaler Start:

```powershell
npm start
```

Installationspaket erzeugen:

```powershell
.\build-installer.ps1
```

Das Skript erzeugt einen mehrstufigen NSIS-Installer unter `release/`. Optionen:

```powershell
# Abhängigkeiten vorher reproduzierbar neu installieren
.\build-installer.ps1 -InstallDependencies

# Anderes Windows-Ziel und schnellere lokale Iteration
.\build-installer.ps1 -Architecture arm64 -SkipTests
```

Falls die lokale PowerShell-Ausführungsrichtlinie Skripte blockiert:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-installer.ps1
```

## Qualität prüfen

```powershell
npm run typecheck
npm test
npm run build
node scripts/smoke.cjs
```

Der Smoke-Test startet die gebaute Electron-App isoliert und prüft Renderer, Preload-Bridge und grundlegendes Rendering. Ein Screenshot wird nur lokal unter `.smoke-artifacts` erzeugt.

## Daten und Sicherheit

- Die Daten liegen als atomar geschriebene JSON-Datenbank im Electron-`userData`-Ordner des Betriebssystems.
- Timerzustände werden bei Start, Pause, Fortsetzen und Beenden sofort persistiert.
- Der Renderer hat keinen Node-Zugriff; Kommunikation erfolgt ausschliesslich über eine schmale Preload-API.
- Prompt- und Antworttexte werden ohne ausführbares Benutzer-HTML durch `react-markdown` und `remark-gfm` gerendert.
- Exporte verwenden den nativen Speichern-Dialog von Electron.

## Importformat

Im Bereich **Import & Export → Daten importieren** können vollständige MAR-Helper-Backups und JSON-Exporte einzelner Module importiert werden. Eine genaue, direkt in der App verfügbare Format-Anleitung enthält Pflichtfelder und Beispiele für jedes Modul.

Unter **Einstellungen → Beta-Funktionen** kann zusätzlich der automatische Rohtext-Import aktiviert werden. Er erkennt lokal eingefügte CSV-/TSV-Tabellen, beschriftete Prompt-/Antwort-Blöcke, exportierte Prompt-Markdown-Dokumente und Markdown-Aufgabenlisten. Vor jeder Übernahme zeigt die App das erkannte Modul und die Anzahl der Einträge an. JSON bleibt das empfohlene verlustfreie Austauschformat.

Ein Modulimport verwendet dieses Format:

```json
{
  "format": "mar-helper",
  "version": 1,
  "module": "journal",
  "exportedAt": "2026-08-17T14:32:00.000Z",
  "data": []
}
```

Für `module` sind folgende Werte erlaubt:

- `journal`: `data` enthält `JournalEntry[]`
- `prompts`: `data` enthält `PromptEntry[]`
- `planner`: `data` enthält `PlannerTask[]`

Ältere Exporte, die direkt aus einem nicht leeren JSON-Array bestehen, werden ebenfalls automatisch erkannt. Bei leeren Arrays ist das Formatobjekt notwendig, damit das Modul eindeutig bestimmt werden kann. Vollständige Backups entsprechen dem von **Alles exportieren** erzeugten Format:

```json
{
  "exportedAt": "2026-08-17T14:32:00.000Z",
  "application": "MAR Helper",
  "data": {
    "version": 1,
    "settings": {},
    "journalEntries": [],
    "activeTimer": null,
    "promptModels": [],
    "promptEntries": [],
    "plannerTasks": []
  }
}
```

Vor dem Import werden alle IDs, Pflichtfelder, Zeitstempel, Zahlenwerte und Statuswerte validiert. **Zusammenführen** ergänzt neue IDs und aktualisiert vorhandene IDs; **Ersetzen** überschreibt das betroffene Modul beziehungsweise beim vollständigen Backup den gesamten lokalen Datenbestand.

## Releases und automatische Updates

Ein semantischer Git-Tag startet den GitHub-Workflow `.github/workflows/release.yml`:

```powershell
git tag v1.2.0
git push origin v1.2.0
```

GitHub Actions prüft die Tests und veröffentlicht den NSIS-Installer zusammen mit `latest.yml` und der Blockmap. Installierte Produktionsversionen prüfen beim Start die öffentlichen Releases von `Akzuwo/MAR_Helper`. Bei einer neueren Version erscheint ein Dialog. **Ignorieren** blendet genau diese Version dauerhaft aus; **Jetzt aktualisieren** lädt sie im Hintergrund, installiert sie still und startet MAR Helper neu.

Für signierte Windows-Releases können die Repository-Secrets `WINDOWS_CERTIFICATE` und `WINDOWS_CERTIFICATE_PASSWORD` gesetzt werden. Ohne diese Secrets wird ein funktionsfähiger, aber nicht digital signierter Installer erzeugt.

## Struktur

```text
src/
  main/            Electron-Fenster, Persistenz, Dateidialog
  renderer/
    components/    gemeinsame UI-Bausteine
    layout/        App-Shell und Navigation
    modules/       journal, prompts, planner, export, settings
    state/         zentraler Datenzustand
  shared/          Modelle, Timerlogik, Exporter
```

Das visuelle System basiert direkt auf `references/productivity_precision/DESIGN.md` und den mitgelieferten Screens. Das Original-Logo aus `references/logo/screen.png` wird gebündelt und in der App eingesetzt.
