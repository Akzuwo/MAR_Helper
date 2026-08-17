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
