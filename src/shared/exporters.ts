import type { AppState, JournalEntry, PlannerTask, PromptEntry } from './models';

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
    '---',
    ''
  ])
].join('\n');

export const exportAllJson = (state: AppState) => JSON.stringify({
  exportedAt: new Date().toISOString(),
  application: 'MAR Helper',
  data: state
}, null, 2);

export const exportModuleJson = (module: 'journal' | 'prompts' | 'planner', data: JournalEntry[] | PromptEntry[] | PlannerTask[]) => JSON.stringify({
  format: 'mar-helper',
  version: 1,
  module,
  exportedAt: new Date().toISOString(),
  data
}, null, 2);
