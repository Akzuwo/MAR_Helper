import { Bug, Sparkles } from 'lucide-react';
import type { ChangelogRelease } from '../changelog';

export function ChangelogContent({ releases, compact = false }: { releases: ChangelogRelease[]; compact?: boolean }) {
  if (!releases.length) return <p className="changelog-empty">Für diese Version sind noch keine Änderungen eingetragen.</p>;

  return <div className={`changelog ${compact ? 'changelog--compact' : ''}`}>
    {releases.map((release) => <section className="changelog__release" key={release.version}>
      {!compact && <header><span>Version</span><h3>{release.version}</h3></header>}
      <div className="changelog__entries">
        {release.fix.map((entry) => <div className="changelog-entry changelog-entry--fix" key={`fix-${entry}`}>
          <span><Bug size={15}/>Fix</span><p>{entry}</p>
        </div>)}
        {release.new.map((entry) => <div className="changelog-entry changelog-entry--new" key={`new-${entry}`}>
          <span><Sparkles size={15}/>Neu</span><p>{entry}</p>
        </div>)}
      </div>
    </section>)}
  </div>;
}
