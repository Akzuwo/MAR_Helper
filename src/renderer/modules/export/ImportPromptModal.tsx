import { Copy, MessagesSquare, ScrollText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CHAT_IMPORT_FORMATTING_PROMPT, IMPORT_FORMATTING_PROMPT } from '../../../shared/import-format-prompt';
import { Button, Modal } from '../../components/ui';

export function ImportPromptModal({ open, onClose }: {
  open: boolean;
  onClose: () => void;
}) {
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  useEffect(() => { if (open) setFeedback(null); }, [open]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback({ message: `${label} kopiert`, error: false });
    } catch {
      setFeedback({ message: 'Der Prompt konnte nicht in die Zwischenablage kopiert werden.', error: true });
    }
  };

  return <Modal open={open} title="KI-Prompt kopieren" description="Wähle die Vorlage für deine Daten." onClose={onClose}>
    <div className="import-prompt-options">
      <section className="import-prompt-option">
        <MessagesSquare size={22}/>
        <div><h3>Chatverlauf importieren</h3><p>Formatiert alle Nachrichten eines Chats als JSON mit Chat-Zuordnung für das Promptprotokoll.</p></div>
        <Button icon={<Copy size={16}/>} onClick={() => void copy(CHAT_IMPORT_FORMATTING_PROMPT, 'Chat-Prompt')}>Chat-Prompt kopieren</Button>
      </section>
      <section className="import-prompt-option">
        <ScrollText size={22}/>
        <div><h3>Bestehende Protokolle umwandeln</h3><p>Die bisherige Vorlage für Arbeitsjournal, Promptprotokoll oder Zeitplan. Füge deine Daten nach dem kopierten Text ein.</p></div>
        <Button variant="secondary" icon={<Copy size={16}/>} onClick={() => void copy(IMPORT_FORMATTING_PROMPT, 'Protokoll-Prompt')}>Protokoll-Prompt kopieren</Button>
      </section>
      {feedback && <p className={`import-prompt-feedback ${feedback.error ? 'import-prompt-feedback--error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
    </div>
  </Modal>;
}
