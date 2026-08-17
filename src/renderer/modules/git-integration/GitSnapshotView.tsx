import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileCode2, GitCommitHorizontal, Link2Off, Pencil, TriangleAlert } from 'lucide-react';
import type { PromptGitSnapshot } from '../../../shared/models';
import { Button } from '../../components/ui';

function splitDiff(diff: string) {
  const parts = diff.split(/(?=^diff --git )/m).filter(Boolean);
  return parts.map((content, index) => {
    const match = content.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    return { key: `${index}-${match?.[2] ?? index}`, path: match?.[2] ?? `Diff ${index + 1}`, content };
  });
}

export function GitSnapshotView({ snapshot, onChange, onRemove }: { snapshot: PromptGitSnapshot; onChange: () => void; onRemove: () => void }) {
  const [diffOpen, setDiffOpen] = useState(false);
  const [showLarge, setShowLarge] = useState(false);
  const sections = useMemo(() => splitDiff(snapshot.diff), [snapshot.diff]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const lines = snapshot.diff.split('\n').length;
  const large = lines > 5000 || snapshot.diff.length > 1_500_000;
  const toggleFile = (key: string) => setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  const renderLine = (line: string, index: number) => <span key={index} className={line.startsWith('+') && !line.startsWith('+++') ? 'diff-add' : line.startsWith('-') && !line.startsWith('---') ? 'diff-del' : line.startsWith('@@') ? 'diff-hunk' : ''}>{line || ' '}</span>;

  return <article className="git-snapshot-card">
    <header><div className="git-snapshot-title"><span><GitCommitHorizontal size={19}/></span><div><h2>Codeänderungen</h2><p>{snapshot.repositoryName}</p></div></div><div className="git-snapshot-actions"><Button size="sm" variant="ghost" icon={<Pencil size={15}/>} onClick={onChange}>Anderen Commit verknüpfen</Button><Button size="sm" variant="ghost" icon={<Link2Off size={15}/>} onClick={onRemove}>Verknüpfung entfernen</Button></div></header>
    <div className="git-summary"><div><strong>{snapshot.shortCommitHash} · {snapshot.commitMessage}</strong><span>{snapshot.author ? `${snapshot.author} · ` : ''}{new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(snapshot.committedAt))}</span></div><div className="git-stats"><span>{snapshot.filesChanged} Dateien geändert</span><b>+{snapshot.additions}</b><i>-{snapshot.deletions}</i></div></div>
    <div className="git-file-list">{snapshot.files.map((file) => <div key={file.path}><FileCode2 size={15}/><span>{file.path}</span>{file.binary ? <small>Binärdatei geändert</small> : <small><b>+{file.additions ?? 0}</b> <i>-{file.deletions ?? 0}</i></small>}</div>)}</div>
    <div className="git-diff-actions"><Button variant="secondary" onClick={() => setDiffOpen((value) => !value)}>{diffOpen ? 'Diff ausblenden' : 'Diff anzeigen'}</Button></div>
    {diffOpen && large && !showLarge && <div className="large-diff-warning"><TriangleAlert size={20}/><div><strong>Dieser Commit enthält sehr viele Änderungen.</strong><span>Der vollständige Diff kann die Darstellung verlangsamen. Die Dateiliste bleibt weiterhin verfügbar.</span></div><Button size="sm" onClick={() => setShowLarge(true)}>Trotzdem anzeigen</Button><Button size="sm" variant="secondary" onClick={() => setDiffOpen(false)}>Nur Dateiliste anzeigen</Button></div>}
    {diffOpen && snapshot.diffTruncated && <div className="large-diff-warning"><TriangleAlert size={20}/><div><strong>Diff-Grössenlimit erreicht</strong><span>{snapshot.diff}</span></div></div>}
    {diffOpen && (!large || showLarge) && !snapshot.diffTruncated && <div className={`diff-view ${large ? 'diff-view--large' : ''}`}>{sections.map((section) => { const file = snapshot.files.find((item) => item.path === section.path); return <section className="diff-file" key={section.key}><button onClick={() => toggleFile(section.key)}>{collapsed[section.key] ? <ChevronRight size={17}/> : <ChevronDown size={17}/>}<strong>{section.path}</strong>{file && !file.binary && <span><b>+{file.additions ?? 0}</b> <i>-{file.deletions ?? 0}</i></span>}{file?.binary && <small>Binärdatei geändert</small>}</button>{!collapsed[section.key] && (file?.binary ? <div className="binary-placeholder">Binärdatei geändert – kein Text-Diff verfügbar.</div> : large ? <pre>{section.content}</pre> : <pre>{section.content.split('\n').map(renderLine)}</pre>)}</section>; })}</div>}
  </article>;
}
