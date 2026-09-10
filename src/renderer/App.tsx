import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppData } from './state/AppDataContext';
import { Button, ErrorScreen, LoadingScreen, Modal, Toasts } from './components/ui';
import { Sidebar, type PageId } from './layout/Sidebar';
import { JournalPage } from './modules/journal/JournalPage';
import { PromptsPage } from './modules/prompts/PromptsPage';
import { PlannerPage } from './modules/planner/PlannerPage';
import { ExportPage } from './modules/export/ExportPage';
import { SettingsPage } from './modules/settings/SettingsPage';
import { FilesPage } from './modules/files/FilesPage';
import { UpdateModal } from './components/UpdateModal';
import { TermsModal } from './components/TermsModal';
import { ChangelogModal } from './components/ChangelogModal';
import { APP_VERSION } from '../shared/app-version';
import { getChangelogRelease, hasSeenChangelogVersion, markChangelogVersionSeen } from './changelog';

function PageContent({ page }: { page: PageId }) {
  if (page === 'journal') return <JournalPage/>;
  if (page === 'prompts') return <PromptsPage/>;
  if (page === 'planner') return <PlannerPage/>;
  if (page === 'export') return <ExportPage/>;
  if (page === 'files') return <FilesPage/>;
  return <SettingsPage/>;
}

function PageTransition({ page }: { page: PageId }) {
  const [visiblePage, setVisiblePage] = useState(page);
  const [phase, setPhase] = useState<'idle' | 'enter' | 'exit'>('enter');
  const targetPage = useRef(page);

  useEffect(() => {
    targetPage.current = page;
    if (page !== visiblePage) setPhase('exit');
  }, [page, visiblePage]);

  const finishTransition = (event: React.AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (phase === 'exit') {
      setVisiblePage(targetPage.current);
      setPhase('enter');
    } else if (phase === 'enter') {
      setPhase('idle');
    }
  };

  return <div className={`page-stage page-stage--${phase}`} onAnimationEnd={finishTransition}>
    <PageContent page={visiblePage}/>
  </div>;
}

export default function App() {
  const { state, loading, loadError, historyStatus, cloudSaveStatus, updateState, undo, redo, toasts, dismissToast } = useAppData();
  const [page, setPage] = useState<PageId>('journal');
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);

  useEffect(() => {
    if ((page === 'journal' || page === 'prompts' || page === 'planner' || page === 'files') && !state.settings.modules[page]) {
      const firstActive = (['journal', 'prompts', 'planner', 'files'] as const).find((module) => state.settings.modules[module]);
      setPage(firstActive ?? 'settings');
    }
  }, [page, state.settings.modules]);

  const navigate = useCallback((target: PageId) => setPage(target), []);
  const finishIntro = useCallback(() => setIntroComplete(true), []);
  const noteInstalledVersionShown = useCallback((version: string) => {
    markChangelogVersionSeen(version);
    setChangelogOpen(false);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (getChangelogRelease(APP_VERSION) && !hasSeenChangelogVersion(APP_VERSION)) setChangelogOpen(true);
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, []);

  if (loading || !introComplete) return <LoadingScreen onComplete={finishIntro}/>;
  if (loadError) return <ErrorScreen message={loadError} retry={() => window.location.reload()}/>;

  const pausedEmphasis = state.settings.visualEffects.scrollEffects && state.activeTimer?.status === 'paused';

  return <div className={`app-shell ${pausedEmphasis ? 'app-shell--paused-emphasis' : ''}`}>
    <Sidebar page={page} modules={state.settings.modules} onNavigate={navigate} canUndo={historyStatus.canUndo} canRedo={historyStatus.canRedo} onUndo={() => void undo()} onRedo={() => void redo()}/>
    <div className="app-canvas">
      <PageTransition page={page}/>
    </div>
    <UpdateModal onInstalledVersionShown={noteInstalledVersionShown}/>
    <ChangelogModal open={changelogOpen} onClose={() => { markChangelogVersionSeen(APP_VERSION); setChangelogOpen(false); }}/>
    <TermsModal open={!state.settings.termsAcceptedAt} mandatory onClose={() => undefined} onAccept={() => void updateState((current) => ({ ...current, settings: { ...current.settings, termsAcceptedAt: new Date().toISOString() } }))}/>
    <Modal open={cloudSaveStatus.state === 'conflict'} title="Grosse Cloud-Änderung erkannt" description="Der Cloud-Stand unterscheidet sich stark von deinen lokalen Daten." onClose={() => undefined} dismissible={false}>
      {cloudSaveStatus.state === 'conflict' && <div className="form-stack">
        <p className="confirm-copy">Lokal sind {cloudSaveStatus.localEntries} Einträge gespeichert, in der Cloud {cloudSaveStatus.remoteEntries}. Insgesamt unterscheiden sich {cloudSaveStatus.changedEntries} Einträge. Wähle bewusst, welcher Stand weiterverwendet werden soll.</p>
        <div className="form-actions"><Button variant="secondary" onClick={() => void window.marHelper.resolveCloudConflict(false)}>Lokalen Stand behalten</Button><Button onClick={() => void window.marHelper.resolveCloudConflict(true)}>Cloud-Stand laden</Button></div>
      </div>}
    </Modal>
    <Toasts toasts={toasts} dismiss={dismissToast}/>
  </div>;
}
