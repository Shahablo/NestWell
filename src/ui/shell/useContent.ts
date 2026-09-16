/**
 * Content access bound to the store's approved-content index and, when a patient id is
 * given, to that patient's locale (FR-63: Spanish falls back to English with a marker).
 */
import { useMemo } from 'react';
import { useApp } from './useApp';
import type { ContentItem } from '../../domain/config.schema';
import type { Id, Locale } from '../../domain/types';

export type ContentVars = Record<string, string | number | null | undefined>;

export interface ContentApi {
  /** Locale the hook is bound to (the patient's, or 'en'). */
  locale: Locale;
  text(id: string, vars?: ContentVars, locale?: Locale): string;
  fellBack(id: string, locale?: Locale): boolean;
  get(id: string, locale?: Locale): ContentItem | undefined;
  title(id: string, locale?: Locale): string;
  /** The FR-63 marker body, for rendering beside a fallen-back item. */
  fallbackMarker(): string;
  manifestHash: string;
}

export function useContent(patientId?: Id | null): ContentApi {
  const { content, state } = useApp();
  const locale: Locale = (patientId && state.patients[patientId]?.preferences.locale) || 'en';
  return useMemo<ContentApi>(
    () => ({
      locale,
      text: (id, vars, loc) => content.text(id, vars ?? {}, loc ?? locale),
      fellBack: (id, loc) => content.fellBack(id, loc ?? locale),
      get: (id, loc) => content.get(id, loc ?? locale),
      title: (id, loc) => content.get(id, loc ?? locale)?.title ?? id,
      fallbackMarker: () => content.text('locale.fallback_marker'),
      manifestHash: content.manifestHash,
    }),
    [content, locale],
  );
}
