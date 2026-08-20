import { CalendarClock, Clock3, FileOutput, Redo2, Settings, Undo2, WandSparkles } from 'lucide-react';
import brandLogo from '../../../references/logo/screen.png';
import type { ModuleId } from '../../shared/models';

export type PageId = ModuleId | 'export' | 'settings';

const moduleItems: Array<{ id: ModuleId; label: string; icon: React.ReactNode }> = [
  { id: 'journal', label: 'Arbeitsjournal', icon: <Clock3 size={20}/> },
  { id: 'prompts', label: 'Promptprotokoll', icon: <WandSparkles size={20}/> },
  { id: 'planner', label: 'Zeitplan', icon: <CalendarClock size={20}/> }
];

export function Sidebar({ page, modules, onNavigate, canUndo, canRedo, onUndo, onRedo }: {
  page: PageId; modules: Record<ModuleId, boolean>; onNavigate: (page: PageId) => void;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void
}) {
  return <aside className="sidebar">
    <div className="sidebar__brand">
      <div className="brand-logo" aria-hidden="true"><img src={brandLogo} alt=""/></div>
      <div><strong>MAR Helper</strong><span>Modular Assistant</span></div>
    </div>
    <nav className="sidebar__nav" aria-label="Hauptnavigation">
      {moduleItems.filter((item) => modules[item.id]).map((item) =>
        <button key={item.id} className={page === item.id ? 'active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>
          {item.icon}<span>{item.label}</span>
        </button>
      )}
      {!Object.values(modules).some(Boolean) && <p className="sidebar__empty">Keine Module aktiv</p>}
    </nav>
    <div className="history-controls" aria-label="Änderungshistorie">
      <button disabled={!canUndo} title="Rückgängig (Strg+Z)" aria-label="Letzte Änderung rückgängig machen" onClick={onUndo}><Undo2 size={18}/></button>
      <button disabled={!canRedo} title="Wiederholen (Strg+Y)" aria-label="Änderung wiederherstellen" onClick={onRedo}><Redo2 size={18}/></button>
    </div>
    <nav className="sidebar__nav sidebar__nav--bottom" aria-label="Verwaltung">
      <button className={page === 'export' ? 'active' : ''} onClick={() => onNavigate('export')}><FileOutput size={20}/><span>Import & Export</span></button>
      <button className={page === 'settings' ? 'active' : ''} onClick={() => onNavigate('settings')}><Settings size={20}/><span>Einstellungen</span></button>
    </nav>
  </aside>;
}
