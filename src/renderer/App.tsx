import { useCallback, useEffect, useState } from 'react';
import { useAppData } from './state/AppDataContext';
import { ErrorScreen, LoadingScreen, Toasts } from './components/ui';
import { Sidebar, type PageId } from './layout/Sidebar';
import { JournalPage } from './modules/journal/JournalPage';
import { PromptsPage } from './modules/prompts/PromptsPage';
import { PlannerPage } from './modules/planner/PlannerPage';
import { ExportPage } from './modules/export/ExportPage';
import { SettingsPage } from './modules/settings/SettingsPage';

export default function App() {
  const { state, loading, loadError, toasts, dismissToast } = useAppData();
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
    <Sidebar page={page} modules={state.settings.modules} onNavigate={navigate}/>
    <div className="app-canvas">
      {page === 'journal' && <JournalPage/>}
      {page === 'prompts' && <PromptsPage/>}
      {page === 'planner' && <PlannerPage/>}
      {page === 'export' && <ExportPage/>}
      {page === 'settings' && <SettingsPage/>}
    </div>
    <Toasts toasts={toasts} dismiss={dismissToast}/>
  </div>;
}
