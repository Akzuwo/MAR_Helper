import { AlertCircle, Check, Info, LoaderCircle, X } from 'lucide-react';
import { forwardRef, useEffect, useId, useRef } from 'react';

export function Button({ variant = 'primary', size = 'md', icon, children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; icon?: React.ReactNode
}) {
  return <button className={`button button--${variant} button--${size} ${className}`} {...props}>
    {icon}{children}
  </button>;
}

export const IconButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string; variant?: 'secondary' | 'ghost' | 'danger'
}>(({ label, children, variant = 'secondary', ...props }, ref) =>
  <button ref={ref} className={`icon-button icon-button--${variant}`} aria-label={label} title={label} {...props}>{children}</button>
);
IconButton.displayName = 'IconButton';

interface FieldProps { label: string; hint?: string; error?: string; children: React.ReactNode; optional?: boolean }
export function Field({ label, hint, error, children, optional }: FieldProps) {
  return <label className={`field ${error ? 'field--error' : ''}`}>
    <span className="field__label">{label}{optional && <span>Optional</span>}</span>
    {children}
    {(error || hint) && <span className="field__hint">{error || hint}</span>}
  </label>;
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) =>
  <input ref={ref} className={`input ${props.className || ''}`} {...props} />
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>((props, ref) =>
  <textarea ref={ref} className={`input textarea ${props.className || ''}`} {...props} />
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>((props, ref) =>
  <select ref={ref} className={`input select ${props.className || ''}`} {...props} />
);
Select.displayName = 'Select';

export function Modal({ open, title, description, children, onClose, wide = false }: {
  open: boolean; title: string; description?: string; children: React.ReactNode; onClose: () => void; wide?: boolean
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="modal__header">
        <div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>
        <IconButton ref={closeRef} label="Dialog schliessen" variant="ghost" onClick={onClose}><X size={20}/></IconButton>
      </header>
      <div className="modal__body">{children}</div>
    </section>
  </div>;
}

export function EmptyState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state">
    <div className="empty-state__icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}
  </div>;
}

export function LoadingScreen() {
  return <div className="loading-screen"><div className="brand-mark">M</div><LoaderCircle className="spin" size={24}/><span>Daten werden geladen …</span></div>;
}

export function ErrorScreen({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-screen"><AlertCircle size={32}/><h1>Daten konnten nicht geladen werden</h1><p>{message}</p>{retry && <Button onClick={retry}>Erneut versuchen</Button>}</div>;
}

export function Toasts({ toasts, dismiss }: { toasts: Array<{ id: string; message: string; kind: 'success'|'error'|'info' }>; dismiss: (id: string) => void }) {
  return <div className="toast-region" aria-live="polite">
    {toasts.map((toast) => <div className={`toast toast--${toast.kind}`} key={toast.id}>
      {toast.kind === 'success' ? <Check size={17}/> : toast.kind === 'error' ? <AlertCircle size={17}/> : <Info size={17}/>}<span>{toast.message}</span>
      <button aria-label="Hinweis schliessen" onClick={() => dismiss(toast.id)}><X size={15}/></button>
    </div>)}
  </div>;
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Löschen', onCancel, onConfirm }: {
  open: boolean; title: string; description: string; confirmLabel?: string; onCancel: () => void; onConfirm: () => void
}) {
  return <Modal open={open} title={title} onClose={onCancel}>
    <p className="confirm-copy">{description}</p>
    <div className="form-actions"><Button variant="secondary" onClick={onCancel}>Abbrechen</Button><Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button></div>
  </Modal>;
}
