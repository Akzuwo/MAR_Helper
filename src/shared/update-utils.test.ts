import { describe, expect, it } from 'vitest';
import { findChangelogRelease, normalizeReleaseNotes, normalizeReminderDays, parseChangelog } from './update-utils';

describe('update process helpers', () => {
  it('selects release notes for the offered version instead of combining unrelated releases', () => {
    expect(normalizeReleaseNotes([
      { version: '1.2.0', note: 'Alte Änderungen' },
      { version: '1.3.0', note: 'Aktuelle Änderungen' }
    ], '1.3.0')).toBe('Aktuelle Änderungen');
  });

  it('accepts only reasonable whole reminder periods', () => {
    expect(normalizeReminderDays(5)).toBe(5);
    expect(normalizeReminderDays(2.6)).toBe(3);
    expect(normalizeReminderDays(0)).toBeNull();
    expect(normalizeReminderDays(366)).toBeNull();
  });

  it('validates, sorts and selects structured changelog releases', () => {
    const source = {
      '1.9.0': { fix: [], new: ['Alt'] },
      broken: { fix: 'not-a-list', new: [] },
      '1.10.0': { fix: ['Behoben'], new: [] }
    };
    expect(parseChangelog(source).map((release) => release.version)).toEqual(['1.10.0', '1.9.0']);
    expect(findChangelogRelease(source, 'v1.10.0')?.fix).toEqual(['Behoben']);
  });
});
