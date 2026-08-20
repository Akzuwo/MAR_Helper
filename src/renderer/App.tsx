import { useCallback, useEffect, useState } from 'react';
import { useAppData } from './state/AppDataContext';
import { Button, ErrorScreen, LoadingScreen, Modal, Toasts } from './components/ui';
import { Sidebar, type PageId } from './layout/Sidebar';
import { JournalPage } from './modules/journal/JournalPage';
import { PromptsPage } from './modules/prompts/PromptsPage';
import { PlannerPage } from './modules/planner/PlannerPage';
import { ExportPage } from './modules/export/ExportPage';
import { SettingsPage } from './modules/settings/SettingsPage';
import { UpdateModal } from './components/UpdateModal';

export default function App() {
  const { state, loading, loadError, historyStatus, cloudSaveStatus, undo, redo, toasts, dismissToast } = useAppData();
  const [page, setPage] = useState<PageId>('journal');

  useEffect(() => {
    if ((page === 'journal' || page === 'prompts' || page === 'planner') && !state.settings.modules[page]) {
      const firstActive = (['journal', 'prompts', 'planner'] as const).find((module) => state.settings.modules[module]);
      setPage(firstActive ?? 'settings');
    }
  }, [page, state.settings.modules]);

  const navigate = useCallback((target: PageId) => setPage(target), []);

  if (loading) return <LoadingScreen/>;
  if (loadError) return <ErrorScreen message={loadError} retry={() => window.location.reload()}/>;

  return <div className="app-shell">
    <Sidebar page={page} modules={state.settings.modules} onNavigate={navigate} canUndo={historyStatus.canUndo} canRedo={historyStatus.canRedo} onUndo={() => void undo()} onRedo={() => void redo()}/>
    <div className="app-canvas">
      {page === 'journal' && <JournalPage/>}
      {page === 'prompts' && <PromptsPage/>}
      {page === 'planner' && <PlannerPage/>}
      {page === 'export' && <ExportPage/>}
      {page === 'settings' && <SettingsPage/>}
    </div>
    <UpdateModal/>
    <Modal open={cloudSaveStatus.state === 'conflict'} title="Grosse Cloud-Änderung erkannt" description="Der Cloud-Stand unterscheidet sich stark von deinen lokalen Daten." onClose={() => undefined} dismissible={false}>
      {cloudSaveStatus.state === 'conflict' && <div className="form-stack">
        <p className="confirm-copy">Lokal sind {cloudSaveStatus.localEntries} Einträge gespeichert, in der Cloud {cloudSaveStatus.remoteEntries}. Insgesamt unterscheiden sich {cloudSaveStatus.changedEntries} Einträge. Wähle bewusst, welcher Stand weiterverwendet werden soll.</p>
        <div className="form-actions"><Button variant="secondary" onClick={() => void window.marHelper.resolveCloudConflict(false)}>Lokalen Stand behalten</Button><Button onClick={() => void window.marHelper.resolveCloudConflict(true)}>Cloud-Stand laden</Button></div>
      </div>}
    </Modal>
    <Toasts toasts={toasts} dismiss={dismissToast}/>
  </div>;
}
