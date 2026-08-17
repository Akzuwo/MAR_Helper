import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../../shared/models';
import { MarkdownContent } from './MarkdownContent';
import { Button, Modal } from './ui';

const ignoredKey = 'mar-helper:ignored-update-version';
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function UpdateModal() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [updateStarted, setUpdateStarted] = useState(false);

  useEffect(() => window.marHelper.onUpdateStatus((next) => {
    setStatus(next);
    if (next.state === 'available') {
      setOpen(localStorage.getItem(ignoredKey) !== next.version);
    } else if (next.state === 'downloading' || next.state === 'downloaded') {
      setOpen(true);
    } else if (next.state === 'error' && updateStarted) {
      setOpen(true);
    }
  }), [updateStarted]);

  if (!status || !open || !['available', 'downloading', 'downloaded', 'error'].includes(status.state)) return null;
  const version = 'version' in status ? status.version : '';
  const canClose = status.state === 'available' || status.state === 'error';

  const ignore = () => {
    if (status.state === 'available') localStorage.setItem(ignoredKey, status.version);
    setOpen(false);
  };

  const install = async () => {
    if (status.state !== 'available') return;
    localStorage.removeItem(ignoredKey);
    setUpdateStarted(true);
    try { await window.marHelper.downloadAndInstallUpdate(); }
    catch (error) { setStatus({ state: 'error', message: error instanceof Error ? error.message : 'Das Update konnte nicht gestartet werden.' }); }
  };

  return <Modal open={open} title={status.state === 'available' ? `MAR Helper ${version} ist verfügbar` : status.state === 'error' ? 'Update fehlgeschlagen' : 'MAR Helper wird aktualisiert'} description={status.state === 'available' ? 'Eine neuere Version wurde auf GitHub veröffentlicht.' : undefined} onClose={() => { if (canClose) setOpen(false); }}>
    <div className="update-modal">
      {status.state === 'available' && <>
        <div className="update-highlight"><span><ShieldCheck size={23}/></span><div><strong>Automatisches, lokales Update</strong><p>Der Installer wird von der offiziellen GitHub-Release-Seite geladen. MAR Helper startet zur Installation automatisch neu.</p></div></div>
        {status.releaseNotes && <div className="release-notes"><h3>Änderungen</h3><MarkdownContent>{status.releaseNotes}</MarkdownContent></div>}
        <div className="form-actions"><Button variant="secondary" onClick={ignore}>Ignorieren</Button><Button icon={<Download size={17}/>} onClick={install}>Jetzt aktualisieren</Button></div>
      </>}
      {status.state === 'downloading' && <>
        <div className="update-progress-copy"><Download size={22}/><div><strong>Update wird heruntergeladen …</strong><span>{megabytes(status.transferred)} von {megabytes(status.total)}</span></div><b>{Math.round(status.percent)} %</b></div>
        <div className="update-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(status.percent)}><span style={{ width: `${status.percent}%` }}/></div>
        <p className="update-footnote">Du kannst weiterarbeiten. Nach dem Download wird MAR Helper geschlossen, still installiert und neu gestartet.</p>
      </>}
      {status.state === 'downloaded' && <div className="update-finished"><RefreshCw className="spin" size={26}/><h3>Installation wird vorbereitet</h3><p>MAR Helper startet gleich mit der neuen Version neu.</p></div>}
      {status.state === 'error' && <><div className="inline-error">{status.message}</div><p className="update-footnote">Deine Daten wurden nicht verändert. Du kannst MAR Helper normal weiterverwenden.</p><div className="form-actions"><Button variant="secondary" onClick={() => setOpen(false)}>Schliessen</Button></div></>}
    </div>
  </Modal>;
}
