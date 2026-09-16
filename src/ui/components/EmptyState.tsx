import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: ReactNode;
  /** Body text; `body` is an accepted alias for children. */
  body?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, body, children, action, className = '' }: EmptyStateProps) {
  const content = children ?? body;
  return (
    <div className={`empty-state ${className}`.trim()}>
      <div className="empty-state__title">{title}</div>
      {content && <div>{content}</div>}
      {action && <div style={{ marginTop: 'var(--space-3)' }}>{action}</div>}
    </div>
  );
}
