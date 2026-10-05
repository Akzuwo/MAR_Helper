import { useState } from 'react';
import { Bot, Download, LoaderCircle, RefreshCw } from 'lucide-react';
import type { AssistantSetupPlan } from '../../../shared/models';
import { useAppData } from '../../state/AppDataContext';
import { Button, Modal } from '../../components/ui';

export function LocalAssistantSettings() {
  const { state, assistantStatus, updateState } = useAppData();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<AssistantSetupPlan | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const enabled = state.settings.localAssistant.enabled;
  const toggle = async () => {
    if (enabled) {
      await updateState((current) => ({ ...current, settings: { ...current.settings, localAssistant: { ...current.settings.localAssistant, enabled: false } } }), 'Lokaler Assistent deaktiviert');
      return;
    }
    setOpen(true); setPlan(null); setError(''); setBusy(true);
    try { setPlan(await window.marHelper.getAssistantPlan()); }
    catch { setError('Die PC-Prüfung ist fehlgeschlagen. Schliesse diesen Dialog und versuche es erneut.'); }
    finally { setBusy(false); }
  };
  const activate = async () => {
    if (!plan?.supported) return;
    setBusy(true);
    const saved = await updateState((current) => ({ ...current, settings: { ...current.settings, localAssistant: { enabled: true, model: plan.model } } }), 'Lokaler Assistent wird eingerichtet');
    setBusy(false);
    if (saved) setOpen(false);
  };
  return <>
    <div className="setting-row">
      <span className="setting-row__icon"><Bot size={21}/></span>
      <div><strong>Lokaler KI-Assistent</strong><span>{enabled ? assistantStatus.message : 'Hilft dir im Chat mit Einträgen, Rohtext-Importen, Sitzungen und Fragen zur App.'}</span></div>
      <span className="beta-badge">Beta</span>
      {enabled && assistantStatus.phase === 'error' && <Button size="sm" variant="secondary" icon={<RefreshCw size={15}/>} onClick={() => void window.marHelper.retryAssistantSetup()}>Erneut versuchen</Button>}
      <button className={`switch ${enabled ? 'on' : ''}`} role="switch" aria-checked={enabled} aria-label={`Lokalen KI-Assistenten ${enabled ? 'deaktivieren' : 'aktivieren'}`} onClick={() => void toggle()}><span/></button>
    </div>
    {enabled && assistantStatus.percent !== undefined && <div className="assistant-settings-progress"><progress max={100} value={assistantStatus.percent} aria-label="Installationsfortschritt"/><span>{assistantStatus.percent}%</span></div>}
    <Modal open={open} title="Lokalen KI-Assistenten aktivieren" description="Ollama und ein passendes Qwen-3.5-Modell werden automatisch eingerichtet." onClose={() => { if (!busy) setOpen(false); }} dismissible={!busy}>
      <div className="form-stack assistant-setup">
        {busy && !plan && <p><LoaderCircle className="spin" size={18}/> Dein PC wird geprüft …</p>}
        {plan && <>
          <div className="assistant-setup__model"><Bot size={28}/><div><strong>{plan.model}</strong><span>{plan.memoryGb} GB RAM · {plan.arch} · Modelldownload ca. {plan.modelDownloadGb} GB</span></div></div>
          <p>{plan.reason}</p>
          <ol><li>{plan.runtimeInstalled ? 'Dein vorhandenes Ollama wird verwendet.' : 'Ollama wird aus dem offiziellen Release heruntergeladen, geprüft und im App-Datenordner installiert (zusätzlich ca. 4 GB Speicherplatz). Unter Windows erscheint kein Terminal und es sind keine Administratorrechte nötig.'}</li><li>Das ausgewählte Modell wird im Hintergrund heruntergeladen. Dafür wird einmalig eine Internetverbindung benötigt; die Einrichtung kann mehrere Minuten dauern.</li><li>Bei aktiviertem Assistenten startet Ollama mit MAR Helper im Hintergrund. Der Chat erscheint rechts unten und kann deine App-Daten lesen und auf deinen Auftrag ändern. Die KI-Verarbeitung läuft auf deinem Gerät.</li></ol>
          <p>Du kannst während der Einrichtung weiterarbeiten und den Assistenten jederzeit deaktivieren. Downloads werden dann angehalten; installierte Dateien und Modelle bleiben für eine spätere Aktivierung erhalten. Änderungen an Einträgen kannst du über „Rückgängig“ korrigieren.</p>
          <p className="field__hint">Die Auswahl richtet sich nach dem RAM. Ohne passende GPU kann die Antwort länger dauern. Beta-Antworten und Änderungen bitte prüfen.</p>
        </>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Abbrechen</Button><Button disabled={busy || !plan?.supported} icon={busy ? <LoaderCircle className="spin" size={17}/> : <Download size={17}/>} onClick={() => void activate()}>Aktivieren & installieren</Button></div>
      </div>
    </Modal>
  </>;
}
