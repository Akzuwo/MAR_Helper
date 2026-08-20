import { AlertCircle, BookOpenText, CalendarClock, CheckCircle2, ClipboardPaste, Clock3, Copy, Download, FileOutput, FolderOpen, Import, LoaderCircle, PackageOpen, RefreshCw, WandSparkles } from 'lucide-react';
import { useState } from 'react';
import { exportAllJson, exportJournalCsv, exportModuleJson, exportPlannerCsv, exportPromptsMarkdown } from '../../../shared/exporters';
import { IMPORT_FORMATTING_PROMPT } from '../../../shared/import-format-prompt';
import type { ImportSelectResult } from '../../../shared/models';
import { useAppData } from '../../state/AppDataContext';
import { Button, EmptyState } from '../../components/ui';
import { Page, PageHeader } from '../../layout/Page';
import { ImportDialog } from './ImportDialog';
import { ImportGuideModal } from './ImportGuideModal';

const dateSuffix = () => new Date().toISOString().slice(0, 10);

export function ExportPage() {
  const { state, autoExportStatus, toast } = useAppData();
  const [importOpen, setImportOpen] = useState(false);
  const [importSelection, setImportSelection] = useState<ImportSelectResult | null>(null);
  const [importSource, setImportSource] = useState<'file' | 'rawText'>('file');
  const [guideOpen, setGuideOpen] = useState(false);
  const active = state.settings.modules;
  const activeCount = Object.values(active).filter(Boolean).length;

  const save = async (defaultPath: string, extension: string, name: string, content: string) => {
    try {
      const result = await window.marHelper.saveExport({ defaultPath, filters: [{ name, extensions: [extension] }], content });
      if (!result.canceled) toast('Export abgeschlossen');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Export fehlgeschlagen. Bitte wähle einen anderen Speicherort.', 'error');
    }
  };

  const startImport = async () => {
    const result = await window.marHelper.openImport();
    if (result.canceled) return;
    setImportSelection(result);
    setImportSource('file');
    setImportOpen(true);
  };

  const startRawImport = () => {
    setImportSelection(null);
    setImportSource('rawText');
    setImportOpen(true);
  };

  const copyFormattingPrompt = async () => {
    try {
      await navigator.clipboard.writeText(IMPORT_FORMATTING_PROMPT);
      toast('KI-Formatierungsprompt kopiert');
    } catch {
      toast('Der Prompt konnte nicht in die Zwischenablage kopiert werden.', 'error');
    }
  };

  const runAutoExport = async () => {
    const result = await window.marHelper.runAutoExport();
    if (result.state === 'success') toast('PDF erfolgreich aktualisiert');
  };

  const autoExportStatusCopy = autoExportStatus.state === 'exporting'
    ? 'PDF wird aktualisiert …'
    : autoExportStatus.state === 'success'
      ? `Zuletzt aktualisiert: ${new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(autoExportStatus.exportedAt))}`
      : autoExportStatus.state === 'error'
        ? autoExportStatus.message
        : state.settings.autoExport.enabled ? 'Bereit – exportiert automatisch nach jeder Bearbeitung.' : 'Auto-Export ist pausiert.';

  return <Page>
    <PageHeader title="Import & Export" description="Übernimm bestehende Daten oder sichere deinen vollständigen MAR-Helper-Datensatz."/>
    <section className="import-card">
      <div className="import-card__icon"><Import size={22}/></div>
      <div><h2>Daten importieren</h2><p>Sieh dir das genaue Datenformat an oder starte direkt mit deinem Import.</p></div>
      <div className="import-card__actions">
        <Button
          variant="ghost"
          icon={<Copy size={17}/>}
          title="Prompt, um deine bestehenden Daten selbst mit KI zu formatieren. Kopiere ihn zusammen mit deinen Daten in ein KI-Tool."
          onClick={() => void copyFormattingPrompt()}
        >KI-Prompt kopieren</Button>
        <Button variant="ghost" icon={<BookOpenText size={17}/>} onClick={() => setGuideOpen(true)}>Format-Anleitung</Button>
        {state.settings.betaFeatures.rawTextImport && <Button variant="secondary" icon={<ClipboardPaste size={17}/>} onClick={startRawImport}>Rohtext <span className="beta-badge">Beta</span></Button>}
        <Button variant="secondary" icon={<Import size={17}/>} onClick={() => void startImport()}>JSON auswählen</Button>
      </div>
    </section>
    {(state.settings.autoExport.enabled || state.settings.autoExport.directory) && <section className="auto-export-card">
      <header>
        <span className="auto-export-card__icon"><FileOutput size={22}/></span>
        <div><div className="auto-export-card__title"><h2>Automatischer PDF-Export</h2></div><p>Die Konfiguration verwaltest du in den Einstellungen.</p></div>
      </header>
      <div className="auto-export-config">
        <div className="auto-export-folder"><FolderOpen size={18}/><div><strong>Zielordner</strong><span title={state.settings.autoExport.directory}>{state.settings.autoExport.directory}</span><small>{state.settings.autoExport.separateDocuments ? `${state.settings.autoExport.journalFileName} · ${state.settings.autoExport.promptsFileName}` : state.settings.autoExport.fileName}</small></div></div>
        <div className="auto-export-actions"><Button variant="secondary" icon={autoExportStatus.state === 'exporting' ? <LoaderCircle className="spin" size={16}/> : <RefreshCw size={16}/>} disabled={!state.settings.autoExport.enabled || autoExportStatus.state === 'exporting'} onClick={() => void runAutoExport()}>Jetzt exportieren</Button></div>
      </div>
      <footer className={`auto-export-status auto-export-status--${autoExportStatus.state}`} aria-live="polite">
        {autoExportStatus.state === 'error' ? <AlertCircle size={15}/> : autoExportStatus.state === 'success' ? <CheckCircle2 size={15}/> : autoExportStatus.state === 'exporting' ? <LoaderCircle className="spin" size={15}/> : <span className="status-dot"/>}
        <span>{autoExportStatusCopy}</span>
      </footer>
    </section>}
    {activeCount === 0 ? <EmptyState icon={<PackageOpen/>} title="Keine Module aktiv" description="Aktiviere in den Einstellungen mindestens ein Modul, um dessen Daten zu exportieren."/> : <>
      <div className="export-grid">
        {active.journal && <ExportCard
          icon={<Clock3/>}
          title="Arbeitsjournal"
          description={`${state.journalEntries.length} Einträge · inklusive Zeiten und Notizen`}
          actions={<><Button variant="secondary" icon={<Download size={16}/>} onClick={() => save(`arbeitsjournal-${dateSuffix()}.csv`, 'csv', 'CSV', exportJournalCsv(state.journalEntries))}>CSV</Button><Button variant="secondary" icon={<Download size={16}/>} onClick={() => save(`arbeitsjournal-${dateSuffix()}.json`, 'json', 'JSON', exportModuleJson('journal', state.journalEntries))}>JSON</Button></>}
        />}
        {active.prompts && <ExportCard
          icon={<WandSparkles/>}
          title="Promptprotokoll"
          description={`${state.promptEntries.length} Einträge · Markdown erhält die Formatierung`}
          actions={<><Button variant="secondary" icon={<Download size={16}/>} onClick={() => save(`promptprotokoll-${dateSuffix()}.md`, 'md', 'Markdown', exportPromptsMarkdown(state.promptEntries))}>Markdown</Button><Button variant="secondary" icon={<Download size={16}/>} onClick={() => save(`promptprotokoll-${dateSuffix()}.json`, 'json', 'JSON', exportModuleJson('prompts', state.promptEntries))}>JSON</Button></>}
        />}
        {active.planner && <ExportCard
          icon={<CalendarClock/>}
          title="Zeitplan"
          description={`${state.plannerTasks.length} Tasks · offene und erledigte Aufgaben`}
          actions={<><Button variant="secondary" icon={<Download size={16}/>} onClick={() => save(`zeitplan-${dateSuffix()}.csv`, 'csv', 'CSV', exportPlannerCsv(state.plannerTasks))}>CSV</Button><Button variant="secondary" icon={<Download size={16}/>} onClick={() => save(`zeitplan-${dateSuffix()}.json`, 'json', 'JSON', exportModuleJson('planner', state.plannerTasks))}>JSON</Button></>}
        />}
      </div>
    </>}
    <section className="backup-card"><div className="backup-card__icon"><PackageOpen size={24}/></div><div><h2>Vollständiges Backup</h2><p>Alle Daten, Einstellungen und gespeicherten Git-Diffs in einer einzigen JSON-Datei sichern.</p></div><Button icon={<Download size={17}/>} onClick={() => save(`mar-helper-backup-${dateSuffix()}.json`, 'json', 'JSON', exportAllJson(state))}>Alles exportieren</Button></section>
    <ImportDialog open={importOpen} selection={importSelection} allowRawText={state.settings.betaFeatures.rawTextImport} initialSource={importSource} onClose={() => setImportOpen(false)}/>
    <ImportGuideModal open={guideOpen} betaEnabled={state.settings.betaFeatures.rawTextImport} onClose={() => setGuideOpen(false)}/>
  </Page>;
}

function ExportCard({ icon, title, description, actions }: { icon: React.ReactNode; title: string; description: string; actions: React.ReactNode }) {
  return <section className="export-card"><div className="export-card__icon">{icon}</div><div><h2>{title}</h2><p>{description}</p></div><div className="export-card__actions">{actions}</div></section>;
}
