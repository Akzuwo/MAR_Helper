import { useEffect, useState } from 'react';
import { Button, Modal } from './ui';

export function TermsModal({ open, mandatory = false, onClose, onAccept }: {
  open: boolean;
  mandatory?: boolean;
  onClose: () => void;
  onAccept?: () => void;
}) {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (open) setAccepted(false);
  }, [open]);

  return <Modal
    open={open}
    title="Benutzungsbedingungen"
    description="Bitte lies diese Hinweise vor der Verwendung von MAR Helper."
    onClose={onClose}
    dismissible={!mandatory}
  >
    <div className="terms-content">
      <section><h3>Nutzung auf eigene Verantwortung</h3><p>MAR Helper wird mit grosser Sorgfalt entwickelt. Dennoch erfolgt die Nutzung auf eigene Verantwortung. Soweit gesetzlich zulässig, wird keine Haftung für direkte oder indirekte Schäden am Gerät oder an Daten übernommen, die durch die Installation oder Verwendung entstehen – so unwahrscheinlich ein solcher Schadensfall auch sein sollte.</p></section>
      <section><h3>Cloud Save und GitHub</h3><p>Cloud Save verwendet GitHub als externen Anbieter. Für dessen Verfügbarkeit, Funktionsweise, Änderungen oder mögliche Datenverluste wird keine Haftung übernommen. Prüfe deine Synchronisation regelmässig und bewahre bei wichtigen Daten zusätzliche lokale Sicherungen auf.</p></section>
      {mandatory && <label className="terms-consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)}/><span>Ich habe die Benutzungsbedingungen gelesen und stimme ihnen zu.</span></label>}
      <div className="form-actions">{!mandatory && <Button variant="secondary" onClick={onClose}>Schliessen</Button>}{mandatory && <Button disabled={!accepted} onClick={onAccept}>Zustimmen und fortfahren</Button>}</div>
    </div>
  </Modal>;
}
