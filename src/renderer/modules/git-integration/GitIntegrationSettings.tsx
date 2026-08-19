import { useEffect, useState } from 'react';
import { Check, Download, FolderGit2, Pencil, Plus, RefreshCw, Save, Trash2, XCircle } from 'lucide-react';
import type { GitRepository } from '../../../shared/models';
import { Button, IconButton, Input, Modal } from '../../components/ui';
import { useAppData } from '../../state/AppDataContext';

type SetupStep = 1 | 2 | 3 | 4;

function GitSetup({ open, onClose, onComplete }: { open: boolean; onClose: () => void; onComplete: (repository: GitRepository) => void }) {
  const [step, setStep] = useState<SetupStep>(1);
  const [checking, setChecking] = useState(false);
  const [gitVersion, setGitVersion] = useState('');
  const [error, setError] = useState('');
  const [repository, setRepository] = useState<GitRepository | null>(null);

  useEffect(() => { if (open) { setStep(1); setGitVersion(''); setError(''); setRepository(null); } }, [open]);
  const check = async () => {
    setChecking(true); setError('');
    const result = await window.marHelper.checkGit();
    if (result.ok) setGitVersion(result.data.version); else setError(result.message);
    setChecking(false);
  };
  useEffect(() => { if (step === 2 && !gitVersion && !checking && !error) void check(); }, [step]);
  const select = async () => {
    setError('');
    const result = await window.marHelper.selectGitRepository();
    if (!result.ok) return setError(result.message);
    if (result.data.canceled || !result.data.path || !result.data.name) return;
    setRepository({ id: crypto.randomUUID(), name: result.data.name, path: result.data.path, addedAt: new Date().toISOString() });
    setStep(4);
  };
  const close = () => { setStep(1); onClose(); };
  return <Modal open={open} title={step === 1 ? 'Git-Integration einrichten' : step === 2 ? 'Git prüfen' : step === 3 ? 'Repository auswählen' : 'Git-Integration ist bereit'} description={`Schritt ${step} von 4`} onClose={close}>
    <div className="git-setup">
      <div className="setup-progress" aria-label={`Schritt ${step} von 4`}>{[1,2,3,4].map((item) => <span key={item} className={item <= step ? 'active' : ''}/>)}</div>
      {step === 1 && <><div className="git-setup__icon"><FolderGit2 size={27}/></div><p>MAR Helper kann lokale Git-Commits mit deinen Prompt-Einträgen verknüpfen. So dokumentierst du neben dem Prompt auch die daraus entstandenen Codeänderungen.</p><p className="privacy-note"><Check size={17}/>Repositories werden ausschliesslich lokal gelesen. Es werden keine GitHub-Zugangsdaten benötigt und auch private Repositories funktionieren.</p><div className="form-actions"><Button variant="secondary" onClick={close}>Abbrechen</Button><Button onClick={() => setStep(2)}>Weiter</Button></div></>}
      {step === 2 && <><div className={`git-check ${error ? 'git-check--error' : ''}`}>{checking ? <><RefreshCw className="spin"/><div><strong>Git wird geprüft …</strong><span>Einen Moment bitte.</span></div></> : error ? <><XCircle/><div><strong>Git wurde nicht gefunden</strong><span>Für diese Funktion muss Git auf deinem Computer installiert sein. Installiere Git und prüfe danach erneut.</span></div></> : <><Check/><div><strong>Git wurde gefunden</strong><span>{gitVersion}</span></div></>}</div><div className="form-actions">{error && <Button variant="ghost" icon={<Download size={17}/>} onClick={() => void window.marHelper.openGitDownload()}>Git herunterladen</Button>}<Button variant="secondary" onClick={close}>Einrichtung abbrechen</Button>{error ? <Button icon={<RefreshCw size={17}/>} onClick={() => void check()}>Erneut prüfen</Button> : <Button disabled={checking || !gitVersion} onClick={() => setStep(3)}>Weiter</Button>}</div></>}
      {step === 3 && <><div className="folder-picker"><FolderGit2 size={31}/><h3>Lokalen Projektordner wählen</h3><p>Du kannst das Repository selbst oder einen Unterordner darin auswählen. MAR Helper ermittelt automatisch den richtigen Stammordner.</p><Button icon={<FolderGit2 size={17}/>} onClick={() => void select()}>Ordner auswählen</Button></div>{error && <div className="inline-error"><strong>Kein Git-Repository gefunden</strong><span>{error}</span></div>}<div className="form-actions"><Button variant="secondary" onClick={close}>Abbrechen</Button>{error && <Button onClick={() => void select()}>Anderen Ordner auswählen</Button>}</div></>}
      {step === 4 && repository && <><div className="git-ready"><Check size={25}/><div><strong>Repository</strong><span>{repository.name}</span><strong>Pfad</strong><span>{repository.path}</span></div></div><p>Du kannst jetzt bei Prompt-Einträgen lokale Commits und die dazugehörigen Änderungen verknüpfen.</p><div className="form-actions"><Button onClick={() => onComplete(repository)}>Fertig</Button></div></>}
    </div>
  </Modal>;
}

