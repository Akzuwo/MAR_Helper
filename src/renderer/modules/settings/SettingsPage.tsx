import { useState } from 'react';
import { CalendarClock, ClipboardPaste, Clock3, FileOutput, FlaskConical, Pencil, Plus, Save, Trash2, WandSparkles } from 'lucide-react';
import { APP_VERSION } from '../../../shared/app-version';
import type { ModuleId, PromptModel } from '../../../shared/models';
import { useAppData } from '../../state/AppDataContext';
import { Button, ConfirmDialog, Field, IconButton, Input } from '../../components/ui';
import { Page, PageHeader } from '../../layout/Page';
import { GitIntegrationSettings } from '../git-integration/GitIntegrationSettings';

const modules: Array<{ id: ModuleId; title: string; description: string; icon: React.ReactNode }> = [
  { id: 'journal', title: 'Arbeitsjournal', description: 'Zeiterfassung und Arbeitsverlauf', icon: <Clock3 size={21}/> },
  { id: 'prompts', title: 'Promptprotokoll', description: 'Dokumentation deiner KI-Nutzung', icon: <WandSparkles size={21}/> },
  { id: 'planner', title: 'Zeitplan', description: 'Einfache Aufgabenplanung', icon: <CalendarClock size={21}/> }
];

export function SettingsPage() {
  const { state, updateState, toast } = useAppData();
  const [newModel, setNewModel] = useState('');
  const [modelError, setModelError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingModel, setDeletingModel] = useState<PromptModel | null>(null);

  const toggleModule = (id: ModuleId) => {
    void updateState((current) => ({ ...current, settings: { ...current.settings, modules: { ...current.settings.modules, [id]: !current.settings.modules[id] } } }), `${modules.find((module) => module.id === id)?.title} ${state.settings.modules[id] ? 'deaktiviert' : 'aktiviert'}`);
  };

  const toggleRawTextImport = () => {
    const enabled = state.settings.betaFeatures.rawTextImport;
    void updateState((current) => ({
      ...current,
      settings: { ...current.settings, betaFeatures: { ...current.settings.betaFeatures, rawTextImport: !enabled } }
    }), `Rohtext-Import ${enabled ? 'deaktiviert' : 'aktiviert'}`);
  };

  const toggleAutoExportBeta = async () => {
    const enabled = state.settings.betaFeatures.autoExport;
    if (!enabled) {
      try {
        const result = await window.marHelper.selectAutoExportFolder();
        if (result.canceled) return;
        await updateState((current) => ({
          ...current,
          settings: {
            ...current.settings,
            betaFeatures: { ...current.settings.betaFeatures, autoExport: true },
            autoExport: { enabled: true, directory: result.directory }
          }
        }), 'Auto-Export eingerichtet');
      } catch {
        toast('Der Zielordner konnte nicht ausgewählt werden.', 'error');
      }
      return;
    }
    await updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        betaFeatures: { ...current.settings.betaFeatures, autoExport: false },
        autoExport: { ...current.settings.autoExport, enabled: false }
      }
    }), 'Auto-Export deaktiviert');
  };

  const addModel = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newModel.trim();
    if (!name) return setModelError('Bitte gib einen Modellnamen ein.');
    if (state.promptModels.some((model) => model.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) return setModelError('Dieses Modell ist bereits vorhanden.');
    void updateState((current) => ({ ...current, promptModels: [...current.promptModels, { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() }] }), 'Modell hinzugefügt');
    setNewModel(''); setModelError('');
  };

  const saveRename = (model: PromptModel) => {
    const name = editingName.trim();
    if (!name) return;
    if (state.promptModels.some((item) => item.id !== model.id && item.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) return setModelError('Dieses Modell ist bereits vorhanden.');
    void updateState((current) => ({ ...current, promptModels: current.promptModels.map((item) => item.id === model.id ? { ...item, name } : item) }), 'Modell umbenannt');
    setEditingId(null); setEditingName(''); setModelError('');
  };

  const confirmDelete = () => {
    if (!deletingModel) return;
    void updateState((current) => ({ ...current, promptModels: current.promptModels.filter((model) => model.id !== deletingModel.id) }), 'Modell aus der Auswahl entfernt');
    setDeletingModel(null);
  };

  return <Page>
    <PageHeader title="Einstellungen" description="Konfiguriere aktive Module, Beta-Funktionen, Git-Integration und deine Modellliste."/>
    <section className="settings-card">
      <header><h2>Aktive Module</h2><p>Nur aktive Module erscheinen in der Navigation. Gespeicherte Daten bleiben beim Deaktivieren erhalten.</p></header>
      <div>
        {modules.map((module) => <div className="setting-row" key={module.id}>
          <span className="setting-row__icon">{module.icon}</span>
          <div><strong>{module.title}</strong><span>{module.description}</span></div>
          <button className={`switch ${state.settings.modules[module.id] ? 'on' : ''}`} role="switch" aria-checked={state.settings.modules[module.id]} aria-label={`${module.title} ${state.settings.modules[module.id] ? 'deaktivieren' : 'aktivieren'}`} onClick={() => toggleModule(module.id)}><span/></button>
        </div>)}
      </div>
    </section>
    <section className="settings-card beta-settings">
      <header><div className="settings-heading"><span><FlaskConical size={20}/></span><div><h2>Beta-Funktionen</h2><p>Teste neue Funktionen vor ihrer finalen Veröffentlichung. Sie können sich noch verändern.</p></div></div></header>
      <div className="setting-row">
        <span className="setting-row__icon"><ClipboardPaste size={21}/></span>
        <div><strong>Automatischer Rohtext-Import</strong><span>Erkennt eingefügte Tabellen, datierte Journal-Blöcke, Prompt-Blöcke und Aufgabenlisten automatisch.</span></div>
        <span className="beta-badge">Beta</span>
        <button className={`switch ${state.settings.betaFeatures.rawTextImport ? 'on' : ''}`} role="switch" aria-checked={state.settings.betaFeatures.rawTextImport} aria-label={`Automatischen Rohtext-Import ${state.settings.betaFeatures.rawTextImport ? 'deaktivieren' : 'aktivieren'}`} onClick={toggleRawTextImport}><span/></button>
      </div>
      <div className="setting-row">
        <span className="setting-row__icon"><FileOutput size={21}/></span>
        <div><strong>Automatischer PDF-Export</strong><span>Aktualisiert nach jeder Bearbeitung automatisch ein formatiertes PDF in deinem gewählten Ordner.</span></div>
        <span className="beta-badge">Beta</span>
        <button className={`switch ${state.settings.betaFeatures.autoExport ? 'on' : ''}`} role="switch" aria-checked={state.settings.betaFeatures.autoExport} aria-label={`Automatischen PDF-Export ${state.settings.betaFeatures.autoExport ? 'deaktivieren' : 'aktivieren'}`} onClick={() => void toggleAutoExportBeta()}><span/></button>
      </div>
    </section>
    <GitIntegrationSettings/>
    <section className="settings-card">
      <header><h2>KI-Modelle</h2><p>Diese Modelle stehen beim Erfassen eines Prompts zur Auswahl. Alte Einträge behalten beim Löschen ihren Modellnamen.</p></header>
      <div className="model-manager">
        <form className="add-model" onSubmit={addModel}><Field label="Modell hinzufügen" error={modelError}><div className="field-row"><Input placeholder="z. B. GPT-5 Thinking" value={newModel} onChange={(event) => { setNewModel(event.target.value); setModelError(''); }}/><Button type="submit" icon={<Plus size={17}/>}>Hinzufügen</Button></div></Field></form>
        <div className="model-list" role="list">
          {state.promptModels.map((model) => <div className="model-row" role="listitem" key={model.id}>
            <span className="model-row__icon"><WandSparkles size={17}/></span>
            {editingId === model.id ? <Input autoFocus aria-label="Neuer Modellname" value={editingName} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveRename(model); if (event.key === 'Escape') setEditingId(null); }}/> : <strong>{model.name}</strong>}
            <div>{editingId === model.id ? <IconButton label="Namen speichern" onClick={() => saveRename(model)}><Save size={17}/></IconButton> : <IconButton label={`${model.name} umbenennen`} onClick={() => { setEditingId(model.id); setEditingName(model.name); }}><Pencil size={17}/></IconButton>}<IconButton label={`${model.name} löschen`} variant="danger" onClick={() => setDeletingModel(model)}><Trash2 size={17}/></IconButton></div>
          </div>)}
          {state.promptModels.length === 0 && <p className="model-empty">Noch keine Modelle. Füge oben dein erstes Modell hinzu.</p>}
        </div>
      </div>
    </section>
    <section className="about-card">
      <div><h2>MAR Helper</h2><p>Deine Daten bleiben lokal auf diesem Gerät. Die drei Module funktionieren unabhängig voneinander.</p><span>Version {APP_VERSION}</span></div>
    </section>
    <ConfirmDialog open={!!deletingModel} title="Modell löschen?" description={`„${deletingModel?.name ?? ''}“ wird aus der Auswahl entfernt. Bestehende Prompt-Einträge behalten ihren gespeicherten Modellnamen.`} onCancel={() => setDeletingModel(null)} onConfirm={confirmDelete}/>
  </Page>;
}
