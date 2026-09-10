import { useMemo, useState } from 'react';
import { File, Files, Image, Trash2 } from 'lucide-react';
import type { StoredFile } from '../../../shared/models';
import { ConfirmDialog, EmptyState, IconButton } from '../../components/ui';
import { Page, PageHeader } from '../../layout/Page';
import { useAppData } from '../../state/AppDataContext';

const dateTime = (iso: string) => new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const fileSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function FilesPage() {
  const { state, applyPersistedState, toast } = useAppData();
  const [pendingDelete, setPendingDelete] = useState<StoredFile | null>(null);
  const references = useMemo(() => new Map(state.files.map((file) => [file.id, state.promptEntries.reduce((count, entry) =>
    count + (entry.promptFileIds?.includes(file.id) ? 1 : 0) + (entry.responseFileIds?.includes(file.id) ? 1 : 0), 0)])), [state.files, state.promptEntries]);

  const open = async (id: string) => {
    const result = await window.marHelper.openStoredFile(id);
    if (!result.ok) toast(result.message, 'error');
  };

  const remove = async () => {
    if (!pendingDelete) return;
    const result = await window.marHelper.deleteStoredFile(pendingDelete.id);
    if (!result.ok) toast(result.message, 'error');
    else { await applyPersistedState(result.state); toast('Datei gelöscht und Verknüpfungen entfernt'); }
    setPendingDelete(null);
  };

  return <Page>
    <PageHeader title="Dateien" description="Lokale Kopien aller angehefteten Dateien. Originaldateien bleiben unverändert."/>
    {state.files.length === 0 ? <EmptyState icon={<Files/>} title="Noch keine Dateien" description="Dateien kannst du beim Erfassen oder Bearbeiten eines Prompts an Prompt und Antwort anheften."/> :
      <div className="data-card file-table">
        <div className="file-row file-row--head"><span>Datei</span><span>Hinzugefügt</span><span>Verknüpft</span><span/></div>
        {[...state.files].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((file) => <div className="file-row" key={file.id}>
          <button type="button" className="file-row__name" onClick={() => void open(file.id)}>
            <span>{file.mimeType.startsWith('image/') ? <Image size={19}/> : <File size={19}/>}</span>
            <span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span>
          </button>
          <time>{dateTime(file.createdAt)}</time>
          <span>{references.get(file.id) ?? 0}×</span>
          <IconButton label={`${file.name} löschen`} variant="danger" onClick={() => setPendingDelete(file)}><Trash2 size={17}/></IconButton>
        </div>)}
      </div>}
    <ConfirmDialog open={!!pendingDelete} title="Datei löschen?" description={`„${pendingDelete?.name ?? ''}“ wird aus dem lokalen Speicher gelöscht und aus allen Prompts entfernt. Die ursprüngliche Datei bleibt unverändert.`} confirmLabel="Datei löschen" onCancel={() => setPendingDelete(null)} onConfirm={() => void remove()}/>
  </Page>;
}