export function GitIntegrationSettings() {
  const { state, updateState, toast } = useAppData();
  const settings = state.settings.gitIntegration;
  const [setupOpen, setSetupOpen] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, 'checking' | 'ok' | 'missing'>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const verify = async (repository: GitRepository, quiet = false) => {
    setStatuses((current) => ({ ...current, [repository.id]: 'checking' }));
    const result = await window.marHelper.verifyGitRepository(repository.path);
    setStatuses((current) => ({ ...current, [repository.id]: result.ok ? 'ok' : 'missing' }));
    if (!quiet) toast(result.ok ? 'Repository ist erreichbar' : result.message, result.ok ? 'success' : 'error');
  };
  useEffect(() => { settings.repositories.forEach((repository) => void verify(repository, true)); }, [settings.repositories.map((item) => `${item.id}:${item.path}`).join('|')]);

  const toggle = () => {
    if (!settings.enabled && settings.repositories.length === 0) return setSetupOpen(true);
    void updateState((current) => ({ ...current, settings: { ...current.settings, gitIntegration: { ...current.settings.gitIntegration, enabled: !settings.enabled } } }), `Git-Integration ${settings.enabled ? 'deaktiviert' : 'aktiviert'}`);
  };
  const add = (repository: GitRepository) => {
    void updateState((current) => ({ ...current, settings: { ...current.settings, gitIntegration: { enabled: true, repositories: [...current.settings.gitIntegration.repositories.filter((item) => item.path.toLocaleLowerCase() !== repository.path.toLocaleLowerCase()), repository] } } }), 'Git-Integration eingerichtet');
    setSetupOpen(false);
  };
  const changePath = async (repository: GitRepository) => {
    const result = await window.marHelper.selectGitRepository();
    if (!result.ok) return toast(result.message, 'error');
    if (result.data.canceled || !result.data.path) return;
    void updateState((current) => ({ ...current, settings: { ...current.settings, gitIntegration: { ...current.settings.gitIntegration, repositories: current.settings.gitIntegration.repositories.map((item) => item.id === repository.id ? { ...item, path: result.data.path! } : item) } } }), 'Repository-Pfad aktualisiert');
  };
  const rename = (repository: GitRepository) => {
    const name = editingName.trim(); if (!name) return;
    void updateState((current) => ({ ...current, settings: { ...current.settings, gitIntegration: { ...current.settings.gitIntegration, repositories: current.settings.gitIntegration.repositories.map((item) => item.id === repository.id ? { ...item, name } : item) } } }), 'Repository umbenannt');
    setEditingId(null);
  };
  const remove = (id: string) => void updateState((current) => ({ ...current, settings: { ...current.settings, gitIntegration: { ...current.settings.gitIntegration, repositories: current.settings.gitIntegration.repositories.filter((item) => item.id !== id) } } }), 'Repository entfernt. Gespeicherte Prompt-Diffs bleiben erhalten.');

  return <section className="settings-card git-settings">
    <header><h2>Git-Integration</h2><p>Verknüpfe Prompt-Einträge optional mit lokalen Git-Commits und dokumentiere die daraus entstandenen Codeänderungen.</p></header>
    <div className="setting-row"><span className="setting-row__icon"><FolderGit2 size={21}/></span><div><strong>Git-Diffs im Promptprotokoll verwenden</strong><span>Repositories werden ausschliesslich lokal gelesen.</span></div><button className={`switch ${settings.enabled ? 'on' : ''}`} role="switch" aria-checked={settings.enabled} onClick={toggle}><span/></button></div>
    {settings.repositories.length > 0 ? <div className="repository-manager"><div className="repository-heading"><strong>Repositories</strong><Button size="sm" variant="secondary" icon={<Plus size={16}/>} onClick={() => setSetupOpen(true)}>Repository hinzufügen</Button></div>{settings.repositories.map((repository) => <div className="repository-row" key={repository.id}><span className="repository-row__icon"><FolderGit2 size={18}/></span><div>{editingId === repository.id ? <Input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') rename(repository); if (event.key === 'Escape') setEditingId(null); }}/> : <><strong>{repository.name}</strong><span>{repository.path}</span><small className={statuses[repository.id] === 'missing' ? 'status-error' : ''}>{statuses[repository.id] === 'checking' ? 'Wird überprüft …' : statuses[repository.id] === 'missing' ? 'Repository nicht gefunden' : 'Bereit'}</small></>}</div><div className="repository-actions">{editingId === repository.id ? <IconButton label="Namen speichern" onClick={() => rename(repository)}><Save size={16}/></IconButton> : <IconButton label="Anzeigename ändern" onClick={() => { setEditingId(repository.id); setEditingName(repository.name); }}><Pencil size={16}/></IconButton>}<Button size="sm" variant="ghost" onClick={() => void verify(repository)}>Überprüfen</Button><Button size="sm" variant="ghost" onClick={() => void changePath(repository)}>Pfad ändern</Button><IconButton label="Repository entfernen" variant="danger" onClick={() => remove(repository.id)}><Trash2 size={16}/></IconButton></div></div>)}</div> : settings.enabled && <div className="repository-empty"><span><FolderGit2 size={23}/></span><div><strong>Kein Repository verknüpft</strong><p>Füge wieder einen lokalen Projektordner hinzu, um Commits mit Prompt-Einträgen zu verknüpfen.</p></div><Button variant="secondary" icon={<Plus size={16}/>} onClick={() => setSetupOpen(true)}>Repository verknüpfen</Button></div>}
    <GitSetup open={setupOpen} onClose={() => setSetupOpen(false)} onComplete={add}/>
  </section>;
}
