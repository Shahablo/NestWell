/**
 * FR-22: locked safety-critical content rendered byte for byte by non-AI code. This component
 * reads the approved content item straight from the content index and prints its body in a
 * <pre>-like block so nothing reflows or rewrites it. It never imports anything from the AI
 * layer. The full-screen layout is a fixed overlay with one "I have read this" button; the
 * button only closes the overlay and gates nothing else.
 */
import { useState, type ReactNode } from 'react';
import { useApp } from '../shell/useApp';
import type { Locale } from '../../domain/types';
import { Button } from './Button';
import { Placeholder } from './Placeholder';

export interface LockedContentProps {
  id: string;
  layout: 'full_screen' | 'inline';
  vars?: Record<string, string | number | null | undefined>;
  locale?: Locale;
  /** Called after the reader closes the full-screen layout. */
  onClose?: () => void;
  /** Extra controls rendered under the body (e.g. the callback button on the help screen). */
  children?: ReactNode;
  className?: string;
}

export function LockedContent({ id, layout, vars = {}, locale = 'en', onClose, children, className = '' }: LockedContentProps) {
  const { content } = useApp();
  const [closed, setClosed] = useState(false);
  const item = content.get(id, locale);
  const body = content.text(id, vars, locale);
  const fellBack = content.fellBack(id, locale);
  const title = item?.title ?? id;

  const block = (
    <section className={['locked-content', `locked-content--${layout}`, className].filter(Boolean).join(' ')} role={layout === 'full_screen' ? 'alertdialog' : 'region'} aria-label={title}>
      <div className="locked-content__title">{title}</div>
      <pre className="locked-content__body">{body}</pre>
      {(item?.placeholder || fellBack) && (
        <div className="locked-content__meta">
          {item?.placeholder && <Placeholder />}
          {fellBack && <span> {content.text('locale.fallback_marker')}</span>}
        </div>
      )}
      {children}
      {layout === 'full_screen' && (
        <div className="locked-content__actions">
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => {
              setClosed(true);
              onClose?.();
            }}
          >
            I have read this
          </Button>
        </div>
      )}
    </section>
  );

  if (layout === 'full_screen') {
    if (closed) return null;
    return <div className="locked-overlay">{block}</div>;
  }
  return block;
}
