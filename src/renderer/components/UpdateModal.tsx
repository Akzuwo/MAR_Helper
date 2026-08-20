import { BellRing, CalendarClock, CheckCircle2, Download, Power, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UpdateInstallationResult, UpdateStatus } from '../../shared/models';
import { useAppData } from '../state/AppDataContext';
import { MarkdownContent } from './MarkdownContent';
import { Button, Input, Modal } from './ui';

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
type PostponeChoice = 'five-days' | 'custom' | 'on-quit';

export function UpdateModal() {
  const { toast } = useAppData();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [installationResult, setInstallationResult] = useState<UpdateInstallationResult | null>(null);
  const [open, setOpen] = useState(false);
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [postponeChoice, setPostponeChoice] = useState<PostponeChoice>('five-days');
  const [customDays, setCustomDays] = useState('10');
  const [postponeError, setPostponeError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.marHelper.consumeUpdateInstallationResult().then((result) => {
      if (!result) return;
      setInstallationResult(result);
      setOpen(true);
    });
    return window.marHelper.onUpdateStatus((next) => {
      setStatus(next);
      if (next.state === 'available') {
        setPostponeOpen(false);
        setOpen(true);
      } else if (next.state === 'downloading' && !next.background) {
        setOpen(true);
      } else if (next.state === 'downloaded') {
        if (next.installOnQuit) {
          setOpen(false);
          toast('Update heruntergeladen – es wird beim Beenden installiert.');
        } else {
          setOpen(true);
        }
      } else if (next.state === 'error' && next.operation !== 'check') {
        setOpen(true);
      }
    });
  }, [toast]);

  if (!open) return null;

  if (installationResult) {
    const success = installationResult.state === 'success';
    return <Modal
      open
      title={success ? 'Update erfolgreich installiert' : 'Update nicht installiert'}
      description={success ? `MAR Helper ${installationResult.version} ist jetzt einsatzbereit.` : `Die Installation von MAR Helper ${installationResult.version} ist fehlgeschlagen.`}
      onClose={() => { setInstallationResult(null); setOpen(status?.state === 'available'); }}
    >
      <div className={`update-result update-result--${installationResult.state}`}>
        {success ? <CheckCircle2 size={31}/> : <TriangleAlert size={31}/>}
        <h3>{success ? 'Du verwendest die neueste Version.' : 'Deine bisherige Version wurde beibehalten.'}</h3>
        <p>{installationResult.message ?? (success ? 'Alle Komponenten wurden erfolgreich aktualisiert.' : 'Du kannst das Update erneut starten, sobald es wieder angeboten wird.')}</p>
        <Button variant="secondary" onClick={() => { setInstallationResult(null); setOpen(status?.state === 'available'); }}>Verstanden</Button>
      </div>
    </Modal>;
  }

  if (!status || !['available', 'downloading', 'downloaded', 'error'].includes(status.state)) return null;
  const version = 'version' in status ? status.version : '';
  const canClose = status.state === 'available' || status.state === 'error';

  const install = async () => {
    if (status.state !== 'available') return;
    setBusy(true);
    try {
      await window.marHelper.downloadAndInstallUpdate();
    } catch (error) {
      setStatus({ state: 'error', message: error instanceof Error ? error.message : 'Das Update konnte nicht gestartet werden.', operation: 'download' });
    } finally {
      setBusy(false);
    }
  };

  const postpone = async () => {
    if (status.state !== 'available') return;
    const days = postponeChoice === 'five-days' ? 5 : Number(customDays);
    if (postponeChoice === 'custom' && (!Number.isInteger(days) || days < 1 || days > 365)) {
      setPostponeError('Bitte gib eine ganze Anzahl zwischen 1 und 365 Tagen ein.');
      return;
    }
    setBusy(true); setPostponeError('');
    const result = await window.marHelper.postponeUpdate(postponeChoice === 'on-quit'
      ? { action: 'install-on-quit', version: status.version }
      : { action: 'remind', version: status.version, days });
    setBusy(false);
    if (!result.ok) { setPostponeError(result.message); return; }
    setOpen(false);
    if (postponeChoice === 'on-quit') toast('Update wird im Hintergrund vorbereitet und beim Beenden installiert.');
    else toast(`Du wirst in ${days} ${days === 1 ? 'Tag' : 'Tagen'} wieder erinnert.`);
  };

  const title = postponeOpen ? 'Update später installieren' : status.state === 'available'
    ? `MAR Helper ${version} ist verfügbar`
    : status.state === 'error' ? 'Update fehlgeschlagen' : 'MAR Helper wird aktualisiert';
  const description = postponeOpen ? `Wähle, wann Version ${version} erneut angeboten oder installiert werden soll.`
    : status.state === 'available' ? 'Eine neuere Version wurde auf GitHub veröffentlicht.' : undefined;

  return <Modal open={open} title={title} description={description} onClose={() => { if (canClose) { setPostponeOpen(false); setOpen(false); } }} dismissible={canClose}>
    <div className="update-modal">
      {status.state === 'available' && postponeOpen && <>
        <fieldset className="update-options">
          <label className={postponeChoice === 'five-days' ? 'selected' : ''}>
            <input type="radio" name="update-postpone" checked={postponeChoice === 'five-days'} onChange={() => { setPostponeChoice('five-days'); setPostponeError(''); }}/>
            <BellRing size={20}/><span><strong>In 5 Tagen erinnern</strong><small>Das Update wird nach fünf Tagen wieder angeboten.</small></span>
          </label>
          <label className={postponeChoice === 'custom' ? 'selected' : ''}>
            <input type="radio" name="update-postpone" checked={postponeChoice === 'custom'} onChange={() => { setPostponeChoice('custom'); setPostponeError(''); }}/>
            <CalendarClock size={20}/><span><strong>Eigene Erinnerung</strong><small>Zwischen 1 und 365 Tagen.</small></span>
            <Input aria-label="Anzahl Tage" type="number" min={1} max={365} value={customDays} disabled={postponeChoice !== 'custom'} onFocus={() => setPostponeChoice('custom')} onChange={(event) => { setCustomDays(event.target.value); setPostponeError(''); }}/>
          </label>
          <label className={postponeChoice === 'on-quit' ? 'selected' : ''}>
            <input type="radio" name="update-postpone" checked={postponeChoice === 'on-quit'} onChange={() => { setPostponeChoice('on-quit'); setPostponeError(''); }}/>
            <Power size={20}/><span><strong>Beim Beenden installieren</strong><small>Der Download läuft im Hintergrund. Beim Schliessen übernimmt der Installer.</small></span>
          </label>
        </fieldset>
        {postponeError && <div className="inline-error">{postponeError}</div>}
        <div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => setPostponeOpen(false)}>Zurück</Button><Button disabled={busy} onClick={() => void postpone()}>{busy ? 'Speichere …' : 'Auswahl bestätigen'}</Button></div>
      </>}
      {status.state === 'available' && !postponeOpen && <>
        <div className="update-highlight"><span><ShieldCheck size={23}/></span><div><strong>Sicheres automatisches Update</strong><p>Der Installer wird vom passenden offiziellen GitHub-Release geladen und kryptografisch geprüft.</p></div></div>
        <div className="release-notes"><h3>{status.releaseName || 'Änderungen in dieser Version'}</h3>{status.releaseNotes ? <MarkdownContent>{status.releaseNotes}</MarkdownContent> : <p className="release-notes__empty">Für dieses Release wurden keine Update-News veröffentlicht.</p>}</div>
        <div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => { setPostponeChoice('five-days'); setPostponeError(''); setPostponeOpen(true); }}>Ignorieren</Button><Button icon={<Download size={17}/>} disabled={busy} onClick={() => void install()}>{busy ? 'Starte …' : 'Jetzt aktualisieren'}</Button></div>
      </>}
      {status.state === 'downloading' && <>
        <div className="update-progress-copy"><Download size={22}/><div><strong>Update wird heruntergeladen …</strong><span>{megabytes(status.transferred)} von {megabytes(status.total)}</span></div><b>{Math.round(status.percent)} %</b></div>
        <div className="update-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(status.percent)}><span style={{ width: `${status.percent}%` }}/></div>
        <p className="update-footnote">Du kannst weiterarbeiten. Nach dem Download wird MAR Helper geschlossen, still installiert und neu gestartet.</p>
      </>}
      {status.state === 'downloaded' && <div className="update-finished"><RefreshCw className="spin" size={26}/><h3>Installation wird vorbereitet</h3><p>MAR Helper startet gleich mit der neuen Version neu.</p></div>}
      {status.state === 'error' && <><div className="inline-error">{status.message}</div><p className="update-footnote">Deine Daten wurden nicht verändert. Du kannst MAR Helper normal weiterverwenden und das Update beim nächsten Angebot erneut versuchen.</p><div className="form-actions"><Button variant="secondary" onClick={() => setOpen(false)}>Schliessen</Button></div></>}
    </div>
  </Modal>;
}
