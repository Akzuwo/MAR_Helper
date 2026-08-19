import type { AppState, JournalEntry, PlannerTask, PromptEntry } from './models';
import { formatDuration } from './timer';

export const AUTO_EXPORT_FILE_NAME = 'MAR-Helper-Protokolle.pdf';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const dateTime = (iso: string) => new Intl.DateTimeFormat('de-CH', {
  dateStyle: 'medium', timeStyle: 'short'
}).format(new Date(iso));

const dateOnly = (iso: string) => new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium' }).format(new Date(iso));

const emptyState = (copy: string) => `<div class="empty">${escapeHtml(copy)}</div>`;

const journalEntry = (entry: JournalEntry) => `<article class="entry journal-entry">
  <div class="entry-marker"></div>
  <div class="entry-main">
    <div class="entry-topline"><h3>${escapeHtml(entry.title)}</h3><time>${escapeHtml(dateTime(entry.startedAt))}</time></div>
    <div class="metrics">
      <span><b>${escapeHtml(formatDuration(entry.workingTimeMs, true))}</b> Arbeitszeit</span>
      <span><b>${escapeHtml(formatDuration(entry.pausedTimeMs, true))}</b> Pause</span>
      <span><b>${escapeHtml(dateTime(entry.endedAt))}</b> beendet</span>
    </div>
    ${entry.notes ? `<p class="notes">${escapeHtml(entry.notes)}</p>` : ''}
  </div>
</article>`;

const promptEntry = (entry: PromptEntry) => `<article class="entry prompt-entry">
  <div class="prompt-heading">
    <span class="number">#${entry.number}</span>
    <div><h3>${escapeHtml(entry.title || entry.prompt.split('\n').find((line) => line.trim())?.slice(0, 100) || 'Prompt')}</h3>
    <p>${escapeHtml(entry.modelName)} · ${escapeHtml(dateTime(entry.createdAt))}${entry.updatedAt ? ` · bearbeitet ${escapeHtml(dateTime(entry.updatedAt))}` : ''}</p></div>
  </div>
  <section class="text-block"><h4>Prompt</h4><div>${escapeHtml(entry.prompt)}</div></section>
  <section class="text-block answer"><h4>Antwort</h4><div>${escapeHtml(entry.response)}</div></section>
  ${entry.gitSnapshot ? `<div class="commit"><b>${escapeHtml(entry.gitSnapshot.repositoryName)}</b><span>${escapeHtml(entry.gitSnapshot.shortCommitHash)} · ${escapeHtml(entry.gitSnapshot.commitMessage)}</span><small>${entry.gitSnapshot.filesChanged} Dateien · +${entry.gitSnapshot.additions} / -${entry.gitSnapshot.deletions}</small></div>` : ''}
</article>`;

const plannerTask = (task: PlannerTask) => `<article class="task ${task.completed ? 'done' : ''}">
  <span class="task-state">${task.completed ? '✓' : ''}</span>
  <div><h3>${escapeHtml(task.title)}</h3>${task.description ? `<p>${escapeHtml(task.description)}</p>` : ''}</div>
  <time>${task.dueDate ? escapeHtml(dateOnly(task.dueDate)) : 'Kein Termin'}</time>
</article>`;

