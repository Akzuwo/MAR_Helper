export const normalizeReleaseNotes = (notes: unknown, version?: string): string | undefined => {
  if (typeof notes === 'string') return notes.trim() || undefined;
  if (!Array.isArray(notes)) return undefined;

  const entries: Array<{ note: string; version?: string }> = notes.flatMap((entry): Array<{ note: string; version?: string }> => {
    if (typeof entry === 'string') return [{ note: entry }];
    if (typeof entry !== 'object' || entry === null || !('note' in entry) || typeof entry.note !== 'string') return [];
    return [{ note: entry.note, version: 'version' in entry && typeof entry.version === 'string' ? entry.version : undefined }];
  });
  const matching = version ? entries.find((entry) => entry.version === version || entry.version === `v${version}`) : undefined;
  const text = matching?.note ?? entries.map((entry) => entry.note).filter(Boolean).join('\n\n');
  return text.trim() || undefined;
};

export const normalizeReminderDays = (days: unknown): number | null => {
  if (typeof days !== 'number' || !Number.isFinite(days)) return null;
  const rounded = Math.round(days);
  return rounded >= 1 && rounded <= 365 ? rounded : null;
};
