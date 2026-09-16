import type { ReactNode } from 'react';

export type BannerVariant = 'synthetic' | 'warning' | 'emergency' | 'info';

export interface BannerProps {
  variant: BannerVariant;
  title?: ReactNode;
  /** Optional trailing controls. */
  actions?: ReactNode;
  role?: 'status' | 'alert' | 'note';
  className?: string;
  children?: ReactNode;
}

export function Banner({ variant, title, actions, role, className = '', children }: BannerProps) {
  const ariaRole = role ?? (variant === 'emergency' ? 'alert' : 'status');
  return (
    <div className={`banner banner--${variant} ${className}`.trim()} role={ariaRole}>
      <div className="banner__body">
        {title && <div className="banner__title">{title}</div>}
        {children}
      </div>
      {actions}
    </div>
  );
}
