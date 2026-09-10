import { describe, expect, it } from 'vitest';
import { getChangelogRelease, parseChangelog } from './changelog';

describe('changelog', () => {
  it('finds the bundled release with or without a v prefix', () => {
    expect(getChangelogRelease('v1.5.0')?.new).toContain('ARM64-Unterstützung');
    expect(getChangelogRelease('1.5.0')?.fix).toHaveLength(1);
  });

  it('ignores malformed entries and sorts versions newest first', () => {
    expect(parseChangelog({
      '1.9.0': { fix: [], new: ['Alt'] },
      broken: { fix: 'not-a-list', new: [] },
      '1.10.0': { fix: ['Behoben'], new: [] }
    }).map((release) => release.version)).toEqual(['1.10.0', '1.9.0']);
  });
});
