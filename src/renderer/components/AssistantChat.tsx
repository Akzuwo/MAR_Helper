import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, Check, LoaderCircle, Square, Trash2 } from 'lucide-react';
import { ThinkingOrb } from 'thinking-orbs';
import type { AssistantChatMessage } from '../../shared/models';
import { useAppData } from '../state/AppDataContext';
import { Button, IconButton, Modal, Textarea } from './ui';
import { MarkdownContent } from './MarkdownContent';

interface ChatEntry extends AssistantChatMessage { changes?: string[]; error?: boolean }
const resizeComposer = (textarea: HTMLTextAreaElement) => {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
};
export function AssistantChat({ page }: { page: string }) {
  const { state, assistantStatus, sendAssistantMessage, undo, historyStatus } = useAppData();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealingIndex, setRevealingIndex] = useState<number | null>(null);
  const [visibleText, setVisibleText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const attachComposer = useCallback((textarea: HTMLTextAreaElement | null) => {
    composerRef.current = textarea;
    if (textarea) resizeComposer(textarea);
  }, []);
  const inFlight = useRef(false);
  const enabledRef = useRef(state.settings.localAssistant.enabled);
  enabledRef.current = state.settings.localAssistant.enabled;
  useLayoutEffect(() => { if (composerRef.current) resizeComposer(composerRef.current); }, [draft, open]);
  useEffect(() => {
    if (revealingIndex === null) return;
    const message = messages[revealingIndex];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => { setRevealingIndex(null); setVisibleText(''); };
    if (!message || !open || reducedMotion.matches) { finish(); return; }
    const characters = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(message.content), (part) => part.segment);
    const duration = Math.min(8_000, Math.max(600, characters.length / 80 * 1_000));
    const started = performance.now();
    let frame = 0;
    let shown = 0;
    const tick = (now: number) => {
      const length = Math.min(characters.length, Math.max(1, Math.floor((now - started) / duration * characters.length)));
      if (length !== shown) { shown = length; setVisibleText(characters.slice(0, length).join('')); }
      if (length >= characters.length) finish();
      else frame = requestAnimationFrame(tick);
    };
    const onMotionChange = () => { if (reducedMotion.matches) { cancelAnimationFrame(frame); finish(); } };
    frame = requestAnimationFrame(tick);
    reducedMotion.addEventListener('change', onMotionChange);
    return () => { cancelAnimationFrame(frame); reducedMotion.removeEventListener('change', onMotionChange); };
  }, [revealingIndex, messages, open]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: revealingIndex === null ? 'smooth' : 'auto' }); }, [messages, busy, open, visibleText, revealingIndex]);
  useEffect(() => { if (!state.settings.localAssistant.enabled) { setOpen(false); setMessages([]); setDraft(''); } }, [state.settings.localAssistant.enabled]);
  if (!state.settings.localAssistant.enabled) return null;
  const ready = assistantStatus.phase === 'ready';
  const working = busy || revealingIndex !== null;
  const send = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || inFlight.current || revealingIndex !== null || !ready) return;
    const next: ChatEntry[] = [...messages, { role: 'user', content }];
    setMessages(next); setDraft(''); setBusy(true); inFlight.current = true;
    try {
      const result = await sendAssistantMessage(next.filter((message) => !message.error).slice(-30).map(({ role, content }) => ({ role, content })), page);
      if (!enabledRef.current) return;
      setMessages((current) => [...current, { role: 'assistant', content: result.message, changes: result.ok ? result.changes : undefined, error: !result.ok }]);
      if (result.ok && result.message) { setVisibleText(''); setRevealingIndex(next.length); }
    } finally { inFlight.current = false; setBusy(false); }
  };
  return <>
    <button className={`assistant-fab ${ready ? 'assistant-fab--ready' : ''}`} aria-label="Lokalen KI-Assistenten öffnen" title="Lokaler KI-Assistent" onClick={() => setOpen(true)}>
      <Bot size={25}/><span className="assistant-fab__dot"/>
    </button>
    <Modal open={open} title="Lokaler KI-Assistent" description={assistantStatus.model ?? 'Ollama wird eingerichtet'} onClose={() => setOpen(false)} bodyClassName="assistant-chat" wide>
      <div className={`assistant-chat__status ${assistantStatus.phase === 'error' ? 'assistant-chat__status--error' : ''}`} role="status">
        {ready ? <Check size={17}/> : assistantStatus.phase !== 'error' ? <LoaderCircle size={17} className="spin"/> : <Bot size={17}/>}
        <span>{assistantStatus.message}</span>
        {assistantStatus.phase === 'error' && <Button size="sm" variant="secondary" onClick={() => void window.marHelper.retryAssistantSetup()}>Erneut versuchen</Button>}
      </div>
      {!ready && assistantStatus.percent !== undefined && <progress max={100} value={assistantStatus.percent} aria-label="Installationsfortschritt"/>}
      <div className="assistant-chat__log" ref={logRef} role="log" aria-label="Chatverlauf" aria-live="polite">
        {messages.length === 0 && <div className="assistant-chat__welcome"><Bot size={36}/><h3>Was möchtest du erledigen?</h3><p>Ich kann deine Einträge lesen und bearbeiten, Rohtext übernehmen und Sitzungen bedienen.</p><div className="assistant-chat__suggestions">{['Starte eine Sitzung für Recherche.', 'Welche Aufgaben sind noch offen?', 'Wie exportiere ich mein Arbeitsjournal?'].map((text) => <button key={text} disabled={!ready} onClick={() => setDraft(text)}>{text}</button>)}</div></div>}
        {messages.map((message, index) => <article key={index} aria-busy={index === revealingIndex} aria-label={message.role === 'user' ? 'Deine Nachricht' : 'Antwort des Assistenten'} className={`assistant-chat__message assistant-chat__message--${message.role} ${message.error ? 'assistant-chat__message--error' : ''}`}><MarkdownContent>{index === revealingIndex ? visibleText : message.content}</MarkdownContent>{index !== revealingIndex && !!message.changes?.length && <ul className="assistant-chat__changes">{message.changes.map((change, index) => <li key={index}><Check size={14}/>{change}</li>)}</ul>}</article>)}
        {busy && <div className="assistant-chat__thinking" role="status"><span>Denkt nach …</span><ThinkingOrb state="working" size={20} theme="light" paused={!open} aria-hidden="true"/></div>}
      </div>
      <form className="assistant-chat__form" onSubmit={(event) => void send(event)}>
        <div className="assistant-chat__composer">
          <Textarea ref={attachComposer} aria-label="Nachricht an den lokalen Assistenten" aria-describedby="assistant-composer-hint" placeholder={ready ? 'Frage stellen oder Rohtext einfügen …' : 'Der Chat ist nach der Einrichtung verfügbar …'} value={draft} maxLength={30_000} disabled={!ready || working} rows={1} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}/>
          {working ? <IconButton className="assistant-chat__send" label={busy ? 'Anfrage abbrechen' : 'Antwort vollständig anzeigen'} type="button" onClick={() => { if (busy) void window.marHelper.cancelAssistant(); else setRevealingIndex(null); }}><Square size={15} fill="currentColor"/></IconButton> : <IconButton className="assistant-chat__send" label="Senden" type="submit" disabled={!ready || !draft.trim()}><ArrowUp size={20}/></IconButton>}
        </div>
        <p className="assistant-chat__hint" id="assistant-composer-hint">Enter senden · Shift+Enter neue Zeile</p>
      </form>
      <footer className="assistant-chat__footer"><span>Lokal verarbeitet · Beta</span><div><Button variant="ghost" size="sm" disabled={working || !historyStatus.canUndo} onClick={() => void undo()}>Letzte App-Änderung rückgängig</Button><IconButton label="Chat leeren" variant="ghost" disabled={working || !messages.length} onClick={() => setMessages([])}><Trash2 size={15}/></IconButton></div></footer>
    </Modal>
  </>;
}
