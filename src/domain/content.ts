/**
 * Approved content index (FR-60). Only approved items are served; a draft renders as a
 * watermark string so the omission is visible rather than silent. Locked safety-critical
 * items (FR-22) are rendered byte-for-byte; nothing in the AI layer may touch them.
 */
import type { ContentItem } from './config.schema';
import type { Locale } from './types';

export interface ContentIndex {
  items: ContentItem[];
  byId: Map<string, ContentItem>;
  ids: Set<string>;
  get(id: string, locale?: Locale): ContentItem | undefined;
  /** Rendered body with {{variables}} replaced. Drafts and missing items return a visible marker. */
  text(id: string, vars?: Record<string, string | number | null | undefined>, locale?: Locale): string;
  /** Locale fallback marker (FR-63): true when a Spanish item was requested but English was served. */
  fellBack(id: string, locale: Locale): boolean;
  manifestHash: string;
}

export const DRAFT_MARK = '⚠ UNAPPROVED CONTENT';
export const MISSING_MARK = '⚠ MISSING CONTENT';

export function interpolate(body: string, vars: Record<string, string | number | null | undefined> = {}): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === null || v === undefined ? `[${key}]` : String(v);
  });
}

/** Cheap, deterministic hash for the content manifest (NFR-05). Not cryptographic. */
export function stableHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function buildContentIndex(items: ContentItem[]): ContentIndex {
  const byId = new Map<string, ContentItem>();
  for (const item of items) byId.set(`${item.id}::${item.locale}`, item);
  const ids = new Set(items.filter((i) => i.locale === 'en').map((i) => i.id));
  const get = (id: string, locale: Locale = 'en') => byId.get(`${id}::${locale}`) ?? byId.get(`${id}::en`);
  const manifest = items.map((i) => `${i.id}:${i.locale}:${i.version}:${i.status}`).sort().join('|');
  return {
    items,
    byId,
    ids,
    get,
    text(id, vars = {}, locale = 'en') {
      const item = get(id, locale);
      if (!item) return `${MISSING_MARK} (${id})`;
      if (item.status !== 'approved') return `${DRAFT_MARK} (${id}): ${interpolate(item.body, vars)}`;
      return interpolate(item.body, vars);
    },
    fellBack(id, locale) {
      return locale !== 'en' && !byId.has(`${id}::${locale}`) && byId.has(`${id}::en`);
    },
    manifestHash: stableHash(manifest),
  };
}
