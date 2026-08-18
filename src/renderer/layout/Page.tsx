export function PageHeader({ title, description, eyebrow, actions }: { title: string; description?: string; eyebrow?: string; actions?: React.ReactNode }) {
  return <header className="page-header">
    <div>{eyebrow && <span className="page-header__eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="page-header__actions">{actions}</div>}
  </header>;
}

export function Page({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <main className={`page ${className}`}>{children}</main>;
}
