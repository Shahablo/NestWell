import type { ReactNode } from 'react';
import { useDemoNotes } from '../shell/demoNotes';

export interface DemoNoteProps {
  /** Short heading, e.g. "FR-17". */
  label?: string;
  children: ReactNode;
}

/** Founder-facing aside; rendered only when the admin has "show demo notes" on. */
export function DemoNote({ label = 'Demo note', children }: DemoNoteProps) {
  const on = useDemoNotes();
  if (!on) return null;
  return (
    <aside className="demo-note" role="note">
      <span className="demo-note__label">{label}</span>
      {children}
    </aside>
  );
}
