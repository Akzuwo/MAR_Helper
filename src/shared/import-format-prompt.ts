export const IMPORT_FORMATTING_PROMPT = `Formatiere meine bestehenden Daten für den Import in MAR Helper.

Ich füge meine bisherigen Daten direkt nach dieser Anweisung ein. Übernimm alle vorhandenen Informationen vollständig, erfinde nichts und fasse keine Inhalte zusammen.

MAR Helper akzeptiert pro JSON-Dokument genau eines dieser Module:
- "journal" für Arbeitsjournal-Einträge
- "prompts" für Einträge aus dem Promptprotokoll
- "planner" für Aufgaben aus dem Zeitplan

Verwende für jedes Dokument exakt diese Hülle:
{
  "format": "mar-helper-export",
  "formatVersion": 2,
  "module": "journal | prompts | planner",
  "data": []
}

Felder der Module:

Arbeitsjournal:
{
  "id": "eindeutige-id",
  "title": "Aktivität oder leerer String",
  "notes": "optionale Notizen",
  "startedAt": "ISO-8601-Zeitpunkt",
  "endedAt": "ISO-8601-Zeitpunkt",
  "workingTimeMs": 0,
  "pausedTimeMs": 0
}

Promptprotokoll:
{
  "id": "eindeutige-id",
  "title": "nur ein ausdrücklich vorhandener Titel; sonst Feld weglassen",
  "modelName": "Modellname",
  "prompt": "vollständiger Prompt",
  "response": "vollständige Antwort",
  "createdAt": "ISO-8601-Zeitpunkt"
}

Zeitplan:
{
  "id": "eindeutige-id",
  "title": "Aufgabentitel",
  "description": "optionale Beschreibung",
  "dueDate": "YYYY-MM-DD, falls vorhanden",
  "completed": false,
  "createdAt": "ISO-8601-Zeitpunkt"
}

Regeln:
- Erzeuge für jeden Eintrag eine eindeutige ID, falls keine vorhanden ist.
- Verwende ISO-8601 für Zeitpunkte und Millisekunden für Arbeits- und Pausenzeiten.
- Leite beim Promptprotokoll niemals einen Titel aus Prompt, Antwort, Notizen, Überschriften oder sonstigem Inhalt ab. Übernimm title nur, wenn die Quelldaten ihn eindeutig als Titel kennzeichnen.
- Lass optionale Felder weg, wenn keine verlässliche Information vorhanden ist.
- Lass die Prompt-Nummer weg, sofern in den Quelldaten keine feste Eintragsnummer vorhanden ist. MAR Helper vergibt sie beim Import automatisch.
- Bewahre Markdown und Zeilenumbrüche in Prompt, Antwort und Notizen.
- Wenn meine Daten mehrere Module enthalten, gib für jedes Modul ein separates, klar benanntes JSON-Dokument aus. Diese Dateien werden einzeln importiert.
- Antworte ohne zusätzliche Erklärungen. Gib nur die fertigen JSON-Dokumente in Codeblöcken aus.

Meine bestehenden Daten folgen hier:
`;
