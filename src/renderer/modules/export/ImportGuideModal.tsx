import { CheckCircle2, FlaskConical } from 'lucide-react';
import { Modal } from '../../components/ui';

const journalExample = `{
  "format": "mar-helper-export",
  "formatVersion": 2,
  "module": "journal",
  "data": [{
    "id": "journal-001",
    "title": "Literatur ausgewertet",
    "notes": "Kapitel 3 und 4 zusammengefasst",
    "startedAt": "2026-08-18T08:00:00.000Z",
    "endedAt": "2026-08-18T09:30:00.000Z",
    "workingTimeMs": 5400000,
    "pausedTimeMs": 0
  }]
}`;

const promptExample = `{
  "format": "mar-helper-export",
  "formatVersion": 2,
  "module": "prompts",
  "data": [{
    "id": "prompt-001",
    "modelName": "GPT-5",
    "prompt": "Fasse den Text zusammen.",
    "response": "Zusammenfassung …",
    "createdAt": "2026-08-18T09:45:00.000Z"
  }]
}`;

const chatExample = `{
  "format": "mar-helper-export",
  "formatVersion": 3,
  "module": "prompts",
  "promptChats": [{
    "id": "chat-001",
    "number": 1,
    "title": "Recherche mit GPT-5",
    "createdAt": "2026-08-18T09:45:00.000Z",
    "nextPromptNumber": 2
  }],
  "data": [{
    "id": "prompt-001",
    "number": 1,
    "chatId": "chat-001",
    "modelName": "GPT-5",
    "prompt": "Fasse den Text zusammen.",
    "response": "Zusammenfassung …",
    "createdAt": "2026-08-18T09:45:00.000Z"
  }]
}`;

const plannerExample = `{
  "format": "mar-helper-export",
  "formatVersion": 2,
  "module": "planner",
  "data": [{
    "id": "task-001",
    "title": "Kapitel 2 abschliessen",
    "description": "Quellen ergänzen",
    "dueDate": "2026-08-31",
    "completed": false,
    "createdAt": "2026-08-18T10:00:00.000Z"
  }]
}`;

function FormatDetails({ title, summary, required, optional, example, open = false }: {
  title: string; summary: string; required: string; optional: string; example: string; open?: boolean
}) {
  return <details className="format-details" open={open}>
    <summary><span><strong>{title}</strong><small>{summary}</small></span></summary>
    <div className="format-details__body">
      <p><strong>Pflichtfelder:</strong> {required}</p>
      <p><strong>Optional:</strong> {optional}</p>
      <pre><code>{example}</code></pre>
    </div>
  </details>;
}

export function ImportGuideModal({ open, betaEnabled, onClose }: { open: boolean; betaEnabled: boolean; onClose: () => void }) {
  return <Modal open={open} wide title="Daten für den Import vorbereiten" description="Diese Formate erkennt MAR Helper zuverlässig." onClose={onClose}>
    <div className="import-guide">
      <div className="guide-recommendation"><CheckCircle2 size={21}/><div><strong>Empfohlen: JSON verwenden</strong><span>Speichere den Text als Datei mit der Endung .json. Datumswerte müssen im ISO-Format stehen; Zeiten werden in Millisekunden angegeben.</span></div></div>
      <div className="guide-rules">
        <h3>Grundregeln</h3>
        <ol>
          <li>Wähle genau ein Modul pro Datei: <code>journal</code>, <code>prompts</code> oder <code>planner</code>.</li>
          <li>Setze die Einträge als Liste in <code>data</code>. Jeder Eintrag braucht eine eindeutige <code>id</code>.</li>
          <li>Nutze für Datum und Uhrzeit z. B. <code>2026-08-18T09:45:00.000Z</code>, für ein Fälligkeitsdatum <code>2026-08-31</code>.</li>
          <li>Prüfe nach dem Auswählen die Vorschau. Erst „Importieren“ verändert deine Daten.</li>
        </ol>
      </div>
      <div className="format-list">
        <FormatDetails open title="Arbeitsjournal" summary="Aktivität, Notizen, Start, Ende und erfasste Zeiten" required="id, startedAt, endedAt, workingTimeMs, pausedTimeMs" optional="title, notes und linkedTaskId" example={journalExample}/>
        <FormatDetails title="Promptprotokoll" summary="Prompt, Antwort, Modell, Reasoning-Level, Zeitpunkt und optionale Chat-Zuordnung" required="id, modelName, prompt, response, createdAt" optional="number, title, modelId, reasoningLevel (light, medium, high, extra high oder ultra), chatId, updatedAt und gitSnapshot; promptChats enthält Chat-Titel und Nummern" example={promptExample}/>
        <FormatDetails title="Zeitplan" summary="Aufgabe, Status und Erstellungsdatum" required="id, title, completed, createdAt" optional="description, dueDate und updatedAt" example={plannerExample}/>
      </div>
      <section className="guide-chat">
        <h3>Ganze Chats importieren</h3>
        <ol>
          <li>Öffne den gewünschten Chat im KI-Tool. Kopiere unter „KI-Prompt kopieren“ die Vorlage „Chatverlauf importieren“ und sende sie im selben Chat.</li>
          <li>Speichere die ausgegebene JSON-Antwort ohne Codeblock als <code>.json</code>-Datei. Prüfe, ob alle Nachrichten enthalten sind.</li>
          <li>Wähle in MAR Helper „JSON auswählen“, kontrolliere in der Vorschau die Anzahl der Chats und Einträge und klicke auf „Importieren“.</li>
        </ol>
        <p>Für jeden Chat steht ein Eintrag in <code>promptChats</code>. Jede Nutzerfrage und ihre KI-Antwort bilden einen Eintrag in <code>data</code>. <code>chatId</code> muss auf die passende Chat-<code>id</code> verweisen. Mit <code>number</code> und <code>nextPromptNumber</code> bleibt die Reihenfolge erhalten. Wenn du mehrere Chats hast, erstelle für jeden eine eigene JSON-Datei und importiere sie nacheinander.</p>
        <pre><code>{chatExample}</code></pre>
      </section>
      <section className={`raw-guide ${betaEnabled ? '' : 'raw-guide--disabled'}`}>
        <header><FlaskConical size={19}/><div><strong>Rohtext-Import (Beta)</strong><span>{betaEnabled ? 'In deinen Einstellungen aktiviert' : 'Kann in den Einstellungen unter Beta-Funktionen aktiviert werden'}</span></div></header>
        <p>Du kannst Daten aus anderen Apps als JSON oder direkt aus Excel und Google Sheets einfügen. Häufige deutsche und englische Feldnamen, unterschiedliche Reihenfolgen sowie eingebettete Sitzungslisten werden automatisch zugeordnet.</p>
        <div className="raw-guide__examples">
          <div><strong>Arbeitsjournal</strong><code>Aktivität, Notizen, Start, Ende, Dauer, Pause</code></div>
          <div><strong>Promptprotokoll</strong><code>Titel, Modell, Prompt, Antwort, Zeitpunkt</code></div>
          <div><strong>Zeitplan</strong><code>Titel, Beschreibung, Fällig am, Status</code></div>
        </div>
        <p>Erkannt werden CSV-, TSV- und Markdown-Tabellen, Journal-Blöcke wie <code>## 2026-08-18</code>, Zeitzeilen wie <code>18.08.2026 08:00–09:30 | Recherche</code>, Prompt- und Chatverläufe mit Rollen wie <code>User:</code> und <code>Codex:</code> sowie Aufgaben mit <code>- [ ]</code>, <code>☐</code> oder <code>☑</code>.</p>
      </section>
    </div>
  </Modal>;
}
