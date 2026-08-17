import { useEffect, useState } from 'react';
import type { PlannerTask } from '../../../shared/models';
import { Button, Field, Input, Modal, Select, Textarea } from '../../components/ui';

export function TaskDialog({ open, task, onClose, onSave, onDelete }: {
  open: boolean; task: PlannerTask | null; onClose: () => void; onSave: (task: PlannerTask) => void; onDelete?: (task: PlannerTask) => void
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? ''); setDescription(task?.description ?? ''); setDueDate(task?.dueDate ?? ''); setCompleted(task?.completed ?? false); setError('');
  }, [open, task]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError('Bitte gib einen Tasktitel ein.');
    if (dueDate && Number.isNaN(new Date(`${dueDate}T00:00:00`).getTime())) return setError('Das Fälligkeitsdatum ist ungültig.');
    onSave({
      id: task?.id ?? crypto.randomUUID(),
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: dueDate || undefined,
      completed,
      createdAt: task?.createdAt ?? new Date().toISOString(),
      updatedAt: task ? new Date().toISOString() : undefined
    });
  };

  return <Modal open={open} title={task ? 'Task bearbeiten' : 'Task hinzufügen'} description="Halte den Zeitplan bewusst einfach und konkret." onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      <Field label="Titel" error={error}><Input autoFocus value={title} placeholder="z. B. Innenräume fertig modellieren" onChange={(event) => { setTitle(event.target.value); setError(''); }}/></Field>
      <Field label="Beschreibung" optional><Textarea rows={4} value={description} placeholder="Kurze Notiz oder nächster Schritt" onChange={(event) => setDescription(event.target.value)}/></Field>
      <div className="form-grid">
        <Field label="Fällig am" optional><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)}/></Field>
        <Field label="Status"><Select value={completed ? 'done' : 'open'} onChange={(event) => setCompleted(event.target.value === 'done')}><option value="open">Offen</option><option value="done">Erledigt</option></Select></Field>
      </div>
      <div className="form-actions form-actions--between">
        <div>{task && onDelete && <Button type="button" variant="danger" onClick={() => onDelete(task)}>Task löschen</Button>}</div>
        <div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">{task ? 'Änderungen speichern' : 'Task erstellen'}</Button></div>
      </div>
    </form>
  </Modal>;
}
