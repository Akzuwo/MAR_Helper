import { useEffect, useMemo, useState } from 'react';
import { Check, GitCommitHorizontal, LoaderCircle } from 'lucide-react';
import type { GitCommitSummary, GitRepository, PromptGitSnapshot } from '../../../shared/models';
import { Button, Field, Modal, Select } from '../../components/ui';

const dateTime = (iso: string) => new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

export function CommitPicker({ open, repositories, promptTimestamp, onClose, onSelect }: {
  open: boolean; repositories: GitRepository[]; promptTimestamp: string; onClose: () => void; onSelect: (snapshot: PromptGitSnapshot) => void
}) {
  const [repositoryId, setRepositoryId] = useState(repositories[0]?.id ?? '');
  const [commits, setCommits] = useState<GitCommitSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHash, setLoadingHash] = useState('');
  const [error, setError] = useState('');
  const repository = repositories.find((item) => item.id === repositoryId) ?? repositories[0];

  const load = async (append = false) => {
    if (!repository) return;
    setLoading(true); setError('');
    const result = await window.marHelper.listGitCommits(repository.path, append ? commits.length : 0, 30);
    if (result.ok) setCommits((current) => append ? [...current, ...result.data] : result.data); else setError(result.message);
    setLoading(false);
  };
  useEffect(() => { if (open && repository) void load(false); }, [open, repository?.id]);
  useEffect(() => { if (open && !repositories.some((item) => item.id === repositoryId)) setRepositoryId(repositories[0]?.id ?? ''); }, [open, repositories, repositoryId]);

  const matching = useMemo(() => {
    const promptTime = Date.parse(promptTimestamp);
    return commits.filter((commit) => { const delta = Date.parse(commit.committedAt) - promptTime; return delta >= -5 * 60_000 && delta <= 4 * 60 * 60_000; });
  }, [commits, promptTimestamp]);
  const matchingHashes = new Set(matching.map((item) => item.commitHash));
  const other = commits.filter((item) => !matchingHashes.has(item.commitHash));
  const choose = async (commit: GitCommitSummary) => {
    if (!repository) return;
    setLoadingHash(commit.commitHash); setError('');
    const result = await window.marHelper.readGitCommit(repository.path, commit.commitHash);
    setLoadingHash('');
    if (!result.ok) return setError(result.message);
    onSelect({ ...result.data, repositoryName: repository.name });
  };
  const group = (title: string, items: GitCommitSummary[]) => items.length > 0 && <section className="commit-group"><h3>{title}</h3>{items.map((commit) => <button className="commit-row" key={commit.commitHash} onClick={() => void choose(commit)} disabled={!!loadingHash}><span className="commit-row__hash"><GitCommitHorizontal size={16}/>{commit.shortCommitHash}</span><span className="commit-row__copy"><strong>{commit.commitMessage || 'Commit ohne Nachricht'}</strong><small>{dateTime(commit.committedAt)} · {commit.author}</small></span>{loadingHash === commit.commitHash ? <LoaderCircle className="spin" size={18}/> : <span className="commit-row__select">Auswählen</span>}</button>)}</section>;

  return <Modal open={open} title="Commit verknüpfen" description="Wähle den Commit, der zu diesem Prompt gehört. Die Vorauswahl ist nur eine zeitliche Hilfe." onClose={onClose} wide>
    <div className="commit-picker">
      {repositories.length > 1 && <Field label="Repository"><Select value={repositoryId} onChange={(event) => setRepositoryId(event.target.value)}>{repositories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>}
      {error && <div className="inline-error"><strong>Commit konnte nicht geladen werden</strong><span>{error}</span></div>}
      {loading && commits.length === 0 ? <div className="commit-loading"><LoaderCircle className="spin"/><span>Commits werden lokal gelesen …</span></div> : commits.length === 0 && !error ? <div className="commit-loading"><GitCommitHorizontal/><span>In diesem Repository wurden keine Commits gefunden.</span></div> : <>{group('Passende Commits', matching)}{group(matching.length ? 'Weitere Commits' : 'Neueste Commits', other)}{commits.length >= 30 && <Button variant="secondary" onClick={() => void load(true)} disabled={loading}>{loading ? 'Wird geladen …' : 'Weitere laden'}</Button>}</>}
      <p className="local-footnote"><Check size={15}/>Commit und Diff werden ausschliesslich lokal gelesen.</p>
    </div>
  </Modal>;
}
