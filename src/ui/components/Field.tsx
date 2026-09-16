import { useId, type ReactNode } from 'react';

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Explicit control id; otherwise one is generated and passed to `children`. `htmlFor` is an alias. */
  id?: string;
  htmlFor?: string;
  /** Puts the label beside the control (checkbox, toggle). */
  inline?: boolean;
  className?: string;
  /** Either a node or a render function receiving the control id. */
  children: ReactNode | ((id: string) => ReactNode);
}

export function Field({ label, hint, error, id, htmlFor, inline = false, className = '', children }: FieldProps) {
  const generated = useId();
  const controlId = id ?? htmlFor ?? generated;
  const control = typeof children === 'function' ? children(controlId) : children;
  return (
    <div className={['field', inline ? 'field--inline' : '', className].filter(Boolean).join(' ')}>
      {inline ? (
        <>
          {control}
          <label className="field__label" htmlFor={controlId}>
            {label}
          </label>
        </>
      ) : (
        <>
          <label className="field__label" htmlFor={controlId}>
            {label}
          </label>
          {hint && <div className="field__hint">{hint}</div>}
          {control}
        </>
      )}
      {inline && hint && <div className="field__hint">{hint}</div>}
      {error && (
        <div className="field__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
