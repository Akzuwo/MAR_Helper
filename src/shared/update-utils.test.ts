import { describe, expect, it } from 'vitest';
import { normalizeReleaseNotes, normalizeReminderDays } from './update-utils';

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
});
