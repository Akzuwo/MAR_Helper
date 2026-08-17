import { ArrowLeft, Calendar, Copy, Pencil, Trash2, WandSparkles } from 'lucide-react';
import type { PromptEntry } from '../../../shared/models';
import { Button, IconButton } from '../../components/ui';
import { MarkdownContent } from '../../components/MarkdownContent';
import { Page, PageHeader } from '../../layout/Page';
import { GitSnapshotView } from '../git-integration/GitSnapshotView';

const dateTime = (iso: string) => new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const titleFromPrompt = (prompt: string) => prompt.split('\n').find((line) => line.trim())?.replace(/^#+\s*/, '').slice(0, 72) || 'Prompt-Detail';

export function PromptDetail({ entry, onBack, onEdit, onDelete, onCopied, onRemoveGit }: {
  entry: PromptEntry; onBack: () => void; onEdit: () => void; onDelete: () => void; onCopied: () => void; onRemoveGit: () => void
}) {
  const copyAll = async () => {
    await navigator.clipboard.writeText(`Prompt:\n${entry.prompt}\n\nAntwort:\n${entry.response}`);
    onCopied();
  };
  return <Page className="prompt-detail-page">
    <button className="breadcrumb" onClick={onBack}><ArrowLeft size={16}/> Promptprotokoll</button>
    <PageHeader title={titleFromPrompt(entry.prompt)} description="Vollständige Interaktion" actions={<><Button variant="secondary" icon={<Copy size={17}/>} onClick={copyAll}>Alles kopieren</Button><IconButton label="Prompt bearbeiten" onClick={onEdit}><Pencil size={18}/></IconButton><IconButton label="Prompt löschen" variant="danger" onClick={onDelete}><Trash2 size={18}/></IconButton></>}/>
    <div className="prompt-meta"><span><WandSparkles size={15}/>Modell: {entry.modelName}</span><span><Calendar size={15}/>{dateTime(entry.createdAt)}</span>{entry.updatedAt && <span>Bearbeitet {dateTime(entry.updatedAt)}</span>}</div>
    <article className="markdown-card">
      <header><span className="markdown-card__icon"><WandSparkles size={17}/></span><h2>Prompt</h2></header>
      <MarkdownContent>{entry.prompt}</MarkdownContent>
    </article>
    <article className="markdown-card markdown-card--answer">
      <header><span className="markdown-card__icon"><WandSparkles size={17}/></span><h2>Antwort</h2></header>
      <MarkdownContent>{entry.response}</MarkdownContent>
    </article>
    {entry.gitSnapshot && <GitSnapshotView snapshot={entry.gitSnapshot} onChange={onEdit} onRemove={onRemoveGit}/>}
  </Page>;
}
