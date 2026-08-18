import { useEffect, useState } from 'react';
import { ClipboardPaste, FileCheck2, FileJson, FolderOpen, Import, Replace, Rows3, ScanSearch } from 'lucide-react';
import type { ImportCounts, ImportPreview, ImportSelectResult } from '../../../shared/models';
import { useAppData } from '../../state/AppDataContext';
import { Button, ConfirmDialog, Modal, Textarea } from '../../components/ui';

const kindLabel: Record<ImportPreview['kind'], string> = {
  backup: 'Vollständiger MAR-Helper-Export', journal: 'Arbeitsjournal', prompts: 'Promptprotokoll', planner: 'Zeitplan'
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

type InputKind = 'file' | 'rawText';

export function ImportDialog({ open, selection, allowRawText, initialSource = 'file', onClose }: {
  open: boolean; selection: ImportSelectResult | null; allowRawText: boolean; initialSource?: InputKind; onClose: () => void
}) {
  const { commitImport } = useAppData();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [inputKind, setInputKind] = useState<InputKind>('file');
  const [rawText, setRawText] = useState('');

  useEffect(() => {
    if (!open) return;
    const selectedPreview = selection && !selection.canceled && 'preview' in selection ? selection.preview : null;
    setPreview(selectedPreview);
    setError(selection && !selection.canceled && 'error' in selection ? selection.error : null);
    setInputKind(selectedPreview?.source ?? initialSource);
    setRawText(''); setMode('merge'); setBusy(false); setConfirmReplace(false);
  }, [open, selection, initialSource]);

  const consumeResult = (result: ImportSelectResult) => {
    if (result.canceled) return;
    if ('error' in result) { setPreview(null); setError(result.error); return; }
    setPreview(result.preview); setInputKind(result.preview.source ?? inputKind); setMode('merge'); setError(null);
  };

  const chooseFile = async () => {
    setError(null); setBusy(true);
    try { consumeResult(await window.marHelper.openImport()); }
    finally { setBusy(false); }
  };

  const analyzeRawText = async () => {
    if (!rawText.trim()) { setError({ title: 'Noch keine Daten', message: 'Füge zuerst den zu importierenden Text ein.' }); return; }
    setError(null); setBusy(true);
    try { consumeResult(await window.marHelper.previewRawImport(rawText)); }
    finally { setBusy(false); }
  };

  const resetInput = (kind: InputKind = inputKind) => {
    setPreview(null); setError(null); setMode('merge'); setInputKind(kind);
  };

  const commit = async () => {
    if (!preview) return;
    setConfirmReplace(false); setBusy(true);
    const success = await commitImport(preview.sessionId, mode);
    setBusy(false);
    if (success) onClose();
  };

  const apply = async () => {
    if (!preview) return;
    if (mode === 'replace') { setConfirmReplace(true); return; }
    await commit();
  };

  const inputStage = !preview;
  return <>
    <Modal open={open && !confirmReplace} wide={inputStage && allowRawText} title="Daten importieren" description="Prüfe die erkannten Daten in der Vorschau, bevor sie gespeichert werden." onClose={onClose}>
      <div className="import-dialog">
        {inputStage ? <>
          {allowRawText && <div className="import-source-tabs" role="tablist" aria-label="Importquelle">
            <button role="tab" aria-selected={inputKind === 'file'} className={inputKind === 'file' ? 'active' : ''} onClick={() => resetInput('file')}><FileJson size={17}/>JSON-Datei</button>
            <button role="tab" aria-selected={inputKind === 'rawText'} className={inputKind === 'rawText' ? 'active' : ''} onClick={() => resetInput('rawText')}><ClipboardPaste size={17}/>Rohtext <span>Beta</span></button>
          </div>}
          {error && <div className="import-inline-error" role="alert"><strong>{error.title}</strong><span>{error.message}</span></div>}
          {inputKind === 'file' ? <div className="import-file-picker">
            <span className="import-file-picker__icon"><FileJson size={25}/></span>
            <h3>MAR-Helper-JSON auswählen</h3>
            <p>Unterstützt werden vollständige Backups und Exporte eines einzelnen Moduls.</p>
            <Button variant="secondary" icon={<FolderOpen size={17}/>} disabled={busy} onClick={() => void chooseFile()}>{busy ? 'Öffne …' : 'Datei auswählen'}</Button>
          </div> : <div className="raw-import-editor">
            <div><strong>Bestehende Daten einfügen</strong><span>Tabellen, CSV, beschriftete Prompt-Blöcke und Markdown-Aufgaben werden automatisch erkannt.</span></div>
            <Textarea autoFocus spellCheck={false} value={rawText} onChange={(event) => { setRawText(event.target.value); setError(null); }} placeholder={'Beispiel Zeitplan:\nTitel\tFällig am\tStatus\nRecherche abschliessen\t2026-08-31\tOffen'} />
            <small>Die Analyse findet vollständig lokal auf diesem Gerät statt.</small>
          </div>}
        </> : <>
          <div className="import-summary">
            <span className="import-summary__icon"><FileCheck2 size={22}/></span>
            <div><strong>{kindLabel[preview.kind]}</strong><span>{preview.fileName}{preview.source === 'rawText' ? ` · ${preview.detectedFormat ?? 'automatisch erkannt'}` : preview.legacy ? ' · älteres, unterstütztes Exportformat' : ` · Formatversion ${preview.formatVersion}`}</span></div>
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
              <Replace size={19}/><span><strong>Bestehende Daten ersetzen</strong><small>Die aktuellen Daten dieses Moduls werden durch die erkannten Daten ersetzt.</small></span>
            </label>
          </fieldset>
          <p className="import-module-note">Deaktivierte Module bleiben deaktiviert. Enthaltene Daten werden trotzdem importiert.</p>
        </>}
        <div className="form-actions form-actions--between">
          <div>{preview && <Button variant="ghost" onClick={() => resetInput(preview.source ?? 'file')}>Andere Eingabe</Button>}</div>
          <div className="form-actions">
            <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
            {inputStage && inputKind === 'rawText' && <Button icon={<ScanSearch size={17}/>} disabled={busy || !rawText.trim()} onClick={() => void analyzeRawText()}>{busy ? 'Analysiere …' : 'Daten erkennen'}</Button>}
            {preview && <Button icon={<Import size={17}/>} disabled={busy} onClick={() => void apply()}>{busy ? 'Importiere …' : 'Importieren'}</Button>}
          </div>
        </div>
      </div>
    </Modal>
    <ConfirmDialog open={confirmReplace} title="Bestehende Daten ersetzen?" description="Deine aktuell gespeicherten Daten des erkannten Moduls werden überschrieben. Dieser Vorgang kann nicht automatisch rückgängig gemacht werden." confirmLabel="Daten ersetzen" onCancel={() => setConfirmReplace(false)} onConfirm={() => void commit()}/>
  </>;
}
