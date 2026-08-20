import { useEffect, useState } from 'react';
import { Cloud, LoaderCircle } from 'lucide-react';
import type { GitRepository } from '../../../shared/models';
import { Button, Field, Modal, Select } from '../../components/ui';

export function CloudSaveSettingsModal({ open, repositories, selectedId, onClose, onSave }: {
  open: boolean;
  repositories: GitRepository[];
  selectedId?: string;
  onClose: () => void;
  onSave: (repositoryId: string) => void;
}) {
  const [repositoryId, setRepositoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRepositoryId(selectedId && repositories.some((item) => item.id === selectedId) ? selectedId : repositories[0]?.id ?? '');
    setBusy(false); setError('');
  }, [open, repositories, selectedId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const repository = repositories.find((item) => item.id === repositoryId);
    if (!repository) return setError('Verknüpfe zuerst ein lokales Git-Repository.');
    setBusy(true); setError('');
    const result = await window.marHelper.checkCloudRepository(repository.path);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    onSave(repository.id);
  };

  return <Modal open={open} title="Cloud Save einrichten" description="Synchronisiert MAR-Helper-Daten über eine isolierte Branch des Git-Remotes." onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => void submit(event)}>
      <div className="cloud-info"><Cloud size={21}/><p>Im Repository wird lokal <code>mar_helper/mar-helper-data.json</code> angelegt. Die Synchronisation verwendet die Branch <code>mar-helper-cloud</code> und verändert deinen Code-Branch nicht.</p></div>
      <Field label="Git-Repository" error={error || undefined}>
        <Select value={repositoryId} onChange={(event) => { setRepositoryId(event.target.value); setError(''); }} disabled={repositories.length === 0}>
          {repositories.length === 0 ? <option value="">Kein Repository verknüpft</option> : repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.name} · {repository.path}</option>)}
        </Select>
      </Field>
      <small className="form-note">Das Repository benötigt einen erreichbaren Remote mit dem Namen „origin“. Git-Zugangsdaten bleiben vollständig bei deiner lokalen Git-Installation.</small>
      <div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={busy || !repositoryId} icon={busy ? <LoaderCircle className="spin" size={16}/> : <Cloud size={16}/>}>{busy ? 'Prüfe Remote …' : 'Cloud Save aktivieren'}</Button></div>
    </form>
  </Modal>;
}
