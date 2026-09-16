import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Router destination; renders the row as a link. */
  to?: string;
  /** Click handler; renders the row as a button. */
  onClick?: () => void;
  className?: string;
}

export function ListRow({ title, subtitle, leading, trailing, to, onClick, className = '' }: ListRowProps) {
  const body = (
    <>
      {leading && <div className="list-row__leading">{leading}</div>}
      <div className="list-row__body">
        <div className="list-row__title">{title}</div>
        {subtitle && <div className="list-row__subtitle">{subtitle}</div>}
      </div>
      {trailing && <div className="list-row__trailing">{trailing}</div>}
    </>
  );
  const cls = `list-row ${className}`.trim();
  if (to) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Wrapper that draws the bordered list around rows. */
export function List({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`list ${className}`.trim()}>{children}</div>;
}