export function createAutoExportHtml(state: AppState, exportedAt = new Date()): string {
  const journals = [...state.journalEntries].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const prompts = [...state.promptEntries].sort((a, b) => a.number - b.number);
  const tasks = [...state.plannerTasks].sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const totalWorkingTime = journals.reduce((sum, entry) => sum + entry.workingTimeMs, 0);
  const completedTasks = tasks.filter((task) => task.completed).length;
  const exportedLabel = dateTime(exportedAt.toISOString());

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>MAR Helper – Protokolle</title><style>
  :root { color: #191c1d; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 10pt; line-height: 1.45; }
  * { box-sizing: border-box; }
  @page { size: A4; margin: 17mm 15mm 19mm; }
  body { margin: 0; color: #191c1d; background: white; }
  .cover { min-height: 245mm; display: flex; flex-direction: column; justify-content: space-between; break-after: page; }
  .brand { display: flex; align-items: center; gap: 10px; color: #3525cd; font-size: 10pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  .brand-mark { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 9px; color: white; background: linear-gradient(145deg,#5d52f0,#3525cd); font-size: 16px; letter-spacing: 0; }
  .cover-main { padding: 35mm 0 20mm; }
  .kicker, .section-kicker { color: #4f46e5; font-size: 9pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  h1 { max-width: 150mm; margin: 5mm 0 4mm; font-size: 35pt; line-height: 1.04; letter-spacing: -.035em; }
  .cover-main > p { max-width: 132mm; margin: 0; color: #575e70; font-size: 14pt; line-height: 1.5; }
  .summary { display: grid; grid-template-columns: repeat(3,1fr); gap: 4mm; margin-top: 18mm; }
  .summary > div { padding: 5mm; border: .3mm solid #d7d5e2; border-radius: 3mm; background: #f8f9fa; }
  .summary strong, .summary span { display: block; }
  .summary strong { color: #3525cd; font-size: 20pt; line-height: 1.1; }
  .summary span { margin-top: 1.5mm; color: #575e70; font-size: 8.5pt; }
  .cover-footer { display: flex; justify-content: space-between; padding-top: 5mm; border-top: .3mm solid #d7d5e2; color: #777587; font-size: 8.5pt; }
  .module { break-before: page; }
  .module-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 10mm; margin-bottom: 8mm; padding-bottom: 5mm; border-bottom: .35mm solid #c7c4d8; }
  .module-header h2 { margin: 1mm 0 0; font-size: 24pt; line-height: 1.15; letter-spacing: -.025em; }
  .module-header p { margin: 0 0 1mm; color: #575e70; text-align: right; }
  .entry { position: relative; margin-bottom: 4mm; break-inside: avoid; border: .3mm solid #d7d5e2; border-radius: 3mm; background: white; }
  .journal-entry { display: grid; grid-template-columns: 2mm 1fr; overflow: hidden; }
  .entry-marker { background: #4f46e5; }
  .entry-main { padding: 4.5mm 5mm; }
  .entry-topline { display: flex; align-items: baseline; justify-content: space-between; gap: 8mm; }
  h3 { margin: 0; font-size: 12pt; line-height: 1.35; }
  time { color: #777587; font-size: 8.5pt; white-space: nowrap; }
  .metrics { display: flex; flex-wrap: wrap; gap: 5mm; margin-top: 2.5mm; color: #575e70; font-size: 8.5pt; }
  .metrics b { color: #3525cd; font-weight: 600; }
  .notes { margin: 3mm 0 0; padding-top: 3mm; border-top: .3mm solid #e7e6ed; color: #464555; white-space: pre-wrap; }
  .prompt-entry { padding: 5mm; }
  .prompt-heading { display: flex; align-items: flex-start; gap: 4mm; }
  .prompt-heading > div { min-width: 0; flex: 1; }
  .prompt-heading p { margin: 1mm 0 0; color: #575e70; font-size: 8.5pt; }
  .number { flex: 0 0 auto; padding: 1.5mm 2.5mm; border-radius: 2mm; color: #3525cd; background: #eef2ff; font: 700 9pt ui-monospace,monospace; }
  .text-block { margin-top: 4mm; padding: 4mm; border-radius: 2.5mm; background: #f5f5f7; break-inside: auto; }
  .text-block.answer { background: #f4f3ff; }
  .text-block h4 { margin: 0 0 2mm; color: #575e70; font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; }
  .text-block div { color: #292a30; font: 8.8pt/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
  .commit { display: grid; grid-template-columns: auto 1fr auto; gap: 3mm; margin-top: 3mm; padding: 3mm 4mm; border-radius: 2mm; color: #464555; background: #eef2ff; font-size: 8pt; }
  .commit span { overflow-wrap: anywhere; }
  .commit small { color: #575e70; }
  .task { display: grid; grid-template-columns: 7mm 1fr auto; align-items: start; gap: 3mm; margin-bottom: 3mm; padding: 4mm 5mm; break-inside: avoid; border: .3mm solid #d7d5e2; border-radius: 2.5mm; }
  .task-state { width: 6mm; height: 6mm; display: grid; place-items: center; border: .35mm solid #aaa8ba; border-radius: 1.5mm; color: white; }
  .task.done .task-state { border-color: #4f46e5; background: #4f46e5; }
  .task.done h3 { color: #777587; text-decoration: line-through; }
  .task p { margin: 1mm 0 0; color: #575e70; }
  .empty { padding: 15mm; border: .35mm dashed #c7c4d8; border-radius: 3mm; color: #777587; text-align: center; background: #f8f9fa; }
</style></head><body>
  <section class="cover">
    <div><div class="brand"><span class="brand-mark">M</span> MAR Helper</div>
      <div class="cover-main"><span class="kicker">Automatischer Export · Beta</span><h1>Protokolle und Projektfortschritt</h1><p>Eine aktuelle, druckfertige Übersicht aus Arbeitsjournal, Promptprotokoll und Zeitplan.</p>
        <div class="summary"><div><strong>${journals.length}</strong><span>Journaleinträge · ${escapeHtml(formatDuration(totalWorkingTime, true))}</span></div><div><strong>${prompts.length}</strong><span>Dokumentierte Prompts</span></div><div><strong>${completedTasks}/${tasks.length}</strong><span>Aufgaben erledigt</span></div></div>
      </div></div>
    <footer class="cover-footer"><span>Lokal mit MAR Helper erstellt</span><span>Stand ${escapeHtml(exportedLabel)}</span></footer>
  </section>
  <section class="module"><header class="module-header"><div><span class="section-kicker">Arbeitsverlauf</span><h2>Arbeitsjournal</h2></div><p>${journals.length} Einträge<br>${escapeHtml(formatDuration(totalWorkingTime, true))} dokumentiert</p></header>${journals.length ? journals.map(journalEntry).join('') : emptyState('Noch keine Journaleinträge vorhanden.')}</section>
  <section class="module"><header class="module-header"><div><span class="section-kicker">KI-Nutzung</span><h2>Promptprotokoll</h2></div><p>${prompts.length} Einträge<br>fortlaufend nummeriert</p></header>${prompts.length ? prompts.map(promptEntry).join('') : emptyState('Noch keine Prompt-Einträge vorhanden.')}</section>
  <section class="module"><header class="module-header"><div><span class="section-kicker">Planung</span><h2>Zeitplan</h2></div><p>${completedTasks} von ${tasks.length}<br>Aufgaben erledigt</p></header>${tasks.length ? tasks.map(plannerTask).join('') : emptyState('Noch keine Aufgaben vorhanden.')}</section>
</body></html>`;
}
