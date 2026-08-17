import { CalendarClock, Clock3, Download, PackageOpen, WandSparkles } from 'lucide-react';
import { exportAllJson, exportJournalCsv, exportPlannerCsv, exportPromptsMarkdown } from '../../../shared/exporters';
import { useAppData } from '../../state/AppDataContext';
import { Button, EmptyState } from '../../components/ui';
import { Page, PageHeader } from '../../layout/Page';

const dateSuffix = () => new Date().toISOString().slice(0, 10);

export function ExportPage() {
  const { state, toast } = useAppData();
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

  return <Page>
    <PageHeader title="Export" description="Exportiere die Daten aktiver Module in offenen, portablen Formaten."/>
    {activeCount === 0 ? <EmptyState icon={<PackageOpen/>} title="Keine Module aktiv" description="Aktiviere in den Einstellungen mindestens ein Modul, um dessen Daten zu exportieren."/> : <>
      <div className="export-grid">
        {active.journal && <ExportCard icon={<Clock3/>} title="Arbeitsjournal" description={`${state.journalEntries.length} Einträge · inklusive Arbeits- und Pausenzeiten`} actions={<><Button variant="secondary" icon={<Download size={16}/>} onClick={() => save(`arbeitsjournal-${dateSuffix()}.csv`, 'csv', 'CSV', exportJournalCsv(state.journalEntries))}>CSV</Button><Button variant="secondary" icon={<Download size={16}/>} onClick={() => save(`arbeitsjournal-${dateSuffix()}.json`, 'json', 'JSON', JSON.stringify(state.journalEntries, null, 2))}>JSON</Button></>}/>} 
        {active.prompts && <ExportCard icon={<WandSparkles/>} title="Promptprotokoll" description={`${state.promptEntries.length} Einträge · Markdown erhält die Formatierung`} actions={<><Button variant="secondary" icon={<Download size={16}/>} onClick={() => save(`promptprotokoll-${dateSuffix()}.md`, 'md', 'Markdown', exportPromptsMarkdown(state.promptEntries))}>Markdown</Button><Button variant="secondary" icon={<Download size={16}/>} onClick={() => save(`promptprotokoll-${dateSuffix()}.json`, 'json', 'JSON', JSON.stringify(state.promptEntries, null, 2))}>JSON</Button></>}/>} 
        {active.planner && <ExportCard icon={<CalendarClock/>} title="Zeitplan" description={`${state.plannerTasks.length} Tasks · offene und erledigte Aufgaben`} actions={<><Button variant="secondary" icon={<Download size={16}/>} onClick={() => save(`zeitplan-${dateSuffix()}.csv`, 'csv', 'CSV', exportPlannerCsv(state.plannerTasks))}>CSV</Button><Button variant="secondary" icon={<Download size={16}/>} onClick={() => save(`zeitplan-${dateSuffix()}.json`, 'json', 'JSON', JSON.stringify(state.plannerTasks, null, 2))}>JSON</Button></>}/>} 
      </div>
      {activeCount > 1 && <section className="backup-card"><div className="backup-card__icon"><PackageOpen size={24}/></div><div><h2>Vollständiges Backup</h2><p>Alle Daten und Einstellungen in einer einzigen JSON-Datei sichern.</p></div><Button icon={<Download size={17}/>} onClick={() => save(`mar-helper-backup-${dateSuffix()}.json`, 'json', 'JSON', exportAllJson(state))}>Alles exportieren</Button></section>}
    </>}
  </Page>;
}

function ExportCard({ icon, title, description, actions }: { icon: React.ReactNode; title: string; description: string; actions: React.ReactNode }) {
  return <section className="export-card"><div className="export-card__icon">{icon}</div><div><h2>{title}</h2><p>{description}</p></div><div className="export-card__actions">{actions}</div></section>;
}
