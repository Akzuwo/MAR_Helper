import { useEffect, useState } from 'react';
import { FileCheck2, FolderOpen, Import, Replace, Rows3 } from 'lucide-react';
import type { ImportCounts, ImportPreview, ImportSelectResult } from '../../../shared/models';
import { useAppData } from '../../state/AppDataContext';
import { Button, ConfirmDialog, Modal } from '../../components/ui';

const kindLabel: Record<ImportPreview['kind'], string> = {
  backup: 'Vollständiger MAR-Helper-Export',
  journal: 'Arbeitsjournal',
  prompts: 'Promptprotokoll',
  planner: 'Zeitplan'
};

const countLabels: Array<{ key: keyof ImportCounts; title: string; unit: (count: number) => string }> = [
  { key: 'journal', title: 'Arbeitsjournal', unit: (count) => count === 1 ? 'Eintrag' : 'Einträge' },
  { key: 'prompts', title: 'Promptprotokoll', unit: (count) => count === 1 ? 'Eintrag' : 'Einträge' },
  { key: 'planner', title: 'Zeitplan', unit: (count) => count === 1 ? 'Task' : 'Tasks' },
  { key: 'models', title: 'KI-Modelle', unit: (count) => count === 1 ? 'Modell' : 'Modelle' },
  { key: 'repositories', title: 'Git-Repositories', unit: (count) => count === 1 ? 'Konfiguration' : 'Konfigurationen' },
  { key: 'gitSnapshots', title: 'Git-Diff-Snapshots', unit: (count) => count === 1 ? 'Snapshot' : 'Snapshots' },
  { key: 'activeTimer', title: 'Timer', unit: () => 'laufender oder pausierter Timer' }
];

export function ImportDialog({ open, selection, onClose }: { open: boolean; selection: ImportSelectResult | null; onClose: () => void }) {
  const { commitImport } = useAppData();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreview(selection && !selection.canceled && 'preview' in selection ? selection.preview : null);
    setError(selection && !selection.canceled && 'error' in selection ? selection.error : null);
    setMode('merge'); setBusy(false); setConfirmReplace(false);
  }, [open, selection]);

  const chooseFile = async () => {
    setError(null);
    const result = await window.marHelper.openImport();
    if (result.canceled) return;
    if ('error' in result) { setPreview(null); setError(result.error); return; }
    setPreview(result.preview); setMode('merge');
  };

  const apply = async () => {
    if (!preview) return;
    if (mode === 'replace') { setConfirmReplace(true); return; }
    await commit();
  };

  const commit = async () => {
    if (!preview) return;
    setConfirmReplace(false); setBusy(true);
    const success = await commitImport(preview.sessionId, mode);
    setBusy(false);
    if (success) onClose();
  };

  return <>
    <Modal open={open && !confirmReplace} title="Daten importieren" description="Importiere einen zuvor exportierten MAR-Helper-Datensatz." onClose={onClose}>
      <div className="import-dialog">
        {error ? <div className="import-error" role="alert"><strong>{error.title}</strong><span>{error.message}</span><Button variant="secondary" icon={<FolderOpen size={17}/>} onClick={() => void chooseFile()}>Andere Datei auswählen</Button></div> : preview ? <>
          <div className="import-summary">
            <span className="import-summary__icon"><FileCheck2 size={22}/></span>
            <div><strong>{kindLabel[preview.kind]}</strong><span>{preview.fileName}{preview.legacy ? ' · älteres, unterstütztes Exportformat' : ` · Formatversion ${preview.formatVersion}`}</span></div>
          </div>
          <div><strong className="import-counts__heading">Gefundene Daten</strong><div className="import-counts">
            {countLabels.map(({ key, title, unit }) => {
              const count = preview.counts[key];
              if (count === undefined || (count === 0 && (key === 'gitSnapshots' || key === 'activeTimer'))) return null;
              return <span key={key}><small>{title}</small><strong>{count}</strong>{unit(count)}</span>;
            })}
          </div></div>
          <fieldset className="import-mode">
            <legend>Wie sollen bestehende Daten behandelt werden?</legend>
            <label className={mode === 'merge' ? 'selected' : ''}>
              <input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')}/>
              <Rows3 size={19}/><span><strong>Mit bestehenden Daten zusammenführen</strong><small>Importierte Daten werden zu deinen vorhandenen Daten hinzugefügt.</small></span>
            </label>
            <label className={mode === 'replace' ? 'selected' : ''}>
              <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')}/>
              <Replace size={19}/><span><strong>Bestehende Daten ersetzen</strong><small>Die aktuellen MAR-Helper-Daten werden durch die Daten aus der Datei ersetzt.</small></span>
            </label>
          </fieldset>
          <p className="import-module-note">Deaktivierte Module bleiben deaktiviert. Enthaltene Daten werden trotzdem importiert.</p>
        </> : null}
        <div className="form-actions form-actions--between">
          <div>{preview && <Button variant="ghost" onClick={() => void chooseFile()}>Andere Datei</Button>}</div>
          <div className="form-actions"><Button variant="secondary" onClick={onClose}>Abbrechen</Button>{preview && <Button icon={<Import size={17}/>} disabled={busy} onClick={() => void apply()}>{busy ? 'Importiere …' : 'Importieren'}</Button>}</div>
        </div>
      </div>
    </Modal>
    <ConfirmDialog open={confirmReplace} title="Bestehende Daten ersetzen?" description="Deine aktuell gespeicherten MAR-Helper-Daten werden überschrieben. Dieser Vorgang kann nicht automatisch rückgängig gemacht werden." confirmLabel="Daten ersetzen" onCancel={() => setConfirmReplace(false)} onConfirm={() => void commit()}/>
  </>;
}
