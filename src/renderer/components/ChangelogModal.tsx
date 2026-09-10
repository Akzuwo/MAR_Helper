import { changelog } from '../changelog';
import { APP_VERSION } from '../../shared/app-version';
import { ChangelogContent } from './ChangelogContent';
import { Button, Modal } from './ui';

export function ChangelogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Modal open={open} title="Changelog" description={`Alle Änderungen von MAR Helper · Aktuell installiert: ${APP_VERSION}`} onClose={onClose} wide>
    <ChangelogContent releases={changelog}/>
    <div className="changelog-actions"><Button onClick={onClose}>Verstanden</Button></div>
  </Modal>;
}
