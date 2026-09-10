import { File, Image, Paperclip, Trash2 } from 'lucide-react';
import type { StoredFile } from '../../shared/models';
import { Button, IconButton } from './ui';

const fileSize = (bytes: number) => bytes < 1024
  ? `${bytes} B`
  : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function FileAttachments({ files, editable = false, onAdd, onRemove, onOpen }: {
  files: StoredFile[];
  editable?: boolean;
  onAdd?: () => void;
  onRemove?: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return <div className="attachments">
    {files.length > 0 && <div className="attachment-list">{files.map((file) =>
      <div className="attachment" key={file.id}>
        <button type="button" className="attachment__open" onClick={() => onOpen(file.id)}>
          <span>{file.mimeType.startsWith('image/') ? <Image size={18}/> : <File size={18}/>}</span>
          <span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span>
        </button>
        {editable && onRemove && <IconButton label={`${file.name} entfernen`} variant="ghost" onClick={() => onRemove(file.id)}><Trash2 size={16}/></IconButton>}
      </div>
    )}</div>}
    {editable && onAdd && <Button type="button" size="sm" variant="secondary" icon={<Paperclip size={16}/>} onClick={onAdd}>Dateien anheften</Button>}
  </div>;
}
