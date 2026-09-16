import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  /** Rendered at the right of the title row (chips, small buttons). */
  aside?: ReactNode;
  /** Rendered below the body as a wrapping button row. */
  actions?: ReactNode;
  tone?: 'default' | 'accent' | 'warning';
  flat?: boolean;
  as?: 'section' | 'article' | 'div';
  children?: ReactNode;
}

export function Card({ title, aside, actions, tone = 'default', flat = false, as = 'section', className = '', children, ...rest }: CardProps) {
  const Tag = as;
  const cls = ['card', tone !== 'default' ? `card--${tone}` : '', flat ? 'card--flat' : '', className].filter(Boolean).join(' ');
  return (
    <Tag className={cls} {...rest}>
      {(title || aside) && (
        <div className="card__header">
          {title ? <h2 className="card__title">{title}</h2> : <span />}
          {aside}
        </div>
      )}
      {children}
      {actions && <div className="card__actions">{actions}</div>}
    </Tag>
  );
}
