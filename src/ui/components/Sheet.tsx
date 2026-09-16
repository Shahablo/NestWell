import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

export interface SheetProps {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  /** Label for the close control. */
  closeLabel?: string;
  /** When false, clicking the backdrop or pressing Escape does not close the sheet. */
  dismissable?: boolean;
  /** Buttons rendered in a row under the body. */
  footer?: ReactNode;
  children: ReactNode;
}

/** Bottom sheet on phones, centered modal on wider screens. */
export function Sheet({ open, title, onClose, closeLabel = 'Close', dismissable = true, footer, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [open, dismissable, onClose]);

  if (!open) return null;

  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1} ref={panelRef}>
        <div className="sheet__header">
          {title ? <h2 className="sheet__title">{title}</h2> : <span />}
          <Button variant="quiet" size="sm" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
        {children}
        {footer && <div className="card__actions">{footer}</div>}
      </div>
    </div>
  );
}
