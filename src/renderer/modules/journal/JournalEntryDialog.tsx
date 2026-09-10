import { useEffect, useState } from 'react';
import type { JournalEntry, PlannerTask } from '../../../shared/models';
import { formatDuration } from '../../../shared/timer';
import { Button, Field, Input, Modal, Select, Textarea } from '../../components/ui';

const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export function JournalEntryDialog({ open, entry, tasks, onClose, onSave, onDelete }: {
  open: boolean;
  entry: JournalEntry | null;
  tasks: PlannerTask[];
  onClose: () => void;
  onSave: (entry: JournalEntry) => void;
  onDelete?: (entry: JournalEntry) => void;
}) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [linkedTaskId, setLinkedTaskId] = useState('');
  const [error, setError] = useState('');
  const [timeChanged, setTimeChanged] = useState(false);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 30 * 60_000).toISOString();
    setTitle(entry?.title ?? '');
    setNotes(entry?.notes ?? '');
    setStartedAt(toLocalInput(entry?.startedAt ?? defaultStart));
    setEndedAt(toLocalInput(entry?.endedAt ?? now.toISOString()));
    setLinkedTaskId(entry?.linkedTaskId ?? '');
    setError('');
    setTimeChanged(false);
  }, [entry, open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const start = new Date(startedAt);
    const end = new Date(endedAt);
    if (!startedAt || !endedAt || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return setError('Bitte gib gültige Zeitpunkte ein.');
    if (end < start) return setError('Die Endzeit darf nicht vor der Startzeit liegen.');
    const total = end.getTime() - start.getTime();
    const keepTimeline = Boolean(entry && !timeChanged);
    const paused = keepTimeline ? Math.min(entry?.pausedTimeMs ?? 0, total) : 0;
    onSave({
      id: entry?.id ?? crypto.randomUUID(),
      title: title.trim(),
      notes: notes.trim() || undefined,
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      workingTimeMs: total - paused,
      pausedTimeMs: paused,
      timeSegments: keepTimeline
        ? entry?.timeSegments
        : [{ type: 'work', startedAt: start.toISOString(), endedAt: end.toISOString() }],
      linkedTaskId: linkedTaskId || undefined
    });
  };

  return <Modal open={open} title={entry ? 'Journaleintrag bearbeiten' : 'Eintrag hinzufügen'} description="Arbeitszeit und Notizen erfassen; eine Aktivität kannst du optional benennen." onClose={onClose}>
    <form onSubmit={submit} className="form-stack">
      <Field label="Aktivität" optional><Input autoFocus placeholder="Optionaler Titel für diesen Arbeitsblock" value={title} onChange={(e) => { setTitle(e.target.value); setError(''); }}/></Field>
      <Field label="Notizen" optional><Textarea placeholder="Ergebnisse, Fortschritt oder nächste Schritte …" value={notes} onChange={(e) => setNotes(e.target.value)}/></Field>
      <div className="form-grid">
        <Field label="Start"><Input type="datetime-local" value={startedAt} onChange={(e) => { setStartedAt(e.target.value); setTimeChanged(true); setError(''); }}/></Field>
        <Field label="Ende"><Input type="datetime-local" value={endedAt} onChange={(e) => { setEndedAt(e.target.value); setTimeChanged(true); setError(''); }}/></Field>
      </div>
      {tasks.length > 0 && <Field label="Zeitplan-Task" optional><Select value={linkedTaskId} onChange={(e) => setLinkedTaskId(e.target.value)}><option value="">Nicht verknüpft</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</Select></Field>}
      {entry?.timeSegments?.length ? <section className="journal-timeline" aria-label="Zeitabschnitte dieser Session">
        <header><strong>Zeitabschnitte</strong><span>Eine Session mit {entry.timeSegments.length} Arbeits- und Pausenblöcken</span></header>
        <div>{entry.timeSegments.map((segment, index) => <div className={`journal-timeline__row journal-timeline__row--${segment.type}`} key={`${segment.startedAt}-${index}`}>
          <span>{segment.type === 'work' ? 'Arbeit' : 'Pause'}</span>
          <strong>{new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit' }).format(new Date(segment.startedAt))} – {new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit' }).format(new Date(segment.endedAt))}</strong>
          <small>{formatDuration(Date.parse(segment.endedAt) - Date.parse(segment.startedAt), true)}</small>
        </div>)}</div>
      </section> : entry && <p className="form-note">Gespeicherte Pause: {formatDuration(entry.pausedTimeMs, true)} · Für ältere Einträge ist keine detaillierte Zeitachse verfügbar.</p>}
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div className="form-actions form-actions--between">
        <div>{entry && onDelete && <Button type="button" variant="danger" onClick={() => onDelete(entry)}>Löschen</Button>}</div>
        <div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Speichern</Button></div>
      </div>
    </form>
  </Modal>;
}
