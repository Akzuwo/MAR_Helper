import { useEffect, useState } from 'react';
import { FileCheck2, FileJson, FolderOpen, Import, Replace, Rows3 } from 'lucide-react';
import { applyImport, parseImport, type ImportBundle } from '../../../shared/importers';
import { useAppData } from '../../state/AppDataContext';
import { Button, Modal } from '../../components/ui';

const kindLabel: Record<ImportBundle['kind'], string> = {
  backup: 'Vollständiges MAR-Helper-Backup',
  journal: 'Arbeitsjournal',
  prompts: 'Promptprotokoll',
  planner: 'Zeitplan'
};

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { updateState } = useAppData();
  const [bundle, setBundle] = useState<ImportBundle | null>(null);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setBundle(null); setFileName(''); setMode('merge'); setError(''); setBusy(false); }
  }, [open]);

  const chooseFile = async () => {
    setError('');
    try {
      const result = await window.marHelper.openImport();
      if (result.canceled || !result.content) return;
      setBundle(parseImport(result.content));
      setFileName(result.fileName ?? 'Importdatei.json');
    } catch (caught) {
      setBundle(null);
      setError(caught instanceof Error ? caught.message : 'Die Datei konnte nicht gelesen werden.');
    }
  };

  const apply = async () => {
    if (!bundle) return;
    setBusy(true);
    const success = await updateState((current) => applyImport(current, bundle, mode), `${kindLabel[bundle.kind]} importiert`);
    setBusy(false);
    if (success) onClose();
  };

  return <Modal open={open} title="Daten importieren" description="Importiere ein Backup oder den JSON-Export eines einzelnen Moduls." onClose={onClose}>
    <div className="import-dialog">
      {!bundle ? <div className="import-file-picker">
        <div className="import-file-picker__icon"><FileJson size={28}/></div>
        <h3>JSON-Datei auswählen</h3>
        <p>Die Datei wird vor dem Import vollständig geprüft. Bestehende Daten werden noch nicht verändert.</p>
        <Button icon={<FolderOpen size={17}/>} onClick={chooseFile}>Datei auswählen</Button>
      </div> : <>
        <div className="import-summary">
          <span className="import-summary__icon"><FileCheck2 size={22}/></span>
          <div><strong>{kindLabel[bundle.kind]}</strong><span>{fileName}</span></div>
        </div>
        <div className="import-counts">
          {bundle.kind === 'backup' || bundle.kind === 'journal' ? <span><strong>{bundle.counts.journal}</strong> Journal</span> : null}
          {bundle.kind === 'backup' || bundle.kind === 'prompts' ? <span><strong>{bundle.counts.prompts}</strong> Prompts</span> : null}
          {bundle.kind === 'backup' || bundle.kind === 'planner' ? <span><strong>{bundle.counts.planner}</strong> Tasks</span> : null}
        </div>
        <fieldset className="import-mode">
          <legend>Importmethode</legend>
          <label className={mode === 'merge' ? 'selected' : ''}>
            <input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')}/>
            <Rows3 size={19}/><span><strong>Zusammenführen</strong><small>Neue Einträge ergänzen, gleiche IDs aktualisieren.</small></span>
          </label>
          <label className={mode === 'replace' ? 'selected' : ''}>
            <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')}/>
            <Replace size={19}/><span><strong>Ersetzen</strong><small>{bundle.kind === 'backup' ? 'Alle aktuellen Daten und Einstellungen ersetzen.' : `Alle aktuellen Daten im ${kindLabel[bundle.kind]} ersetzen.`}</small></span>
          </label>
        </fieldset>
        {mode === 'replace' && <p className="import-warning">Beim Ersetzen werden die betroffenen aktuellen Daten überschrieben. Erstelle vorher bei Bedarf ein Backup.</p>}
      </>}
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div className="form-actions form-actions--between">
        <div>{bundle && <Button variant="ghost" onClick={chooseFile}>Andere Datei</Button>}</div>
        <div className="form-actions"><Button variant="secondary" onClick={onClose}>Abbrechen</Button>{bundle && <Button icon={<Import size={17}/>} disabled={busy} onClick={apply}>{busy ? 'Importiere …' : 'Importieren'}</Button>}</div>
      </div>
    </div>
  </Modal>;
}
