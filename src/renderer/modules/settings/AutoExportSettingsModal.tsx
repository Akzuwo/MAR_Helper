import { useEffect, useState } from 'react';
import { FolderOpen, Files } from 'lucide-react';
import type { AutoExportSettings } from '../../../shared/models';
import { Button, Field, Input, Modal } from '../../components/ui';

export function AutoExportSettingsModal({ open, settings, onClose, onSave }: {
  open: boolean;
  settings: AutoExportSettings;
  onClose: () => void;
  onSave: (settings: AutoExportSettings) => void;
}) {
  const [directory, setDirectory] = useState('');
  const [fileName, setFileName] = useState('');
  const [separateDocuments, setSeparateDocuments] = useState(false);
  const [journalFileName, setJournalFileName] = useState('');
  const [promptsFileName, setPromptsFileName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDirectory(settings.directory ?? '');
    setFileName(settings.fileName);
    setSeparateDocuments(settings.separateDocuments);
    setJournalFileName(settings.journalFileName);
    setPromptsFileName(settings.promptsFileName);
    setError('');
  }, [open, settings]);

  const chooseFolder = async () => {
    const result = await window.marHelper.selectAutoExportFolder();
    if (!result.canceled) { setDirectory(result.directory); setError(''); }
  };

  const normalizeName = (value: string) => {
    const cleaned = value.trim().replace(/[\\/:*?"<>|]/g, '-');
    return cleaned.toLocaleLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!directory.trim()) return setError('Bitte wähle einen Speicherort aus.');
    if ((!separateDocuments && !fileName.trim()) || (separateDocuments && (!journalFileName.trim() || !promptsFileName.trim()))) return setError('Bitte gib für jedes PDF einen Dateinamen ein.');
    const journalName = normalizeName(journalFileName);
    const promptsName = normalizeName(promptsFileName);
    if (separateDocuments && journalName.toLocaleLowerCase() === promptsName.toLocaleLowerCase()) return setError('Die beiden PDFs benötigen unterschiedliche Dateinamen.');
    onSave({
      enabled: settings.enabled,
      directory: directory.trim(),
      fileName: normalizeName(fileName),
      separateDocuments,
      journalFileName: journalName,
      promptsFileName: promptsName
    });
  };

  return <Modal open={open} title="Automatischen PDF-Export einrichten" description="Lege Speicherort, Dateinamen und Dokumentaufteilung fest." onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      <Field label="Speicherort" error={error && !directory ? error : undefined}>
        <div className="field-row"><Input readOnly value={directory} placeholder="Noch kein Ordner ausgewählt"/><Button type="button" variant="secondary" icon={<FolderOpen size={16}/>} onClick={() => void chooseFolder()}>Auswählen</Button></div>
      </Field>
      <label className="setting-choice">
        <span className="setting-row__icon"><Files size={20}/></span>
        <span><strong>Separate Dokumente</strong><small>Arbeitsjournal und Promptprotokoll als zwei eigenständige PDFs exportieren.</small></span>
        <button type="button" className={`switch ${separateDocuments ? 'on' : ''}`} role="switch" aria-checked={separateDocuments} onClick={() => setSeparateDocuments((value) => !value)}><span/></button>
      </label>
      {separateDocuments ? <div className="form-grid">
        <Field label="Dateiname Arbeitsjournal"><Input value={journalFileName} onChange={(event) => { setJournalFileName(event.target.value); setError(''); }}/></Field>
        <Field label="Dateiname Promptprotokoll"><Input value={promptsFileName} onChange={(event) => { setPromptsFileName(event.target.value); setError(''); }}/></Field>
      </div> : <Field label="Dateiname"><Input value={fileName} onChange={(event) => { setFileName(event.target.value); setError(''); }}/></Field>}
      {error && directory && <div className="inline-error" role="alert">{error}</div>}
      <div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Einstellungen speichern</Button></div>
    </form>
  </Modal>;
}
