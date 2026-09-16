import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** When set, renders a router link styled as a button. */
  to?: string;
  type?: 'button' | 'submit';
  children: ReactNode;
}

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', block = false, extra = ''): string {
  return ['btn', `btn--${variant}`, size !== 'md' ? `btn--${size}` : '', block ? 'btn--block' : '', extra].filter(Boolean).join(' ');
}

export function Button({ variant = 'secondary', size = 'md', block = false, to, type = 'button', className = '', children, ...rest }: ButtonProps) {
  const cls = buttonClass(variant, size, block, className);
  if (to) {
    return (
      <Link to={to} className={cls} aria-disabled={rest.disabled || undefined}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
