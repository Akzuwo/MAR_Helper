import type { JournalEntry, JournalTimeSegment } from './models';

export function updateJournalTimeline(entry: JournalEntry, segments: JournalTimeSegment[]): JournalEntry {
  for (const [index, segment] of segments.entries()) {
    const start = Date.parse(segment.startedAt);
    const end = Date.parse(segment.endedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`Block ${index + 1}: Bitte gib gültige Zeitpunkte ein.`);
    if (end < start) throw new Error(`Block ${index + 1}: Die Endzeit darf nicht vor der Startzeit liegen.`);
  }
  const timeSegments = [...segments].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  for (let index = 1; index < timeSegments.length; index++) {
    if (Date.parse(timeSegments[index].startedAt) < Date.parse(timeSegments[index - 1].endedAt)) {
      throw new Error('Arbeits- und Pausenblöcke dürfen sich nicht überschneiden.');
    }
  }
  const duration = (type: JournalTimeSegment['type']) => timeSegments.reduce((total, segment) =>
    total + (segment.type === type ? Date.parse(segment.endedAt) - Date.parse(segment.startedAt) : 0), 0);
  return {
    ...entry, timeSegments,
    startedAt: timeSegments[0]?.startedAt ?? entry.startedAt,
    endedAt: timeSegments.at(-1)?.endedAt ?? entry.startedAt,
    workingTimeMs: duration('work'), pausedTimeMs: duration('pause')
  };
}
