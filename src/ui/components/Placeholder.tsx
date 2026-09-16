/**
 * The "placeholder — not clinically set" label (ARCHITECTURE 5). Anything that a named owner
 * has not yet confirmed renders with this beside it, never blank.
 */
export const PLACEHOLDER_LABEL = 'placeholder — not clinically set';
export const NOT_YET_ASSIGNED = 'NOT YET ASSIGNED';
export const NOT_YET_SECURED = 'NOT YET SECURED';
export const NOT_YET_PROVIDED = 'NOT YET PROVIDED';

export interface PlaceholderProps {
  /** Override the label, e.g. NOT_YET_ASSIGNED. */
  label?: string;
  title?: string;
  className?: string;
}

export function Placeholder({ label = PLACEHOLDER_LABEL, title, className = '' }: PlaceholderProps) {
  return (
    <span className={`placeholder ${className}`.trim()} title={title ?? 'This value is a placeholder in the demo. A named owner must confirm it before any pilot.'}>
      {label}
    </span>
  );
}
