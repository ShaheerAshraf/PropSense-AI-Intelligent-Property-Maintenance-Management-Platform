import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      {hint ? <p className="metric-hint">{hint}</p> : null}
    </article>
  );
}

export function Panel({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="panel">
      {(title || actions) && (
        <div className="panel-head">
          {title ? <h2>{title}</h2> : <span />}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({
  value,
  tone = 'neutral',
}: {
  value: string;
  tone?: 'neutral' | 'good' | 'warn' | 'danger' | 'info';
}) {
  return <span className={`badge tone-${tone}`}>{value}</span>;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return <p className="status-line">{label}</p>;
}

export function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="form-error">{message}</p>;
}

export function priorityTone(priority: string) {
  if (priority === 'CRITICAL') return 'danger' as const;
  if (priority === 'HIGH') return 'warn' as const;
  if (priority === 'MEDIUM') return 'info' as const;
  return 'neutral' as const;
}

export function statusTone(status: string) {
  if (status === 'COMPLETED' || status === 'CLOSED' || status === 'APPROVED')
    return 'good' as const;
  if (status === 'CANCELLED' || status === 'REJECTED') return 'danger' as const;
  if (status === 'IN_PROGRESS' || status === 'PENDING' || status === 'ASSIGNED')
    return 'info' as const;
  if (status === 'WAITING_FOR_PARTS') return 'warn' as const;
  return 'neutral' as const;
}
