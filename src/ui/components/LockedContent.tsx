/**
 * FR-22: locked safety-critical content rendered byte for byte by non-AI code. This component
 * reads the approved content item straight from the content index and prints its body in a
 * <pre>-like block so nothing reflows or rewrites it. It never imports anything from the AI
 * layer. The full-screen layout is a prominent block placed before any other content on the
 * page; nothing forces an acknowledgment to leave it (scenario 6.3), the persistent "I need help
 * now" button and everything below stay reachable, and the real emergency numbers in the text
 * (911, 988, the DV hotline) are tappable tel: links because this is the moment she may need to
 * dial. The optional "Continue" button only collapses the block and gates nothing.
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
  /** Called after the reader collapses the full-screen layout. */
  onClose?: () => void;
  /** Extra controls rendered under the body (e.g. the callback button on the help screen). */
  children?: ReactNode;
  className?: string;
}

/** Only the real emergency and crisis numbers become dialable links (SR-02: practice numbers are non-dialable placeholders). */
const DIALABLE = /(1-800-799-7233|(?<![\d-])9(?:11|88)(?![\d-]))/g;

/** The body text with the real emergency numbers wrapped as tel: links; the text itself is unchanged. */
export function dialableBody(body: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of body.matchAll(DIALABLE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(body.slice(last, at));
    const digits = m[0].replace(/[^\d]/g, '');
    out.push(<a key={`tel-${i++}`} className="phone-number__value phone-number__link" href={`tel:${digits}`}>{m[0]}</a>);
    last = at + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

export function LockedContent({ id, layout, vars = {}, locale = 'en', onClose, children, className = '' }: LockedContentProps) {
  const { content } = useApp();
  const [closed, setClosed] = useState(false);
  const item = content.get(id, locale);
  const body = content.text(id, vars, locale);
  const fellBack = content.fellBack(id, locale);
  const title = item?.title ?? id;
  const full = layout === 'full_screen';

  if (full && closed) return null;

  return (
    <section className={['locked-content', `locked-content--${layout}`, className].filter(Boolean).join(' ')} role={full ? 'alert' : 'region'} aria-label={title}>
      <div className="locked-content__title">{title}</div>
      <pre className="locked-content__body">{dialableBody(body)}</pre>
      {(item?.placeholder || fellBack) && (
        <div className="locked-content__meta">
          {item?.placeholder && <Placeholder />}
          {fellBack && <span> {content.text('locale.fallback_marker')}</span>}
        </div>
      )}
      {children}
      {full && (
        <div className="locked-content__actions">
          <Button
            variant="secondary"
            size="lg"
            block
            onClick={() => {
              setClosed(true);
              onClose?.();
            }}
          >
            Continue
          </Button>
        </div>
      )}
    </section>
  );
}
