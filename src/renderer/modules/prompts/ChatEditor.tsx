import { useEffect, useState } from 'react';
import type { PromptChat } from '../../../shared/models';
import { Button, Field, Input, Modal } from '../../components/ui';

export function ChatEditor({ open, chat, onClose, onSave }: {
  open: boolean;
  chat: PromptChat | null;
  onClose: () => void;
  onSave: (title: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(chat?.title ?? '');
    setError('');
  }, [chat, open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { setError('Bitte gib dem Chat einen Titel.'); return; }
    onSave(title.trim());
  };

  return <Modal open={open} title={chat ? 'Chat umbenennen' : 'Neuen Chat erstellen'} description="Prompts in einem Chat werden gemeinsam und hierarchisch nummeriert." onClose={onClose}>
    <form onSubmit={submit} className="form-stack">
      <Field label="Chat-Titel" error={error}><Input autoFocus placeholder="z. B. Kapitel 3 überarbeiten" value={title} onChange={(event) => { setTitle(event.target.value); setError(''); }}/></Field>
      <div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">{chat ? 'Titel speichern' : 'Chat erstellen'}</Button></div>
    </form>
  </Modal>;
}
