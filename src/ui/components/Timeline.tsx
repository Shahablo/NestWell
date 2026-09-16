import type { ReactNode } from 'react';

export interface TimelineEntry {
  id: string;
  /** Already formatted for display (use formatDateTime in the practice timezone). */
  dateLabel: string;
  title: ReactNode;
  body?: ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'muted';
}

export interface TimelineProps {
  entries: TimelineEntry[];
  className?: string;
}

/** A simple vertical list of dated entries. */
export function Timeline({ entries, className = '' }: TimelineProps) {
  return (
    <ol className={`timeline ${className}`.trim()}>
      {entries.map((e) => (
        <li key={e.id} className={['timeline__entry', e.tone && e.tone !== 'default' ? `timeline__entry--${e.tone}` : ''].filter(Boolean).join(' ')}>
          <div className="timeline__date">{e.dateLabel}</div>
          <div className="timeline__title">{e.title}</div>
          {e.body && <div className="timeline__body">{e.body}</div>}
        </li>
      ))}
    </ol>
  );
}
