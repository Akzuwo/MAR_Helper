import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Search, WandSparkles } from 'lucide-react';
import type { PromptEntry } from '../../../shared/models';
import { matchesPromptSearch, upsertPromptEntry } from '../../../shared/prompt-entries';
import { useAppData } from '../../state/AppDataContext';
import { Button, ConfirmDialog, EmptyState, Input, Select } from '../../components/ui';
import { Page, PageHeader } from '../../layout/Page';
import { PromptDetail } from './PromptDetail';
import { PromptEditor } from './PromptEditor';

const dateTime = (iso: string) => new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const preview = (value: string) => value.replace(/```[\s\S]*?```/g, '[Codeblock]').replace(/[#*_>`|]/g, '').replace(/\s+/g, ' ').trim();
const promptHeading = (value: string) => preview(value).slice(0, 68) || 'Unbenannter Prompt';

export function PromptsPage() {
  const { state, updateState, toast } = useAppData();
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PromptEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<PromptEntry | null>(null);

  const selected = state.promptEntries.find((entry) => entry.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    return [...state.promptEntries]
      .filter((entry) => !modelFilter || entry.modelName === modelFilter)
      .filter((entry) => matchesPromptSearch(entry, search))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [state.promptEntries, modelFilter, search]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.ctrlKey && event.key.toLowerCase() === 'n' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        event.preventDefault(); setEditing(null); setEditorOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const save = (entry: PromptEntry) => {
    void updateState((current) => upsertPromptEntry(current, entry), editing ? 'Prompt aktualisiert' : 'Prompt gespeichert');
    setEditorOpen(false); setEditing(null); setSelectedId(entry.id);
  };

  const confirmDelete = () => {
    if (!deleteEntry) return;
    void updateState((current) => ({ ...current, promptEntries: current.promptEntries.filter((entry) => entry.id !== deleteEntry.id) }), 'Prompt gelöscht');
    setSelectedId(null); setDeleteEntry(null);
  };

  if (selected) return <>
    <PromptDetail entry={selected} onBack={() => setSelectedId(null)} onEdit={() => { setEditing(selected); setEditorOpen(true); }} onDelete={() => setDeleteEntry(selected)} onCopied={() => toast('Prompt und Antwort kopiert')} onRemoveGit={() => void updateState((current) => ({ ...current, promptEntries: current.promptEntries.map((entry) => entry.id === selected.id ? { ...entry, gitSnapshot: undefined, updatedAt: new Date().toISOString() } : entry) }), 'Git-Verknüpfung entfernt')}/>
    <PromptEditor open={editorOpen} entry={editing} models={state.promptModels} onClose={() => { setEditorOpen(false); setEditing(null); }} onSave={save} onManageModels={() => toast('Modelle verwaltest du in den Einstellungen.', 'info')}/>
    <ConfirmDialog open={!!deleteEntry} title="Prompt löschen?" description="Prompt und Antwort werden dauerhaft entfernt." onCancel={() => setDeleteEntry(null)} onConfirm={confirmDelete}/>
  </>;

  return <Page>
    <PageHeader title="Promptprotokoll" description="Dokumentiere verwendete KI-Prompts und Antworten." actions={<Button icon={<Plus size={18}/>} onClick={() => { setEditing(null); setEditorOpen(true); }}>Prompt erfassen</Button>}/>
    <div className="prompt-toolbar">
      <label className="search-box"><Search size={18}/><Input aria-label="Prompts durchsuchen" placeholder="Suche in Prompts …" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
      <Select aria-label="Nach Modell filtern" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}><option value="">Alle Modelle</option>{Array.from(new Set(state.promptEntries.map((entry) => entry.modelName))).sort().map((model) => <option key={model} value={model}>{model}</option>)}</Select>
    </div>
    {state.promptEntries.length === 0 ? <EmptyState icon={<WandSparkles/>} title="Noch keine Prompts" description="Erfasse deinen ersten KI-Prompt samt Antwort für eine lückenlose Dokumentation." action={<Button icon={<Plus size={17}/>} onClick={() => setEditorOpen(true)}>Prompt erfassen</Button>}/> : filtered.length === 0 ? <EmptyState icon={<Search/>} title="Keine Treffer" description="Passe Suche oder Modellfilter an."/> :
      <div className="prompt-grid" role="list">
        {filtered.map((entry) => <button className="prompt-card" key={entry.id} role="listitem" onClick={() => setSelectedId(entry.id)}>
          <span className="prompt-card__number">#{entry.number}</span>
          <div className="prompt-card__title"><FileText size={18}/><h2>{entry.title?.trim() || promptHeading(entry.prompt)}</h2></div>
          <div className="prompt-card__meta"><span className="chip"><WandSparkles size={13}/>{entry.modelName}</span><time>{dateTime(entry.createdAt)}</time></div>
          {entry.title?.trim() && <p>{preview(entry.prompt).slice(0, 220)}{preview(entry.prompt).length > 220 ? ' …' : ''}</p>}
        </button>)}
      </div>}
    <PromptEditor open={editorOpen} entry={editing} models={state.promptModels} onClose={() => { setEditorOpen(false); setEditing(null); }} onSave={save} onManageModels={() => toast('Modelle verwaltest du in den Einstellungen.', 'info')}/>
  </Page>;
}
