import type { ReactNode } from 'react';

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
}

export interface KeyValueProps {
  /** The label/value pairs. `rows` is an accepted alias. */
  items?: KeyValueItem[];
  rows?: KeyValueItem[];
  className?: string;
}

/** A label/value grid. Values that are null or empty render as an em dash, never blank. */
export function KeyValue({ items, rows, className = '' }: KeyValueProps) {
  const list = items ?? rows ?? [];
  return (
    <dl className={`key-value ${className}`.trim()}>
      {list.map((item, i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{item.label}</dt>
          <dd>{item.value === null || item.value === undefined || item.value === '' ? '—' : item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
