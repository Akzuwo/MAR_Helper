import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, MessageSquarePlus, MessagesSquare, Pencil, Plus, Search, Trash2, WandSparkles } from 'lucide-react';
import type { PromptChat, PromptEntry } from '../../../shared/models';
import { createPromptChat, matchesPromptSearch, movePromptToChat, promptDisplayNumber, upsertPromptEntry } from '../../../shared/prompt-entries';
import { useAppData } from '../../state/AppDataContext';
import { Button, ConfirmDialog, EmptyState, Field, IconButton, Input, Modal, Select } from '../../components/ui';
import { Page, PageHeader } from '../../layout/Page';
import { ChatEditor } from './ChatEditor';
import { PromptDetail } from './PromptDetail';
import { PromptEditor } from './PromptEditor';

const dateTime = (iso: string) => new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const preview = (value: string) => value.replace(/```[\s\S]*?```/g, '[Codeblock]').replace(/[#*_`>|]/g, '').replace(/\s+/g, ' ').trim();
const promptHeading = (value: string) => preview(value).slice(0, 68) || 'Unbenannter Prompt';

export function PromptsPage() {
  const { state, updateState, toast } = useAppData();
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PromptEntry | null>(null);
  const [chatEditorOpen, setChatEditorOpen] = useState(false);
  const [editingChat, setEditingChat] = useState<PromptChat | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<PromptEntry | null>(null);
  const [deleteChat, setDeleteChat] = useState<PromptChat | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignChatId, setAssignChatId] = useState('');

  const selected = state.promptEntries.find((entry) => entry.id === selectedId) ?? null;
  const selectedChat = state.promptChats.find((chat) => chat.id === selectedChatId) ?? null;
  const chatEntries = useMemo(() => selectedChat
    ? state.promptEntries.filter((entry) => entry.chatId === selectedChat.id).sort((a, b) => a.number - b.number)
    : [], [selectedChat, state.promptEntries]);

  const filteredStandalone = useMemo(() => state.promptEntries
    .filter((entry) => !entry.chatId)
    .filter((entry) => !modelFilter || entry.modelName === modelFilter)
    .filter((entry) => matchesPromptSearch(entry, search, state.promptChats)), [state.promptEntries, state.promptChats, modelFilter, search]);
  const filteredChats = useMemo(() => state.promptChats.filter((chat) => {
    const entries = state.promptEntries.filter((entry) => entry.chatId === chat.id);
    const query = search.trim().toLocaleLowerCase('de');
    const searchMatch = !query || chat.title.toLocaleLowerCase('de').includes(query) || entries.some((entry) => matchesPromptSearch(entry, search, state.promptChats));
    const modelMatch = !modelFilter || entries.some((entry) => entry.modelName === modelFilter);
    return searchMatch && modelMatch;
  }), [state.promptChats, state.promptEntries, modelFilter, search]);

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

  const saveChat = (title: string) => {
    if (editingChat) {
      void updateState((current) => ({ ...current, promptChats: current.promptChats.map((chat) => chat.id === editingChat.id ? { ...chat, title, updatedAt: new Date().toISOString() } : chat) }), 'Chat umbenannt');
    } else {
      let createdId = '';
      void updateState((current) => { const result = createPromptChat(current, title); createdId = result.chat.id; return result.state; }, 'Chat erstellt').then(() => setSelectedChatId(createdId));
    }
    setChatEditorOpen(false); setEditingChat(null);
  };

  const confirmDeletePrompt = () => {
    if (!deleteEntry) return;
    void updateState((current) => ({ ...current, promptEntries: current.promptEntries.filter((entry) => entry.id !== deleteEntry.id) }), 'Prompt gelöscht');
    setSelectedId(null); setDeleteEntry(null);
  };

  const confirmDeleteChat = () => {
    if (!deleteChat) return;
    void updateState((current) => ({
      ...current,
      promptChats: current.promptChats.filter((chat) => chat.id !== deleteChat.id),
      promptEntries: current.promptEntries.filter((entry) => entry.chatId !== deleteChat.id)
    }), 'Chat gelöscht');
    setSelectedId(null); setSelectedChatId(null); setDeleteChat(null);
  };

  const promptEditor = <PromptEditor open={editorOpen} entry={editing} chat={editing?.chatId ? state.promptChats.find((chat) => chat.id === editing.chatId) : selectedChat} models={state.promptModels} onClose={() => { setEditorOpen(false); setEditing(null); }} onSave={save} onManageModels={() => toast('Modelle verwaltest du in den Einstellungen.', 'info')}/>;

  if (selected) return <>
    <PromptDetail entry={selected} chats={state.promptChats} onBack={() => setSelectedId(null)} onEdit={() => { setEditing(selected); setEditorOpen(true); }} onDelete={() => setDeleteEntry(selected)} onAssign={!selected.chatId && state.promptChats.length ? () => { setAssignChatId(state.promptChats[0].id); setAssignOpen(true); } : undefined} onCopied={() => toast('Prompt und Antwort kopiert')} onRemoveGit={() => void updateState((current) => ({ ...current, promptEntries: current.promptEntries.map((entry) => entry.id === selected.id ? { ...entry, gitSnapshot: undefined, updatedAt: new Date().toISOString() } : entry) }), 'Git-Verknüpfung entfernt')}/>
    {promptEditor}
    <Modal open={assignOpen} title="Einzelprompt zu Chat hinzufügen" description="Der Prompt erhält im ausgewählten Chat automatisch die nächste freie Unter­nummer." onClose={() => setAssignOpen(false)}>
      <div className="form-stack">
        <Field label="Chat"><Select value={assignChatId} onChange={(event) => setAssignChatId(event.target.value)}>{state.promptChats.map((chat) => <option key={chat.id} value={chat.id}>#{chat.number} – {chat.title}</option>)}</Select></Field>
        <div className="form-actions"><Button variant="secondary" onClick={() => setAssignOpen(false)}>Abbrechen</Button><Button onClick={() => { void updateState((current) => movePromptToChat(current, selected.id, assignChatId), 'Prompt zum Chat hinzugefügt'); setSelectedChatId(assignChatId); setAssignOpen(false); }}>Hinzufügen</Button></div>
      </div>
    </Modal>
    <ConfirmDialog open={!!deleteEntry} title="Prompt löschen?" description="Prompt und Antwort werden dauerhaft entfernt." onCancel={() => setDeleteEntry(null)} onConfirm={confirmDeletePrompt}/>
  </>;

  if (selectedChat) return <Page>
    <button type="button" className="breadcrumb" onClick={() => setSelectedChatId(null)}><ArrowLeft size={19}/> Zurück zum Promptprotokoll</button>
    <PageHeader title={selectedChat.title} eyebrow={`Chat #${selectedChat.number}`} description={`${chatEntries.length} ${chatEntries.length === 1 ? 'Prompt' : 'Prompts'} in diesem Chat`} actions={<><IconButton label="Chat umbenennen" onClick={() => { setEditingChat(selectedChat); setChatEditorOpen(true); }}><Pencil size={18}/></IconButton><IconButton label="Chat löschen" variant="danger" onClick={() => setDeleteChat(selectedChat)}><Trash2 size={18}/></IconButton><Button icon={<Plus size={18}/>} onClick={() => { setEditing(null); setEditorOpen(true); }}>Prompt hinzufügen</Button></>}/>
    {chatEntries.length === 0 ? <EmptyState icon={<MessagesSquare/>} title="Dieser Chat ist noch leer" description="Erfasse den ersten Prompt. Er erhält automatisch die Nummer des Chats mit dem Zusatz .1." action={<Button icon={<Plus size={17}/>} onClick={() => setEditorOpen(true)}>Prompt hinzufügen</Button>}/> :
      <div className="prompt-grid" role="list">{chatEntries.map((entry) => <button className="prompt-card" key={entry.id} role="listitem" onClick={() => setSelectedId(entry.id)}>
        <span className="prompt-card__number">#{promptDisplayNumber(entry, state.promptChats)}</span>
        <div className="prompt-card__title"><FileText size={18}/><h2>{entry.title?.trim() || promptHeading(entry.prompt)}</h2></div>
        <div className="prompt-card__meta"><span className="chip"><WandSparkles size={13}/>{entry.modelName}</span><time>{dateTime(entry.createdAt)}</time></div>
        {entry.title?.trim() && <p>{preview(entry.prompt).slice(0, 220)}{preview(entry.prompt).length > 220 ? ' …' : ''}</p>}
      </button>)}</div>}
    {promptEditor}
    <ChatEditor open={chatEditorOpen} chat={editingChat} onClose={() => { setChatEditorOpen(false); setEditingChat(null); }} onSave={saveChat}/>
    <ConfirmDialog open={!!deleteChat} title="Chat löschen?" description={`Der Chat und seine ${chatEntries.length} Prompt-Einträge werden dauerhaft entfernt.`} onCancel={() => setDeleteChat(null)} onConfirm={confirmDeleteChat}/>
  </Page>;

  const topLevel = [
    ...filteredStandalone.map((entry) => ({ kind: 'prompt' as const, createdAt: entry.createdAt, entry })),
    ...filteredChats.map((chat) => ({ kind: 'chat' as const, createdAt: chat.createdAt, chat }))
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const hasContent = state.promptEntries.length > 0 || state.promptChats.length > 0;

  return <Page>
    <PageHeader title="Promptprotokoll" description="Dokumentiere einzelne Prompts oder fasse zusammengehörige Prompts in Chats zusammen." actions={<>{hasContent && <Button variant="ghost" icon={<Trash2 size={17}/>} onClick={() => setDeleteAllOpen(true)}>Alle löschen</Button>}<Button variant="secondary" icon={<MessageSquarePlus size={18}/>} onClick={() => { setEditingChat(null); setChatEditorOpen(true); }}>Neuer Chat</Button><Button icon={<Plus size={18}/>} onClick={() => { setEditing(null); setEditorOpen(true); }}>Einzelprompt erfassen</Button></>}/>
    <div className="prompt-toolbar">
      <label className="search-box"><Search size={18}/><Input aria-label="Prompts durchsuchen" placeholder="Chats und Prompts durchsuchen …" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
      <Select aria-label="Nach Modell filtern" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}><option value="">Alle Modelle</option>{Array.from(new Set(state.promptEntries.map((entry) => entry.modelName))).sort().map((model) => <option key={model} value={model}>{model}</option>)}</Select>
    </div>
    {!hasContent ? <EmptyState icon={<WandSparkles/>} title="Noch keine Prompts" description="Erfasse einen einzelnen Prompt oder erstelle einen Chat für mehrere zusammengehörige Prompts." action={<Button icon={<Plus size={17}/>} onClick={() => setEditorOpen(true)}>Einzelprompt erfassen</Button>}/> : topLevel.length === 0 ? <EmptyState icon={<Search/>} title="Keine Treffer" description="Passe Suche oder Modellfilter an."/> :
      <div className="prompt-grid" role="list">{topLevel.map((item) => item.kind === 'chat' ? <button className="prompt-card prompt-card--chat" key={item.chat.id} role="listitem" onClick={() => setSelectedChatId(item.chat.id)}>
        <span className="prompt-card__number">Chat #{item.chat.number}</span>
        <div className="prompt-card__title"><MessagesSquare size={18}/><h2>{item.chat.title}</h2></div>
        <div className="prompt-card__meta"><span className="chip"><MessagesSquare size={13}/>{state.promptEntries.filter((entry) => entry.chatId === item.chat.id).length} Prompts</span><time>{dateTime(item.chat.createdAt)}</time></div>
        <p>Enthält hierarchisch nummerierte Prompt-Einträge.</p>
      </button> : <button className="prompt-card" key={item.entry.id} role="listitem" onClick={() => setSelectedId(item.entry.id)}>
        <span className="prompt-card__number">Einzelprompt #{item.entry.number}</span>
        <div className="prompt-card__title"><FileText size={18}/><h2>{item.entry.title?.trim() || promptHeading(item.entry.prompt)}</h2></div>
        <div className="prompt-card__meta"><span className="chip"><WandSparkles size={13}/>{item.entry.modelName}</span><time>{dateTime(item.entry.createdAt)}</time></div>
        {item.entry.title?.trim() && <p>{preview(item.entry.prompt).slice(0, 220)}{preview(item.entry.prompt).length > 220 ? ' …' : ''}</p>}
      </button>)}</div>}
    {promptEditor}
    <ChatEditor open={chatEditorOpen} chat={editingChat} onClose={() => { setChatEditorOpen(false); setEditingChat(null); }} onSave={saveChat}/>
    <ConfirmDialog open={deleteAllOpen} title="Gesamtes Promptprotokoll löschen?" description={`${state.promptEntries.length} Prompts und ${state.promptChats.length} Chats werden entfernt. Die fortlaufende Nummerierung wird nicht zurückgesetzt.`} confirmLabel="Alle löschen" onCancel={() => setDeleteAllOpen(false)} onConfirm={() => { void updateState((current) => ({ ...current, promptEntries: [], promptChats: [] }), 'Promptprotokoll geleert'); setDeleteAllOpen(false); }}/>
  </Page>;
}
