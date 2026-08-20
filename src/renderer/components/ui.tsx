import { AlertCircle, Check, Info, LoaderCircle, X } from 'lucide-react';
import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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

export function Modal({ open, title, description, children, onClose, wide = false, bodyClassName = '', dismissible = true }: {
  open: boolean; title: string; description?: string; children: React.ReactNode; onClose: () => void; wide?: boolean; bodyClassName?: string; dismissible?: boolean
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [mounted, setMounted] = useState(open);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    if (!mounted) return;
    const fallback = window.setTimeout(() => setMounted(false), 260);
    return () => window.clearTimeout(fallback);
  }, [open, mounted]);
  useEffect(() => {
    if (!open || !mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    if (dismissible) closeRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      const overlays = document.querySelectorAll('.overlay');
      if (dismissible && event.key === 'Escape' && overlays[overlays.length - 1] === overlayRef.current) onCloseRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); previous?.focus(); };
  }, [dismissible, open, mounted]);
  if (!mounted) return null;

  return createPortal(<div ref={overlayRef} className={`overlay overlay--${open ? 'open' : 'closing'}`} role="presentation">
    <div
      className="overlay__backdrop"
      aria-hidden="true"
      onAnimationEnd={(event) => { if (!open && event.animationName === 'backdrop-in') setMounted(false); }}
      onMouseDown={() => { if (open && dismissible) onCloseRef.current(); }}
    />
    <section className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="modal__header">
        <div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>
        {dismissible && <IconButton ref={closeRef} label="Dialog schliessen" variant="ghost" onClick={() => onCloseRef.current()}><X size={20}/></IconButton>}
      </header>
      <div className={`modal__body ${bodyClassName}`}>{children}</div>
    </section>
  </div>, document.body);
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
