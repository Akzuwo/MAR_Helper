import { ArrowLeft, Calendar, Copy, MessagesSquare, Pencil, Trash2, WandSparkles } from 'lucide-react';
import type { PromptChat, PromptEntry } from '../../../shared/models';
import { promptDisplayNumber } from '../../../shared/prompt-entries';
import { Button, IconButton } from '../../components/ui';
import { MarkdownContent } from '../../components/MarkdownContent';
import { Page, PageHeader } from '../../layout/Page';
import { GitSnapshotView } from '../git-integration/GitSnapshotView';
import { FileAttachments } from '../../components/FileAttachments';
import { useAppData } from '../../state/AppDataContext';

const dateTime = (iso: string) => new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
export function PromptDetail({ entry, chats, onBack, onEdit, onDelete, onAssign, onCopied, onRemoveGit }: {
  entry: PromptEntry; chats: PromptChat[]; onBack: () => void; onEdit: () => void; onDelete: () => void; onAssign?: () => void; onCopied: () => void; onRemoveGit: () => void
}) {
  const { state, toast } = useAppData();
  const openFile = async (id: string) => {
    const result = await window.marHelper.openStoredFile(id);
    if (!result.ok) toast(result.message, 'error');
  };
  const copyAll = async () => {
    await navigator.clipboard.writeText(`Prompt:\n${entry.prompt}\n\nAntwort:\n${entry.response}`);
    onCopied();
  };
  const title = entry.title?.trim();
  const chat = entry.chatId ? chats.find((item) => item.id === entry.chatId) : undefined;
  const number = promptDisplayNumber(entry, chats);
  return <Page className="prompt-detail-page">
    <button type="button" className="breadcrumb" onClick={onBack}><ArrowLeft size={19}/> Zurück zum Promptprotokoll</button>
    <PageHeader title={title || `#${number}`} eyebrow={title ? `#${number}` : undefined} actions={<>{onAssign && <Button variant="secondary" icon={<MessagesSquare size={17}/>} onClick={onAssign}>Zu Chat hinzufügen</Button>}<Button variant="secondary" icon={<Copy size={17}/>} onClick={copyAll}>Alles kopieren</Button><IconButton label="Prompt bearbeiten" onClick={onEdit}><Pencil size={18}/></IconButton><IconButton label="Prompt löschen" variant="danger" onClick={onDelete}><Trash2 size={18}/></IconButton></>}/>
    <div className="prompt-meta">{chat && <span>Chat #{chat.number}: {chat.title}</span>}<span><WandSparkles size={15}/>Modell: {entry.modelName}</span>{entry.reasoningLevel && <span>Reasoning: {entry.reasoningLevel}</span>}<span><Calendar size={15}/>{dateTime(entry.createdAt)}</span>{entry.updatedAt && <span>Bearbeitet {dateTime(entry.updatedAt)}</span>}</div>
    <article className="markdown-card">
      <header><span className="markdown-card__icon"><WandSparkles size={17}/></span><h2>Prompt</h2></header>
      <MarkdownContent>{entry.prompt}</MarkdownContent>
      {state.settings.modules.files && !!entry.promptFileIds?.length && <div className="markdown-card__attachments"><FileAttachments files={state.files.filter((file) => entry.promptFileIds?.includes(file.id))} onOpen={(id) => void openFile(id)}/></div>}
    </article>
    <article className="markdown-card markdown-card--answer">
      <header><span className="markdown-card__icon"><WandSparkles size={17}/></span><h2>Antwort</h2></header>
      <MarkdownContent>{entry.response}</MarkdownContent>
      {state.settings.modules.files && !!entry.responseFileIds?.length && <div className="markdown-card__attachments"><FileAttachments files={state.files.filter((file) => entry.responseFileIds?.includes(file.id))} onOpen={(id) => void openFile(id)}/></div>}
    </article>
    {entry.gitSnapshot && <GitSnapshotView snapshot={entry.gitSnapshot} onChange={onEdit} onRemove={onRemoveGit}/>}
  </Page>;
}
