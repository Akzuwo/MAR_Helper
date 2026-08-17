import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CirclePause, CirclePlay, Clock3, Link2, Plus, Square } from 'lucide-react';
import type { ActiveTimer, JournalEntry } from '../../../shared/models';
import { formatDuration, getPausedTimeMs, getWorkingTimeMs, pauseTimer, resumeTimer } from '../../../shared/timer';
import { useAppData } from '../../state/AppDataContext';
import { Button, ConfirmDialog, EmptyState, Field, Input, Select } from '../../components/ui';
import { Page, PageHeader } from '../../layout/Page';
import { JournalEntryDialog } from './JournalEntryDialog';

const deDate = (iso: string) => new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
const time = (iso: string) => new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function JournalPage() {
  const { state, updateState } = useAppData();
  const [activity, setActivity] = useState('');
  const [taskId, setTaskId] = useState('');
  const [validation, setValidation] = useState('');
  const [now, setNow] = useState(Date.now());
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<JournalEntry | null>(null);

  const timer = state.activeTimer;
  const plannerIntegration = state.settings.modules.planner;
  const openTasks = useMemo(() => state.plannerTasks.filter((task) => !task.completed), [state.plannerTasks]);
  const entries = useMemo(() => [...state.journalEntries].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [state.journalEntries]);

  useEffect(() => {
    if (!timer || timer.status === 'paused') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.ctrlKey && event.key.toLowerCase() === 'n' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        event.preventDefault();
        if (!timer) document.getElementById('activity-input')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [timer]);

  const selectTask = (id: string) => {
    setTaskId(id);
    const task = openTasks.find((item) => item.id === id);
    if (task) setActivity(task.title);
  };

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activity.trim()) return setValidation('Bitte beschreibe zuerst deine Aktivität.');
    const activeTimer: ActiveTimer = {
      id: crypto.randomUUID(),
      title: activity.trim(),
      startedAt: new Date().toISOString(),
      status: 'running',
      accumulatedPausedMs: 0,
      linkedTaskId: taskId || undefined
    };
    await updateState((current) => ({ ...current, activeTimer }), 'Timer gestartet');
    setActivity(''); setTaskId(''); setValidation(''); setNow(Date.now());
  };

  const togglePause = () => {
    if (!timer) return;
    const updated = timer.status === 'running' ? pauseTimer(timer) : resumeTimer(timer);
    void updateState((current) => ({ ...current, activeTimer: updated }), timer.status === 'running' ? 'Timer pausiert' : 'Timer fortgesetzt');
    setNow(Date.now());
  };

  const stop = () => {
    if (!timer) return;
    const endedAt = new Date();
    const entry: JournalEntry = {
      id: timer.id,
      title: timer.title,
      startedAt: timer.startedAt,
      endedAt: endedAt.toISOString(),
      workingTimeMs: getWorkingTimeMs(timer, endedAt.getTime()),
      pausedTimeMs: getPausedTimeMs(timer, endedAt.getTime()),
      linkedTaskId: timer.linkedTaskId
    };
    void updateState((current) => ({ ...current, activeTimer: null, journalEntries: [...current.journalEntries, entry] }), 'Journaleintrag gespeichert');
  };

  const saveEntry = (entry: JournalEntry) => {
    void updateState((current) => ({
      ...current,
      journalEntries: current.journalEntries.some((item) => item.id === entry.id)
        ? current.journalEntries.map((item) => item.id === entry.id ? entry : item)
        : [...current.journalEntries, entry]
    }), editEntry ? 'Eintrag aktualisiert' : 'Eintrag gespeichert');
    setEntryDialogOpen(false); setEditEntry(null);
  };

  const confirmDelete = () => {
    if (!deleteEntry) return;
    void updateState((current) => ({ ...current, journalEntries: current.journalEntries.filter((item) => item.id !== deleteEntry.id) }), 'Eintrag gelöscht');
    setDeleteEntry(null); setEntryDialogOpen(false); setEditEntry(null);
  };

  const todayEntries = entries.filter((entry) => isToday(entry.startedAt));
  const todayMs = todayEntries.reduce((sum, entry) => sum + entry.workingTimeMs, 0) + (timer && isToday(timer.startedAt) ? getWorkingTimeMs(timer, now) : 0);

  return <Page>
    <PageHeader title="Arbeitsjournal" description="Erfasse und verwalte deine Arbeitszeiten."/>
    <section className={`journal-hero ${timer ? 'journal-hero--active' : ''}`}>
      {timer ? <>
        <div className="timer-card">
          <div className={`status-pill ${timer.status === 'paused' ? 'status-pill--paused' : ''}`}><span/>{timer.status === 'paused' ? 'Pausiert' : 'Aktuelle Aktivität'}</div>
          <h2>{timer.title}</h2>
          {timer.linkedTaskId && <div className="timer-link"><Link2 size={14}/>{state.plannerTasks.find((task) => task.id === timer.linkedTaskId)?.title ?? 'Verknüpfter Task'}</div>}
          <div className="timer-value" aria-label={`Arbeitszeit ${formatDuration(getWorkingTimeMs(timer, now))}`}>{formatDuration(getWorkingTimeMs(timer, now))}</div>
          <div className="timer-actions">
            <Button variant="secondary" icon={timer.status === 'running' ? <CirclePause size={18}/> : <CirclePlay size={18}/>} onClick={togglePause}>{timer.status === 'running' ? 'Pausieren' : 'Fortsetzen'}</Button>
            <Button icon={<Square size={16}/>} onClick={stop}>Beenden</Button>
          </div>
          <span className="timer-paused">Pausenzeit: {formatDuration(getPausedTimeMs(timer, now), true)}</span>
        </div>
        <aside className="today-card">
          <span className="eyebrow">Heute</span>
          <div><span>Gesamtzeit</span><strong>{formatDuration(todayMs).slice(0, 5)}</strong></div>
          <div><span>Einträge</span><strong>{todayEntries.length}</strong></div>
          <Button variant="ghost" icon={<Plus size={17}/>} onClick={() => { setEditEntry(null); setEntryDialogOpen(true); }}>Neuer Eintrag</Button>
        </aside>
      </> : <form className="start-timer-card" onSubmit={start}>
        <div className="start-timer-card__fields">
          <Field label="Aktivität" error={validation}><Input id="activity-input" autoFocus placeholder="z. B. Innenräume in Blender modellieren" value={activity} onChange={(event) => { setActivity(event.target.value); setValidation(''); }}/></Field>
          {plannerIntegration && openTasks.length > 0 && <Field label="Aus Zeitplan übernehmen" optional><Select value={taskId} onChange={(event) => selectTask(event.target.value)}><option value="">Ohne Task starten</option>{openTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</Select></Field>}
        </div>
        <Button type="submit" icon={<CirclePlay size={18}/>}>Timer starten</Button>
      </form>}
    </section>
    <section className="content-section">
      <div className="section-heading"><div><h2>Verlauf</h2><p>{entries.length ? `${entries.length} gespeicherte ${entries.length === 1 ? 'Aktivität' : 'Aktivitäten'}` : 'Deine erfassten Arbeitszeiten'}</p></div>{!timer && <Button variant="secondary" size="sm" icon={<Plus size={16}/>} onClick={() => { setEditEntry(null); setEntryDialogOpen(true); }}>Eintrag</Button>}</div>
      {entries.length === 0 ? <EmptyState icon={<Clock3/>} title="Noch keine Einträge" description="Starte deinen ersten Timer, um dein Arbeitsjournal zu beginnen."/> :
        <div className="data-card journal-list" role="list">
          <div className="journal-row journal-row--head" aria-hidden="true"><span>Datum</span><span>Aktivität</span><span>Zeitraum</span><span>Dauer</span></div>
          {entries.map((entry) => <button className="journal-row" role="listitem" key={entry.id} onClick={() => { setEditEntry(entry); setEntryDialogOpen(true); }}>
            <span><CalendarDays size={15}/>{deDate(entry.startedAt)}</span>
            <span><strong>{entry.title}</strong>{entry.linkedTaskId && <small><Link2 size={12}/>{state.plannerTasks.find((task) => task.id === entry.linkedTaskId)?.title ?? 'Zeitplan-Task'}</small>}</span>
            <span>{time(entry.startedAt)} – {time(entry.endedAt)}</span>
            <span className="duration">{formatDuration(entry.workingTimeMs)}</span>
          </button>)}
        </div>}
    </section>
    <JournalEntryDialog open={entryDialogOpen} entry={editEntry} tasks={plannerIntegration ? state.plannerTasks : []} onClose={() => { setEntryDialogOpen(false); setEditEntry(null); }} onSave={saveEntry} onDelete={(entry) => setDeleteEntry(entry)}/>
    <ConfirmDialog open={!!deleteEntry} title="Eintrag löschen?" description="Dieser Journaleintrag wird dauerhaft entfernt. Der verknüpfte Zeitplan-Task bleibt bestehen." onCancel={() => setDeleteEntry(null)} onConfirm={confirmDelete}/>
  </Page>;
}
