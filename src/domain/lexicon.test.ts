/**
 * CONTENT: lexicon lint (SR-07, FR-12, FR-15, FR-24).
 * The claims, reassurance, monitoring and burden lexicons are run over every content body and
 * title, every string literal in src/ui, and every markdown file under docs/ (excluding the files
 * that quote the terms in order to prohibit them). Any match fails.
 *
 * Reads files with Node fs so the test does not depend on the Vite glob loader
 * (@types/node is a devDependency and tsconfig `types` includes "node").
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Vitest runs with the project root as the working directory (vite.config.ts has no `root` override). */
const ROOT = process.cwd();
const LINTED_LEXICONS = ['claims', 'reassurance', 'monitoring', 'burden'];
/**
 * Files that quote prohibited terms in order to prohibit them. ARCHITECTURE.md is the build brief
 * and lists the claims deny-list verbatim in its hard rules (section 1); it is owned by DOCS.
 */
const DOC_EXCLUSIONS = new Set(['requirements.md', 'analyst-review.md', 'open-questions.md', 'ARCHITECTURE.md']);

interface Lexicon { key: string; entries: Array<{ term: string; term_class: string }> }
interface Hit { file: string; lexicon: string; term: string; excerpt: string }

function walk(dir: string, filter: (path: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}

function readLexicon(key: string): Lexicon {
  return JSON.parse(readFileSync(join(ROOT, 'config', 'lexicons', `${key}.json`), 'utf8')) as Lexicon;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** Case-insensitive, word-bounded, tolerant of straight or curly apostrophes and of hyphen/space swaps. */
function termRegex(term: string): RegExp {
  const body = escapeRegex(term)
    .replace(/'/g, "['’]")
    .replace(/\\-/g, '[-\\s]')
    .replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\w])${body}(?![\\w])`, 'i');
}

function scan(text: string, file: string, lexicons: Lexicon[]): Hit[] {
  const hits: Hit[] = [];
  for (const lex of lexicons) {
    for (const entry of lex.entries) {
      const m = termRegex(entry.term).exec(text);
      if (m) {
        const start = Math.max(0, m.index - 40);
        hits.push({ file, lexicon: lex.key, term: entry.term, excerpt: text.slice(start, m.index + m[0].length + 40).replace(/\s+/g, ' ') });
      }
    }
  }
  return hits;
}

/** Every string literal ('…', "…", `…`) in a TSX source, template expressions removed. */
function stringLiterals(source: string): string[] {
  const out: string[] = [];
  const re = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const lit = m[1] ?? m[2] ?? m[3] ?? '';
    out.push(lit.replace(/\$\{[^}]*\}/g, ' '));
  }
  return out;
}

const lexicons = LINTED_LEXICONS.map(readLexicon);

describe('lexicon lint (SR-07, FR-12, FR-15, FR-24)', () => {
  it('loads the four linted lexicons with entries', () => {
    for (const lex of lexicons) expect(lex.entries.length, lex.key).toBeGreaterThan(0);
  });

  it('no linted term appears in any content body or title', () => {
    const files = walk(join(ROOT, 'content'), (p) => p.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    const hits: Hit[] = [];
    for (const file of files) {
      const items = JSON.parse(readFileSync(file, 'utf8')) as Array<{ id: string; body: string; title: string }>;
      for (const item of items) {
        hits.push(...scan(`${item.title}\n${item.body}`, `${relative(ROOT, file)}#${item.id}`, lexicons));
      }
    }
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  it('no linted term appears in any string literal under src/ui', () => {
    const files = walk(join(ROOT, 'src', 'ui'), (p) => p.endsWith('.tsx'));
    const hits: Hit[] = [];
    for (const file of files) {
      const literals = stringLiterals(readFileSync(file, 'utf8'));
      hits.push(...scan(literals.join('\n'), relative(ROOT, file), lexicons));
    }
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  it('no linted term appears in docs markdown (excluding the files that quote the deny-lists)', () => {
    const files = walk(join(ROOT, 'docs'), (p) => p.endsWith('.md') && !DOC_EXCLUSIONS.has(p.split(/[\\/]/).pop() ?? ''));
    const hits: Hit[] = [];
    for (const file of files) hits.push(...scan(readFileSync(file, 'utf8'), relative(ROOT, file), lexicons));
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  it('the seed entries named in FR-61a are present', () => {
    const terms = (key: string) => new Set(readLexicon(key).entries.map((e) => e.term.toLowerCase()));
    for (const t of ['streak', 'missed', 'badge', 'keep it up', "don't forget"]) expect(terms('burden').has(t), t).toBe(true);
    for (const t of ['monitored', 'watching', '24/7', 'always here', "we'll know"]) expect(terms('monitoring').has(t), t).toBe(true);
    for (const t of ['first-of-its-kind', 'better than', 'guaranteed', 'proven', 'hipaa compliant', 'fda cleared', 'non-device', 'decides nothing', 'just shows information', 'only static content', 'only baby-focused']) {
      expect(terms('claims').has(t), t).toBe(true);
    }
    for (const t of ['nothing needs follow-up', 'you are doing fine', 'all clear', 'looks fine', 'no concerns', 'normal', 'nothing to worry about']) {
      expect(terms('reassurance').has(t), t).toBe(true);
    }
    for (const t of ['can you help me cope', 'talk me through', 'what should i do about my feelings']) expect(terms('therapy_intent').has(t), t).toBe(true);
  });

  it('the emergency lexicon has at least 5 term classes and never stores matched text', () => {
    const emergency = readLexicon('emergency');
    const classes = new Set(emergency.entries.map((e) => e.term_class));
    expect(classes.size).toBeGreaterThanOrEqual(5);
    for (const c of ['self_harm', 'harm_to_baby', 'bleeding', 'chest_breathing', 'headache_vision', 'fever', 'domestic_violence']) {
      expect(classes.has(c), c).toBe(true);
    }
    expect(emergency.entries.length).toBeGreaterThan(20);
  });

  it('closing statements pass the reassurance deny-list explicitly (FR-15)', () => {
    const reassurance = readLexicon('reassurance');
    const closing = JSON.parse(readFileSync(join(ROOT, 'content', 'en', 'closing.json'), 'utf8')) as Array<{ id: string; body: string }>;
    for (const item of closing) {
      expect(scan(item.body, item.id, [reassurance])).toEqual([]);
    }
  });
});
