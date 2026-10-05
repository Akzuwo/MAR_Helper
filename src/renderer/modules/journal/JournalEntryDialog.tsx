import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { JournalEntry, JournalTimeSegment, PlannerTask } from '../../../shared/models';
import { updateJournalTimeline } from '../../../shared/journal';
import { formatDuration } from '../../../shared/timer';
import { Button, Field, IconButton, Input, Modal, Select, Textarea } from '../../components/ui';

const toLocalInput = (iso: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const toIso = (local: string) => local ? new Date(local).toISOString() : '';

type SegmentDraft = JournalTimeSegment & { key: string };

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
  const [segments, setSegments] = useState<SegmentDraft[]>([]);
  const hasTimeline = entry?.timeSegments !== undefined;

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
    setSegments((entry?.timeSegments ?? []).map((segment) => ({
      ...segment, key: crypto.randomUUID()
    })));
  }, [entry, open]);

  const updateSegment = (key: string, patch: Partial<JournalTimeSegment>) => {
    setSegments((current) => current.map((segment) => segment.key === key ? { ...segment, ...patch } : segment));
    setError('');
  };

  const addSegment = (type: JournalTimeSegment['type']) => {
    const start = segments.at(-1)?.endedAt || toIso(startedAt);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 15);
    setSegments((current) => [...current, {
      key: crypto.randomUUID(), type, startedAt: start,
      endedAt: Number.isNaN(end.getTime()) ? '' : end.toISOString()
    }]);
    setError('');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (hasTimeline && entry) {
      try {
        const updated = updateJournalTimeline(entry, segments.map(({ key: _key, ...segment }) => segment));
        onSave({ ...updated, title: title.trim(), notes: notes.trim() || undefined, linkedTaskId: linkedTaskId || undefined });
      } catch (error) {
        setError(error instanceof RangeError ? 'Bitte gib gültige Zeitpunkte für alle Blöcke ein.' : error instanceof Error ? error.message : 'Die Zeitabschnitte konnten nicht gespeichert werden.');
      }
      return;
    }
    const start = new Date(startedAt);
    const end = new Date(endedAt);
    if (!startedAt || !endedAt || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return setError('Bitte gib gültige Zeitpunkte ein.');
    if (end < start) return setError('Die Endzeit darf nicht vor der Startzeit liegen.');
    const total = end.getTime() - start.getTime();
    const keepTimes = Boolean(entry && !timeChanged);
    const paused = Math.min(entry?.pausedTimeMs ?? 0, total);
    onSave({
      id: entry?.id ?? crypto.randomUUID(),
      title: title.trim(),
      notes: notes.trim() || undefined,
      startedAt: keepTimes ? entry!.startedAt : start.toISOString(),
      endedAt: keepTimes ? entry!.endedAt : end.toISOString(),
      workingTimeMs: keepTimes ? entry!.workingTimeMs : total - paused,
      pausedTimeMs: keepTimes ? entry!.pausedTimeMs : paused,
      timeSegments: entry ? undefined : [{ type: 'work', startedAt: start.toISOString(), endedAt: end.toISOString() }],
      linkedTaskId: linkedTaskId || undefined
    });
  };

  const totalTime = (type: JournalTimeSegment['type']) => segments.reduce((total, segment) => {
    const duration = Date.parse(segment.endedAt) - Date.parse(segment.startedAt);
    return total + (segment.type === type && Number.isFinite(duration) ? Math.max(0, duration) : 0);
  }, 0);

  return <Modal open={open} wide={hasTimeline} title={entry ? 'Journaleintrag bearbeiten' : 'Eintrag hinzufügen'} description="Arbeitszeit und Notizen erfassen; eine Aktivität kannst du optional benennen." onClose={onClose}>
    <form onSubmit={submit} className="form-stack">
      <Field label="Aktivität" optional><Input autoFocus placeholder="Optionaler Titel für diesen Arbeitsblock" value={title} onChange={(e) => { setTitle(e.target.value); setError(''); }}/></Field>
      <Field label="Notizen" optional><Textarea placeholder="Ergebnisse, Fortschritt oder nächste Schritte …" value={notes} onChange={(e) => setNotes(e.target.value)}/></Field>
      {!hasTimeline && <div className="form-grid">
        <Field label="Start"><Input type="datetime-local" value={startedAt} onChange={(e) => { setStartedAt(e.target.value); setTimeChanged(true); setError(''); }}/></Field>
        <Field label="Ende"><Input type="datetime-local" value={endedAt} onChange={(e) => { setEndedAt(e.target.value); setTimeChanged(true); setError(''); }}/></Field>
      </div>}
      {tasks.length > 0 && <Field label="Zeitplan-Task" optional><Select value={linkedTaskId} onChange={(e) => setLinkedTaskId(e.target.value)}><option value="">Nicht verknüpft</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</Select></Field>}
      {hasTimeline ? <section className="journal-timeline journal-timeline--editable" aria-label="Zeitabschnitte dieser Session">
        <header><strong>Zeitabschnitte</strong><span>{segments.length} Arbeits- und Pausenblöcke</span></header>
        <p className="journal-timeline__hint">Ändere oder lösche einzelne Blöcke. Lücken zählen weder als Arbeit noch als Pause. Änderungen werden mit «Speichern» übernommen.</p>
        <div>{segments.map((segment, index) => <div className={`journal-timeline__editor journal-timeline__editor--${segment.type}`} key={segment.key} role="group" aria-label={`Block ${index + 1}`}>
          <div className="journal-timeline__block-heading"><strong>{segment.type === 'work' ? 'Arbeitsblock' : 'Pausenblock'} {index + 1}</strong><IconButton type="button" variant="danger" label={`Block ${index + 1} löschen`} onClick={() => { setSegments((current) => current.filter((item) => item.key !== segment.key)); setError(''); }}><Trash2 size={16}/></IconButton></div>
          <div className="journal-timeline__fields">
            <Field label="Typ"><Select value={segment.type} onChange={(e) => updateSegment(segment.key, { type: e.target.value as JournalTimeSegment['type'] })}><option value="work">Arbeit</option><option value="pause">Pause</option></Select></Field>
            <Field label="Start"><Input type="datetime-local" value={toLocalInput(segment.startedAt)} onChange={(e) => updateSegment(segment.key, { startedAt: toIso(e.target.value) })}/></Field>
            <Field label="Ende"><Input type="datetime-local" value={toLocalInput(segment.endedAt)} onChange={(e) => updateSegment(segment.key, { endedAt: toIso(e.target.value) })}/></Field>
          </div>
        </div>)}</div>
        {segments.length === 0 && <p className="journal-timeline__hint">Keine Zeitblöcke vorhanden. Dieser Eintrag enthält keine Arbeits- oder Pausenzeit.</p>}
        <div className="journal-timeline__footer"><span>Arbeit: {formatDuration(totalTime('work'), true)} · Pause: {formatDuration(totalTime('pause'), true)}</span><div className="form-actions"><Button type="button" variant="secondary" size="sm" icon={<Plus size={14}/>} onClick={() => addSegment('work')}>Arbeit</Button><Button type="button" variant="secondary" size="sm" icon={<Plus size={14}/>} onClick={() => addSegment('pause')}>Pause</Button></div></div>
      </section> : entry && <p className="form-note">Gespeicherte Pause: {formatDuration(entry.pausedTimeMs, true)} · Für ältere Einträge ist keine detaillierte Zeitachse verfügbar. Die gespeicherte Pause bleibt bei Zeitänderungen erhalten, höchstens bis zur Gesamtdauer.</p>}
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div className="form-actions form-actions--between">
        <div>{entry && onDelete && <Button type="button" variant="danger" onClick={() => onDelete(entry)}>Löschen</Button>}</div>
        <div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Speichern</Button></div>
      </div>
    </form>
  </Modal>;
}
