import { useEffect, useState } from 'react';
import type { PromptEntry, PromptModel } from '../../../shared/models';
import { Button, Field, Modal, Select, Textarea } from '../../components/ui';

export function PromptEditor({ open, entry, models, onClose, onSave, onManageModels }: {
  open: boolean; entry: PromptEntry | null; models: PromptModel[]; onClose: () => void;
  onSave: (entry: PromptEntry) => void; onManageModels: () => void
}) {
  const [modelId, setModelId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setModelId(entry?.modelId && models.some((model) => model.id === entry.modelId) ? entry.modelId : models[0]?.id ?? '');
    setPrompt(entry?.prompt ?? '');
    setResponse(entry?.response ?? '');
    setErrors({});
  }, [entry, models, open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!modelId) nextErrors.model = 'Bitte wähle oder erstelle ein Modell.';
    if (!prompt.trim()) nextErrors.prompt = 'Der Prompt darf nicht leer sein.';
    if (!response.trim()) nextErrors.response = 'Die Antwort darf nicht leer sein.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const model = models.find((item) => item.id === modelId)!;
    onSave({
      id: entry?.id ?? crypto.randomUUID(),
      modelId: model.id,
      modelName: model.name,
      prompt: prompt.trim(),
      response: response.trim(),
      createdAt: entry?.createdAt ?? new Date().toISOString(),
      updatedAt: entry ? new Date().toISOString() : undefined
    });
  };

  return <Modal open={open} title={entry ? 'Prompt bearbeiten' : 'Prompt erfassen'} description="Prompt und Antwort werden sicher als Markdown dargestellt." onClose={onClose} wide>
    <form onSubmit={submit} className="form-stack">
      <Field label="Modell" error={errors.model}>
        <div className="field-row"><Select value={modelId} onChange={(event) => { setModelId(event.target.value); setErrors((e) => ({ ...e, model: '' })); }} disabled={models.length === 0}><option value="">Modell auswählen</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</Select><Button type="button" variant="secondary" onClick={onManageModels}>Modelle verwalten</Button></div>
      </Field>
      <Field label="Prompt" error={errors.prompt}><Textarea autoFocus rows={7} placeholder="Füge den verwendeten Prompt ein …" value={prompt} onChange={(event) => { setPrompt(event.target.value); setErrors((e) => ({ ...e, prompt: '' })); }}/></Field>
      <Field label="Antwort" error={errors.response} hint="Markdown, Codeblöcke, Tabellen und Links werden automatisch formatiert."><Textarea rows={9} placeholder="Füge die erhaltene Antwort ein …" value={response} onChange={(event) => { setResponse(event.target.value); setErrors((e) => ({ ...e, response: '' })); }}/></Field>
      <div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">{entry ? 'Änderungen speichern' : 'Prompt speichern'}</Button></div>
    </form>
  </Modal>;
}
