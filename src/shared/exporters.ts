import type { AppState, JournalEntry, PlannerTask, PromptEntry } from './models';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION } from './importers';

const APP_VERSION = '1.0.0';

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = (rows: unknown[][]) => rows.map((row) => row.map(csvCell).join(',')).join('\r\n');

export const exportJournalCsv = (entries: JournalEntry[]) => csv([
  ['ID', 'Aktivität', 'Start', 'Ende', 'Arbeitszeit (ms)', 'Pausenzeit (ms)', 'Task-ID'],
  ...entries.map((entry) => [entry.id, entry.title, entry.startedAt, entry.endedAt, entry.workingTimeMs, entry.pausedTimeMs, entry.linkedTaskId])
]);

export const exportPlannerCsv = (tasks: PlannerTask[]) => csv([
  ['ID', 'Titel', 'Beschreibung', 'Fällig am', 'Status', 'Erstellt'],
  ...tasks.map((task) => [task.id, task.title, task.description, task.dueDate, task.completed ? 'Erledigt' : 'Offen', task.createdAt])
]);

const deDateTime = (iso: string) => new Intl.DateTimeFormat('de-CH', {
  dateStyle: 'medium', timeStyle: 'short'
}).format(new Date(iso));

const diffFence = (diff: string) => '`'.repeat(Math.max(3, ...Array.from(diff.matchAll(/`+/g), (match) => match[0].length + 1)));

const gitMarkdown = (entry: PromptEntry): string[] => {
  const git = entry.gitSnapshot;
  if (!git) return [];
  const fence = diffFence(git.diff);
  return [
    '### Codeänderungen',
    `**Repository:** ${git.repositoryName}  `,
    `**Commit:** ${git.shortCommitHash}  `,
    `**Message:** ${git.commitMessage}  `,
    `**Änderungen:** ${git.filesChanged} Dateien, +${git.additions} / -${git.deletions}`,
    '',
    '#### Dateien',
    '',
    ...git.files.map((file) => `- \`${file.path.replaceAll('`', '\\`')}\`${file.binary ? ' – Binärdatei geändert' : ` +${file.additions ?? 0} -${file.deletions ?? 0}`}`),
    '',
    '#### Diff',
    '',
    `${fence}diff`,
    git.diff,
    fence,
    ''
  ];
};

export const exportPromptsMarkdown = (entries: PromptEntry[]) => [
  '# Promptprotokoll',
  '',
  ...[...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).flatMap((entry) => [
    `## ${deDateTime(entry.createdAt)}`,
    `**Modell:** ${entry.modelName}`,
    '',
    '### Prompt',
    entry.prompt,
    '',
    '### Antwort',
    entry.response,
    '',
    ...gitMarkdown(entry),
    '---',
    ''
  ])
].join('\n');

export const exportAllJson = (state: AppState) => JSON.stringify({
  format: EXPORT_FORMAT,
  formatVersion: EXPORT_FORMAT_VERSION,
  appVersion: APP_VERSION,
  exportedAt: new Date().toISOString(),
  data: state
}, null, 2);

export const exportModuleJson = (module: 'journal' | 'prompts' | 'planner', data: JournalEntry[] | PromptEntry[] | PlannerTask[]) => JSON.stringify({
  format: EXPORT_FORMAT,
  formatVersion: EXPORT_FORMAT_VERSION,
  appVersion: APP_VERSION,
  module,
  exportedAt: new Date().toISOString(),
  data
}, null, 2);
