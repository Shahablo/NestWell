import { Placeholder } from './Placeholder';

export interface PhoneNumberProps {
  number: string;
  /** SR-02: practice numbers are non-dialable 555 numbers labelled as placeholders. */
  placeholder?: boolean;
  /** Optional caption before the number, e.g. "After hours". */
  label?: string;
  className?: string;
}

/** Only the real emergency and crisis numbers are rendered as dialable links. */
const REAL_NUMBERS = new Set(['911', '988', '1-800-799-7233']);

function isRealNumber(n: string): boolean {
  return REAL_NUMBERS.has(n.replace(/\s+/g, ''));
}

export function PhoneNumber({ number, placeholder, label, className = '' }: PhoneNumberProps) {
  const isPlaceholder = placeholder ?? !isRealNumber(number);
  return (
    <span className={`phone-number ${className}`.trim()}>
      {label && <span className="muted">{label}</span>}
      {!isPlaceholder && isRealNumber(number) ? (
        <a className="phone-number__value" href={`tel:${number.replace(/[^\d+]/g, '')}`}>
          {number}
        </a>
      ) : (
        <span className="phone-number__value">{number}</span>
      )}
      {isPlaceholder && <Placeholder label="placeholder number" title="Non-dialable practice number used in the demo (SR-02)." />}
    </span>
  );
}
