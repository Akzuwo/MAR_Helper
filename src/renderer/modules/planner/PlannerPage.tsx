import { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, CheckCircle2, Circle, Clock3, ListChecks, ListTodo, Plus, Trash2 } from 'lucide-react';
import type { PlannerTask } from '../../../shared/models';
import { formatDuration } from '../../../shared/timer';
import { useAppData } from '../../state/AppDataContext';
import { Button, ConfirmDialog, EmptyState } from '../../components/ui';
import { Page, PageHeader } from '../../layout/Page';
import { TaskDialog } from './TaskDialog';

const dueLabel = (date?: string) => date ? new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00`)) : '';
const overdue = (date?: string) => !!date && new Date(`${date}T23:59:59`).getTime() < Date.now();

function TaskColumn({ title, tasks, completed, onToggle, onOpen }: {
  title: string; tasks: PlannerTask[]; completed: boolean; onToggle: (task: PlannerTask) => void; onOpen: (task: PlannerTask) => void
}) {
  return <section className={`task-column ${completed ? 'task-column--done' : ''}`}>
    <header><div>{completed ? <CheckCircle2 size={20}/> : <span className="open-dot"/>}<h2>{title}</h2></div><span className="count-badge">{tasks.length}</span></header>
    {tasks.length === 0 ? <div className="task-column__empty">{completed ? 'Noch nichts erledigt.' : 'Keine offenen Tasks.'}</div> : <div role="list">
      {tasks.map((task) => <div className="task-row" role="listitem" key={task.id}>
        <button className={`task-checkbox ${task.completed ? 'checked' : ''}`} aria-label={task.completed ? `${task.title} wieder öffnen` : `${task.title} erledigen`} aria-pressed={task.completed} onClick={() => onToggle(task)}>{task.completed ? <Check size={15}/> : <Circle size={15}/>}</button>
        <button className="task-row__content" onClick={() => onOpen(task)}>
          <strong>{task.title}</strong>
          {task.description && <span>{task.description}</span>}
          {task.dueDate && <small className={overdue(task.dueDate) && !task.completed ? 'overdue' : ''}><Calendar size={13}/>{overdue(task.dueDate) && !task.completed ? 'Überfällig · ' : ''}{dueLabel(task.dueDate)}</small>}
        </button>
      </div>)}
    </div>}
  </section>;
}

export function PlannerPage() {
  const { state, updateState } = useAppData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlannerTask | null>(null);
  const [deleting, setDeleting] = useState<PlannerTask | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const openTasks = useMemo(() => state.plannerTasks.filter((task) => !task.completed).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')), [state.plannerTasks]);
  const doneTasks = useMemo(() => state.plannerTasks.filter((task) => task.completed).sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)), [state.plannerTasks]);
  const totalWorkingTime = useMemo(() => state.journalEntries.reduce((total, entry) => total + entry.workingTimeMs, 0), [state.journalEntries]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.ctrlKey && event.key.toLowerCase() === 'n' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        event.preventDefault(); setEditing(null); setDialogOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const save = (task: PlannerTask) => {
    void updateState((current) => ({
      ...current,
      plannerTasks: current.plannerTasks.some((item) => item.id === task.id)
        ? current.plannerTasks.map((item) => item.id === task.id ? task : item)
        : [...current.plannerTasks, task]
    }), editing ? 'Task aktualisiert' : 'Task erstellt');
    setDialogOpen(false); setEditing(null);
  };

  const toggle = (task: PlannerTask) => {
    void updateState((current) => ({ ...current, plannerTasks: current.plannerTasks.map((item) => item.id === task.id ? { ...item, completed: !item.completed, updatedAt: new Date().toISOString() } : item) }), task.completed ? 'Task wieder geöffnet' : 'Task erledigt');
  };

  const confirmDelete = () => {
    if (!deleting) return;
    void updateState((current) => ({ ...current, plannerTasks: current.plannerTasks.filter((task) => task.id !== deleting.id) }), 'Task gelöscht');
    setDeleting(null); setDialogOpen(false); setEditing(null);
  };

  const openDialog = (task?: PlannerTask) => { setEditing(task ?? null); setDialogOpen(true); };

  return <Page>
    <PageHeader title="Zeitplan" description="Plane die nächsten Aufgaben deiner Maturaarbeit." actions={<>{state.plannerTasks.length > 0 && <Button variant="ghost" icon={<Trash2 size={17}/>} onClick={() => setDeleteAllOpen(true)}>Alle löschen</Button>}<Button icon={<Plus size={18}/>} onClick={() => openDialog()}>Task</Button></>}/>
    <section className="planner-dashboard" aria-label="Projektübersicht">
      <div><span><Clock3 size={18}/></span><p>Gesamter Zeitaufwand</p><strong>{formatDuration(totalWorkingTime, true)}</strong></div>
      <div><span><ListChecks size={18}/></span><p>Erfasste Sessions</p><strong>{state.journalEntries.length}</strong></div>
      <div><span><CheckCircle2 size={18}/></span><p>Erledigte Tasks</p><strong>{doneTasks.length} / {state.plannerTasks.length}</strong></div>
    </section>
    {state.plannerTasks.length === 0 ? <EmptyState icon={<ListTodo/>} title="Noch keine Tasks" description="Erstelle deinen ersten Task, um deinen Zeitplan zu beginnen." action={<Button icon={<Plus size={17}/>} onClick={() => openDialog()}>Task erstellen</Button>}/> :
      <div className="planner-grid">
        <TaskColumn title="Offen" tasks={openTasks} completed={false} onToggle={toggle} onOpen={openDialog}/>
        <TaskColumn title="Erledigt" tasks={doneTasks} completed onToggle={toggle} onOpen={openDialog}/>
      </div>}
    <TaskDialog open={dialogOpen} task={editing} onClose={() => { setDialogOpen(false); setEditing(null); }} onSave={save} onDelete={(task) => setDeleting(task)}/>
    <ConfirmDialog open={!!deleting} title="Task löschen?" description="Der Task wird dauerhaft entfernt. Bereits verknüpfte Journaleinträge bleiben erhalten." onCancel={() => setDeleting(null)} onConfirm={confirmDelete}/>
    <ConfirmDialog open={deleteAllOpen} title="Alle Tasks löschen?" description={`${state.plannerTasks.length} offene und erledigte Tasks werden entfernt. Verknüpfte Journaleinträge bleiben bestehen.`} confirmLabel="Alle löschen" onCancel={() => setDeleteAllOpen(false)} onConfirm={() => { void updateState((current) => ({ ...current, plannerTasks: [] }), 'Zeitplan geleert'); setDeleteAllOpen(false); }}/>
  </Page>;
}
