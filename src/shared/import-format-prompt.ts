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

export const CHAT_IMPORT_FORMATTING_PROMPT = `Formatiere alle sichtbaren Nachrichten dieses Chats bis unmittelbar vor dieser Anweisung als JSON für das Promptprotokoll von MAR Helper.

Erfasse den gesamten Chat in der ursprünglichen Reihenfolge. Übernimm den vollständigen Wortlaut jeder Nachricht, einschliesslich Markdown, Codeblöcken und Zeilenumbrüchen. Lasse keine Nachricht aus, kürze nichts und erfinde keine Inhalte.

Gib genau ein gültiges JSON-Dokument ohne Markdown-Codeblock und ohne zusätzliche Erklärung aus. Verwende diese Struktur:
{
  "format": "mar-helper-export",
  "formatVersion": 3,
  "module": "prompts",
  "promptChats": [
    {
      "id": "chat-1",
      "number": 1,
      "title": "Titel dieses Chats",
      "createdAt": "2026-09-17T10:00:00.000Z",
      "nextPromptNumber": 2
    }
  ],
  "data": [
    {
      "id": "nachricht-1",
      "number": 1,
      "chatId": "chat-1",
      "modelName": "Modellname oder Unbekannt",
      "prompt": "Vollständige Nutzernachricht",
      "response": "Vollständige zugehörige KI-Antwort",
      "createdAt": "2026-09-17T10:00:00.000Z"
    }
  ]
}

Regeln:
- Erzeuge genau einen Eintrag in data für jede Nutzernachricht. Trage die darauf folgende KI-Antwort vollständig in response ein. Fehlt eine Antwort, verwende einen leeren String. Wenn mehrere KI-Nachrichten zu einer Nutzernachricht gehören, übernimm alle in response in ihrer Reihenfolge und trenne sie mit einem Zeilenumbruch und einer Rollenkennzeichnung.
- Bewahre auch andere sichtbare Nachrichten, etwa System- oder Tool-Nachrichten. Füge sie mit Rollenkennzeichnung in zeitlicher Reihenfolge beim nächsten passenden prompt oder response ein, damit keine Nachricht verloren geht.
- Vergib für jeden Eintrag eine eindeutige id. Alle chatId-Werte müssen der id in promptChats entsprechen. Nummeriere die Einträge im Chat ab 1 durch und setze nextPromptNumber auf die nächste freie Nummer. Die Chatnummer muss eine positive ganze Zahl sein.
- Verwende den vorhandenen Chattitel. Falls keiner vorhanden ist, verwende "Importierter Chat". Leite für einzelne Einträge keinen title aus ihrem Inhalt ab.
- Verwende den tatsächlichen Modellnamen, falls bekannt, andernfalls "Unbekannt".
- Verwende für createdAt vorhandene Nachrichtenzeitpunkte im ISO-8601-Format. Wenn Zeitpunkte fehlen, verwende den Zeitpunkt dieser Umwandlung und behalte die Reihenfolge durch aufsteigende Millisekunden bei. Setze den Chat-Zeitpunkt auf den frühesten Eintrag.
- Gib alle Zeichen in JSON-Strings korrekt escaped aus. Insbesondere müssen Zeilenumbrüche innerhalb von Strings als \\n dargestellt werden.

Beginne jetzt mit dem vollständigen sichtbaren Chatverlauf bis vor dieser Anweisung.`;
