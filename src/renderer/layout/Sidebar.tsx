import { CalendarClock, Clock3, FileOutput, Settings, Sparkles, WandSparkles } from 'lucide-react';
import type { ModuleId } from '../../shared/models';

export type PageId = ModuleId | 'export' | 'settings';

const moduleItems: Array<{ id: ModuleId; label: string; icon: React.ReactNode }> = [
  { id: 'journal', label: 'Arbeitsjournal', icon: <Clock3 size={20}/> },
  { id: 'prompts', label: 'Promptprotokoll', icon: <WandSparkles size={20}/> },
  { id: 'planner', label: 'Zeitplan', icon: <CalendarClock size={20}/> }
];

export function Sidebar({ page, modules, onNavigate }: {
  page: PageId; modules: Record<ModuleId, boolean>; onNavigate: (page: PageId) => void
}) {
  return <aside className="sidebar">
    <div className="sidebar__brand">
      <div className="brand-mark"><Sparkles size={21}/></div>
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
    <nav className="sidebar__nav sidebar__nav--bottom" aria-label="Verwaltung">
      <button className={page === 'export' ? 'active' : ''} onClick={() => onNavigate('export')}><FileOutput size={20}/><span>Export</span></button>
      <button className={page === 'settings' ? 'active' : ''} onClick={() => onNavigate('settings')}><Settings size={20}/><span>Einstellungen</span></button>
    </nav>
  </aside>;
}
