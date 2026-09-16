import type { ReactNode } from 'react';

export type ChipVariant = 'neutral' | 'accent' | 'warning' | 'danger' | 'ai';

export interface ChipProps {
  variant?: ChipVariant;
  title?: string;
  className?: string;
  children: ReactNode;
}

export function Chip({ variant = 'neutral', title, className = '', children }: ChipProps) {
  const cls = ['chip', variant !== 'neutral' ? `chip--${variant}` : '', className].filter(Boolean).join(' ');
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}
