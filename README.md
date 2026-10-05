# MAR Helper

MAR Helper ist eine lokale Windows-Desktop-App für Maturaarbeiten. Arbeitsjournal, Promptprotokoll und Zeitplan sind unabhängig voneinander aktivierbar; deaktivierte Module behalten ihre Daten.

## Installation unter Windows

Für die normale Nutzung werden weder Node.js noch Git oder andere Entwicklerwerkzeuge benötigt.

1. Öffne die Seite [GitHub Releases](https://github.com/Akzuwo/MAR_Helper/releases/latest).
2. Lade unter **Assets** die aktuelle Datei `MAR-Helper-Setup-<Version>.exe` herunter. Der Installer erkennt automatisch, ob Windows x64 oder ARM64 verwendet, und installiert die passende App-Version.
3. Öffne die heruntergeladene `.exe` und folge dem Installationsassistenten.
4. Starte **MAR Helper** anschliessend über das Startmenü oder die angelegte Verknüpfung.

Da einzelne Versionen möglicherweise noch nicht digital signiert sind, kann Windows SmartScreen beim Start des Installers eine Warnung anzeigen. Verwende ausschliesslich den Installer aus dem offiziellen GitHub-Release. Über **Weitere Informationen → Trotzdem ausführen** kann die Installation fortgesetzt werden.

## Erste Schritte

Beim ersten Start kannst du in den Einstellungen festlegen, welche Bereiche du verwenden möchtest:

- **Arbeitsjournal** zum Erfassen von Arbeitszeiten und Notizen
- **Promptprotokoll** zum Dokumentieren einzelner Prompts oder ganzer Chats mit hierarchischer Nummerierung, frei wählbarem Datum und optionalen Git-Commits
- **Zeitplan** zum Planen und Nachverfolgen von Aufgaben

Die Bereiche lassen sich später jederzeit ein- oder ausblenden. Bereits erfasste Daten bleiben dabei erhalten.

Beim Schliessen der App wird eine laufende oder pausierte Journalsitzung automatisch beendet und gespeichert. Öffne einen gespeicherten Eintrag, um einzelne Arbeits- und Pausenblöcke zu ändern, hinzuzufügen oder zu löschen. Die Arbeits- und Pausensummen werden aus den verbleibenden Blöcken berechnet; Lücken zwischen Blöcken werden nicht mitgezählt. Bei älteren Einträgen ohne detaillierte Zeitachse kannst du weiterhin den Gesamtzeitraum bearbeiten.

## Daten sichern, exportieren und importieren

Unter **Import & Export** kannst du deine MAR-Helper-Daten sichern, wiederherstellen und in verschiedenen Formaten ausgeben. Vollständige Backups enthalten alle aktivierten Module und Einstellungen. Für eine möglichst verlustfreie Übertragung zwischen Installationen wird der JSON-Export empfohlen.

Beim Import kannst du Daten mit dem vorhandenen Stand zusammenführen oder den betroffenen Datenbestand ersetzen. Die App prüft die importierten Daten vor der Übernahme und zeigt bei unterstützten Rohtextformaten zuerst das erkannte Modul und die Anzahl der Einträge an.

## Automatische Updates

Installierte Versionen prüfen beim Start, ob ein neues offizielles Release verfügbar ist. Bei einem Update kannst du:

- es sofort herunterladen und installieren,
- dich in fünf Tagen oder nach einer eigenen Anzahl von Tagen erneut erinnern lassen oder
- es beim Beenden von MAR Helper im Hintergrund installieren lassen.

Nach einer Installation beim Beenden informiert MAR Helper beim nächsten Start darüber, ob das Update erfolgreich war.
Der Auto-Updater verwendet denselben universellen Installer wie eine manuelle Installation; dessen NSIS-Architekturerkennung installiert auf jedem Gerät automatisch das passende x64- oder ARM64-Paket.

## Lokale Daten und Datenschutz

Unter **Einstellungen → Beta-Funktionen → Lokaler KI-Assistent** kann eine lokale Ollama-Integration aktiviert werden. Vor der Aktivierung zeigt die App Modell, Downloadumfang und die erkannten RAM-Daten. Sie wählt **Qwen 3.5 2B** ab 8 GB RAM, **4B** ab 12 GB und **9B** ab 24 GB. Die Auswahl ist bewusst konservativ und setzt keine GPU voraus; ohne passende GPU können Antworten länger dauern.

Ein vorhandenes Ollama wird verwendet. Fehlt Ollama unter Windows x64 oder ARM64, lädt MAR Helper das offizielle portable Paket aus dem Ollama-GitHub-Release, prüft dessen SHA-256-Prüfsumme und installiert es im eigenen App-Datenordner. Ein separates Terminal, Administratorrechte oder ein manueller Installer sind nicht nötig. Anschliessend wird das Modell über Ollama heruntergeladen. Fortschritt und Fehler werden in den Einstellungen und im Chat angezeigt; unterbrochene Modelldownloads können erneut gestartet werden. Auf anderen Betriebssystemen muss Ollama zunächst manuell installiert sein.

Bei aktiviertem Assistenten prüft MAR Helper beim Appstart Ollama und startet es bei Bedarf unsichtbar im Hintergrund. Rechts unten öffnet ein schwebender Button den Chat. Der Assistent kann Journal, Prompts, Chats, Modellliste und Aufgaben lesen, erstellen, bearbeiten und löschen, Rohtext importieren, Module umschalten sowie Sitzungen starten, pausieren, fortsetzen und speichern. Änderungen werden validiert, zusammenhängend gespeichert und sind über die normale Änderungshistorie rückgängig machbar. Bei zwischenzeitlich geänderten App-Daten wird die Anfrage zur Vermeidung veralteter Überschreibungen abgebrochen.

Anfragen und App-Inhalte werden ausschliesslich an die lokale Ollama-API gesendet. Nur die Einrichtung benötigt Internet für Laufzeit- und Modelldownloads. Angeheftete Textdateien (TXT, Markdown, CSV, TSV, JSON, LOG bis 1 MB) können gelesen werden; andere Dateiformate stehen derzeit als Metadaten zur Verfügung. Exportdialoge, Git-Aktionen und weitere Einstellungen werden über die App-Oberfläche bedient. Der Chatverlauf bleibt nur für die aktuelle App-Sitzung im Speicher. Beim Deaktivieren oder Beenden werden Anfragen/Downloads abgebrochen und nur ein durch MAR Helper gestarteter Ollama-Prozess beendet; ein vorher laufendes Ollama bleibt erhalten. Installierte Modelle und Laufzeitdateien bleiben auf dem Gerät.

MAR Helper speichert deine Daten standardmässig lokal auf deinem Gerät. Timerzustände werden direkt bei Start, Pause, Fortsetzen und Beenden gesichert. Exporte werden nur an einem von dir gewählten Speicherort abgelegt.

---

## Für Entwickler

Die folgenden Abschnitte beschreiben die lokale Entwicklung, Tests, Builds und Releases aus dem Quellcode.

### Voraussetzungen und Entwicklungsstart

Voraussetzung: Node.js 20 oder neuer.

```powershell
npm install
npm run dev
```

Produktions-Build und lokaler Start:

```powershell
npm start
```

### Installationspaket erzeugen

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

### Qualität prüfen

```powershell
npm run typecheck
npm test
npm run build
node scripts/smoke.cjs
```

Gezielte KI-Tests nach dem Build:

```powershell
# Isolierte echte Windows-Neuinstallation (lädt das offizielle portable Ollama-Paket herunter)
node scripts/test-ollama-runtime.cjs
# Echte Modellanfragen gegen ein laufendes Ollama mit installiertem qwen3.5:9b
node scripts/test-assistant-live.cjs
# Aktivierungsdialog, Chatfenster, App-Neustart und Deaktivierung
node scripts/smoke-assistant.cjs
```

Diese Tests verwenden eigene Profile unter `.smoke-artifacts`; die Neuinstallation startet ihren Testserver auf Port 11439 mit leerem Modellordner und verändert die vorhandene Ollama-Installation nicht. Der UI-Test aktiviert das anhand des RAM gewählte Modell und lädt es bei Bedarf herunter.

Der Smoke-Test startet die gebaute Electron-App isoliert und prüft Renderer, Preload-Bridge und grundlegendes Rendering. Ein Screenshot wird nur lokal unter `.smoke-artifacts` erzeugt.

### Technische Daten und Sicherheit

- Die Daten liegen als atomar geschriebene JSON-Datenbank im Electron-`userData`-Ordner des Betriebssystems.
- Timerzustände werden bei Start, Pause, Fortsetzen und Beenden sofort persistiert.
- Der Renderer hat keinen Node-Zugriff; Kommunikation erfolgt ausschliesslich über eine schmale Preload-API.
- Prompt- und Antworttexte werden ohne ausführbares Benutzer-HTML durch `react-markdown` und `remark-gfm` gerendert.
- Exporte verwenden den nativen Speichern-Dialog von Electron.

### Importformat

Im Bereich **Import & Export → Daten importieren** können vollständige MAR-Helper-Backups und JSON-Exporte einzelner Module importiert werden. Eine genaue, direkt in der App verfügbare Format-Anleitung enthält Pflichtfelder und Beispiele für jedes Modul.

Unter **Einstellungen → Beta-Funktionen** kann zusätzlich der automatische Rohtext-Import aktiviert werden. Er erkennt lokal eingefügte CSV-/TSV-Tabellen, datierte Arbeitsjournal-Blöcke in Markdown, beschriftete Prompt-/Antwort-Blöcke, exportierte Prompt-Markdown-Dokumente und Markdown-Aufgabenlisten. Vor jeder Übernahme zeigt die App das erkannte Modul und die Anzahl der Einträge an. JSON bleibt das empfohlene verlustfreie Austauschformat.

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

### Releases erstellen

Ein Release wird direkt in GitHub unter **Actions → Release Workflow → Run workflow** gestartet. Im Pflichtfeld **Version** wird eine semantische Version ohne `v` eingetragen, zum Beispiel `1.3.0` oder `2.0.0-beta.1`.

Vor dem Release wird die neue Version in `changelog.json` ergänzt. Pro Version gibt es zwei Listen: `fix` für Fehlerbehebungen und `new` für neue Funktionen. Beispiel:

```json
{
  "1.5.0": {
    "fix": ["GitHub-Icon wird korrekt angezeigt."],
    "new": ["ARM64-Unterstützung", "Changelog"]
  }
}
```

Die Update-Meldung lädt den Eintrag direkt vom Git-Tag der angebotenen Version. Für ältere App-Versionen erzeugt der Workflow zusätzlich den GitHub-Release-Text aus denselben Daten. Beim ersten Start einer neuen Version wird deren Changelog einmal angezeigt – sowohl nach automatischen als auch nach manuellen Installationen. Über **Einstellungen → Changelog** bleiben alle mitgelieferten Versionen erreichbar. Der Release-Workflow bricht ab, wenn für die zu veröffentlichende Version kein gültiger Eintrag vorhanden ist.

Der Workflow validiert die Version und prüft, dass Tag und Release noch nicht existieren. Anschliessend synchronisiert er `package.json`, `package-lock.json` und die in der App angezeigte Version, prüft die Produktionsabhängigkeiten auf native ARM64-Risiken, führt Tests und Build aus und erzeugt einen universellen NSIS-Installer mit x64- und ARM64-App-Paket. Er verifiziert beide PE-Architekturen sowie die Update-Metadaten, pusht den Release-Commit und den Tag und veröffentlicht den GitHub Release samt Installer und Update-Dateien. Ein manuelles Erstellen oder Pushen des Tags ist nicht notwendig. Die separate Datei `electron-builder.release.cjs` gilt nur für GitHub-Releases; lokale Builds bleiben unverändert.

Für einen normalen Release müssen keine eigenen Repository-Secrets eingerichtet werden. Der Workflow verwendet das von GitHub Actions automatisch bereitgestellte `GITHUB_TOKEN`.

Für signierte Windows-Releases können die Repository-Secrets `WINDOWS_CERTIFICATE` und `WINDOWS_CERTIFICATE_PASSWORD` gesetzt werden. Ohne diese Secrets wird ein funktionsfähiger, aber nicht digital signierter Installer erzeugt.

### Projektstruktur

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
