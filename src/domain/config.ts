/**
 * Loads and validates every file under /config and /content at startup (FR-61).
 * Files are discovered by glob so adding a check-in template, rule, lexicon or content
 * family is a matter of adding a JSON file — no code change.
 *
 * Layout (each JSON file validates against the named schema in config.schema.ts):
 *   config/practice.json          PracticeSchema
 *   config/queues.json            QueueDefSchema[]
 *   config/coverage.json          CoverageEntrySchema[]
 *   config/cadence.json           CadenceSchema
 *   config/freetext.json          FreeTextConfigSchema
 *   config/careplan.json          CarePlanConfigSchema
 *   config/ai-exemplars.json      AiExemplarsSchema
 *   config/checkins/<key>.json    CheckinTemplateSchema      (one template per file)
 *   config/instruments/<key>.json InstrumentSchema           (one instrument per file)
 *   config/rules/<key>.json       RuleSchema                 (one rule per file)
 *   config/lexicons/<key>.json    LexiconSchema              (one lexicon per file)
 *   content/<locale>/<family>.json ContentItemSchema[]       (any number of files)
 */
import { z } from 'zod';
import {
  AiExemplarsSchema, AppConfigSchema, CadenceSchema, CarePlanConfigSchema, CheckinTemplateSchema, ContentItemSchema,
  CoverageEntrySchema, FreeTextConfigSchema, InstrumentSchema, LexiconSchema, PracticeSchema, QueueDefSchema, RuleSchema,
  validateConfigInvariants, type AppConfig, type ContentItem,
} from './config.schema';
import { buildContentIndex, type ContentIndex } from './content';

const singles = import.meta.glob('/config/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const checkinFiles = import.meta.glob('/config/checkins/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const instrumentFiles = import.meta.glob('/config/instruments/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const ruleFiles = import.meta.glob('/config/rules/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const lexiconFiles = import.meta.glob('/config/lexicons/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const contentFiles = import.meta.glob('/content/*/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export interface LoadedConfig {
  config: AppConfig;
  content: ContentIndex;
  /** Readable validation problems. The app refuses to run unless this is empty. */
  problems: string[];
}

function parseFile<T>(schema: z.ZodType<T>, path: string, value: unknown, problems: string[]): T | null {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  for (const issue of result.error.issues) problems.push(`${path}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
  return null;
}

function single(name: string): unknown {
  const key = Object.keys(singles).find((k) => k.endsWith(`/config/${name}.json`));
  return key ? singles[key] : undefined;
}

let cached: LoadedConfig | null = null;

export function loadConfig(): LoadedConfig {
  if (cached) return cached;
  const problems: string[] = [];

  const practice = parseFile(PracticeSchema, 'config/practice.json', single('practice'), problems);
  const queues = parseFile(z.array(QueueDefSchema), 'config/queues.json', single('queues'), problems);
  const coverage = parseFile(z.array(CoverageEntrySchema), 'config/coverage.json', single('coverage'), problems);
  const cadence = parseFile(CadenceSchema, 'config/cadence.json', single('cadence'), problems);
  const freetext = parseFile(FreeTextConfigSchema, 'config/freetext.json', single('freetext'), problems);
  const careplan = parseFile(CarePlanConfigSchema, 'config/careplan.json', single('careplan'), problems);
  const aiExemplars = parseFile(AiExemplarsSchema, 'config/ai-exemplars.json', single('ai-exemplars'), problems);

  const checkins: Record<string, z.infer<typeof CheckinTemplateSchema>> = {};
  for (const [path, value] of Object.entries(checkinFiles)) {
    const t = parseFile(CheckinTemplateSchema, path, value, problems);
    if (t) checkins[t.key] = t;
  }
  const instruments: Record<string, z.infer<typeof InstrumentSchema>> = {};
  for (const [path, value] of Object.entries(instrumentFiles)) {
    const t = parseFile(InstrumentSchema, path, value, problems);
    if (t) instruments[t.key] = t;
  }
  const rules: z.infer<typeof RuleSchema>[] = [];
  for (const [path, value] of Object.entries(ruleFiles)) {
    const t = parseFile(RuleSchema, path, value, problems);
    if (t) rules.push(t);
  }
  rules.sort((a, b) => a.key.localeCompare(b.key));
  const lexicons: Record<string, z.infer<typeof LexiconSchema>> = {};
  for (const [path, value] of Object.entries(lexiconFiles)) {
    const t = parseFile(LexiconSchema, path, value, problems);
    if (t) lexicons[t.key] = t;
  }
  const contentItems: ContentItem[] = [];
  for (const [path, value] of Object.entries(contentFiles)) {
    const arr = parseFile(z.array(ContentItemSchema), path, value, problems);
    if (arr) contentItems.push(...arr);
  }
  const seen = new Set<string>();
  for (const item of contentItems) {
    const k = `${item.id}::${item.locale}`;
    if (seen.has(k)) problems.push(`content: duplicate id ${item.id} (${item.locale})`);
    seen.add(k);
  }
  const content = buildContentIndex(contentItems);

  if (practice && queues && coverage && cadence && freetext && careplan && aiExemplars) {
    const candidate = { practice, queues, coverage, cadence, checkins, instruments, rules, lexicons, freetext, careplan, ai_exemplars: aiExemplars };
    const parsed = parseFile(AppConfigSchema, 'config', candidate, problems);
    if (parsed) problems.push(...validateConfigInvariants(parsed, content.ids));
    cached = { config: (parsed ?? candidate) as AppConfig, content, problems };
    return cached;
  }
  cached = { config: null as unknown as AppConfig, content, problems };
  return cached;
}

/** Test helper: clear the memoized load. */
export function resetConfigCache(): void {
  cached = null;
}
