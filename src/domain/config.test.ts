/**
 * CONTENT: config and content load with zero problems and every id the code depends on
 * (ARCHITECTURE.md section 4) exists and is approved.
 */
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const REQUIRED_EN_IDS = [
  'emergency_instruction', 'urgent_symptom_list', 'after_hours_instruction', 'contact_card', 'help_resources', 'nobody_reached_yet',
  'acknowledgment.standard', 'acknowledgment.demo_participant', 'acknowledgment.critical_shared', 'acknowledgment.critical_not_shared',
  'acknowledgment.free_text_scan_on', 'acknowledgment.free_text_scan_off',
  'screen.framing.epds', 'screen.framing.phq9', 'screen.framing.loss', 'screen.disclosure.critical_shared', 'screen.disclosure.critical_not_shared',
  'closing.no_follow_up', 'closing.pending',
  'visit.prep.bring_baby_interpreter', 'transition.intro',
  'sensitive.dialog.intro', 'sensitive.control.loss', 'sensitive.control.nicu', 'sensitive.control.stop_baby', 'sensitive.control.hard_birth', 'sensitive.not_for_now',
  'pause.confirm', 'stop.confirm', 'stop.done',
  'notification.neutral',
  'ai.patient_label', 'ai.staff_label', 'ai.block_response',
  'queue.no_answer.urgent', 'queue.no_answer.needs_review', 'queue.no_answer.follow_through', 'queue.no_answer.unreached',
  'queue.no_answer.sensitive_review', 'queue.no_answer.summaries',
  'demo.handout',
];

/** FR-63a: the safety-critical class that must exist in Spanish before a Spanish-locale enrollment. */
const REQUIRED_ES_IDS = [
  'emergency_instruction', 'after_hours_instruction', 'contact_card', 'help_resources', 'nobody_reached_yet',
  'acknowledgment.standard', 'acknowledgment.demo_participant', 'acknowledgment.critical_shared', 'acknowledgment.critical_not_shared',
  'acknowledgment.free_text_scan_on', 'acknowledgment.free_text_scan_off',
  'closing.no_follow_up', 'closing.pending', 'pause.confirm', 'stop.confirm',
];

const CADENCE_KEYS = ['day03', 'day07', 'day14', 'day21', 'week06', 'week09', 'week12'];
const QUEUE_KEYS = ['urgent', 'needs_review', 'follow_through', 'unreached', 'sensitive_review', 'summaries'];
const LEXICON_KEYS = ['burden', 'monitoring', 'claims', 'reassurance', 'emergency', 'therapy_intent', 'medications'];

describe('config and content load (FR-61)', () => {
  const loaded = loadConfig();

  it('loads with zero problems', () => {
    expect(loaded.problems).toEqual([]);
    expect(loaded.config).toBeTruthy();
  });

  it('has every cadence point with a template of the same key, plus the sensitive sets', () => {
    expect(loaded.config.cadence.points.map((p) => p.key)).toEqual(CADENCE_KEYS);
    for (const p of loaded.config.cadence.points) {
      expect(p.template_key).toBe(p.key);
      expect(loaded.config.checkins[p.key]).toBeTruthy();
      expect(loaded.config.checkins[p.key].set).toBe('standard');
    }
    expect(loaded.config.checkins.loss_checkin?.set).toBe('loss');
    expect(loaded.config.checkins.nicu_checkin?.set).toBe('nicu');
    expect(loaded.config.checkins.trauma_checkin?.set).toBe('trauma');
  });

  it('has both instruments with a critical item and placeholder thresholds', () => {
    for (const key of ['epds', 'phq9']) {
      const inst = loaded.config.instruments[key];
      expect(inst, key).toBeTruthy();
      expect(inst.items.some((i) => i.critical)).toBe(true);
      expect(inst.placeholder).toBe(true);
      expect(inst.thresholds_confirmed_by).toBeNull();
    }
    expect(loaded.config.instruments.epds.items).toHaveLength(10);
    expect(loaded.config.instruments.phq9.items).toHaveLength(9);
    expect(loaded.config.instruments.epds.items[9].critical).toBe(true);
    expect(loaded.config.instruments.phq9.items[8].critical).toBe(true);
    expect(loaded.config.instruments.epds.attribution).toContain('Cox JL, Holden JM, Sagovsky R');
  });

  it('has all six queues with an employer and placeholder targets', () => {
    expect(loaded.config.queues.map((q) => q.key).sort()).toEqual([...QUEUE_KEYS].sort());
    for (const q of loaded.config.queues) {
      expect(q.employer).toBe('practice');
      expect(q.placeholder).toBe(true);
      expect(q.owner_user_id).toBeNull();
    }
    expect(loaded.config.queues.find((q) => q.key === 'unreached')?.open_clinical_ack_target_minutes).toBe(240);
  });

  it('has all seven lexicons with entries', () => {
    for (const key of LEXICON_KEYS) {
      expect(loaded.config.lexicons[key], key).toBeTruthy();
      expect(loaded.config.lexicons[key].entries.length).toBeGreaterThan(0);
    }
  });

  it('has the required staff users and the unsecured referral partner', () => {
    const users = Object.fromEntries(loaded.config.practice.staff_users.map((u) => [u.id, u]));
    expect(users['coord-1']?.role).toBe('coordinator');
    expect(users['ob-1']?.role).toBe('clinician');
    expect(users['ob-1']?.permissions).toEqual(expect.arrayContaining(['config_approver', 'content_approver']));
    expect(users['budget-1']?.role).toBe('budget_owner');
    expect(users['partner-1']?.role).toBe('referral_partner');
    const partner = loaded.config.practice.referral_partners.find((p) => p.id === 'bh-partner-1');
    expect(partner?.secured).toBe(false);
    expect(loaded.config.practice.state_review_memo_ref).toBeNull();
  });

  it('has the rules the core depends on', () => {
    const keys = loaded.config.rules.map((r) => r.key);
    for (const k of ['urgent_symptom', 'coping_worst', 'coping_mild_twice', 'callback_requested', 'critical_item', 'positive_screen', 'help_now', 'barrier_item', 'free_text_present']) {
      expect(keys, k).toContain(k);
    }
    for (const r of loaded.config.rules) {
      expect(r.approved_by).toBeNull();
      expect(r.placeholder).toBe(true);
    }
  });

  it('keeps AI off and the free-text scan off until the clinical owner sets it (FR-17)', () => {
    expect(loaded.config.freetext.ai_enabled).toBe(false);
    expect(loaded.config.freetext.free_text_urgency_scan).toBe(false);
    expect(loaded.config.freetext.free_text_urgency_scan_set_by).toBeNull();
  });

  it('has every English id from ARCHITECTURE.md section 4, approved', () => {
    for (const id of REQUIRED_EN_IDS) {
      const item = loaded.content.get(id, 'en');
      expect(item, id).toBeTruthy();
      expect(item?.locale, id).toBe('en');
      expect(item?.status, id).toBe('approved');
      expect(item?.claims_checked_by, id).toBeTruthy();
    }
  });

  it('has the Spanish safety-critical class, approved by the placeholder translator', () => {
    for (const id of REQUIRED_ES_IDS) {
      expect(loaded.content.fellBack(id, 'es'), id).toBe(false);
      const item = loaded.content.get(id, 'es');
      expect(item?.locale, id).toBe('es');
      expect(item?.status, id).toBe('approved');
      expect(item?.approver, id).toBe('placeholder-translator');
      expect(item?.placeholder, id).toBe(true);
    }
  });

  it('locks the emergency instruction in both layouts and never uses a placeholder for it (FR-22, FR-04)', () => {
    for (const locale of ['en', 'es'] as const) {
      const item = loaded.content.get('emergency_instruction', locale);
      expect(item?.locked).toBe(true);
      expect(item?.safety_critical).toBe(true);
      expect(item?.layouts).toEqual(expect.arrayContaining(['full_screen', 'inline']));
      expect(item?.body).toContain('911');
      expect(item?.body).toContain('988');
      expect(item?.body).toContain('1-800-799-7233');
      expect(item?.body).toContain('{{after_hours_phone}}');
    }
    expect(loaded.content.get('emergency_instruction', 'en')?.placeholder).toBe(false);
  });

  it('closing statements carry the required variables and the call-by and 911 sentences (FR-15)', () => {
    const noFollowUp = loaded.content.get('closing.no_follow_up', 'en')!.body;
    for (const v of ['{{next_visit_date}}', '{{contact_name}}', '{{contact_phone}}']) expect(noFollowUp).toContain(v);
    const pending = loaded.content.get('closing.pending', 'en')!.body;
    for (const v of ['{{pending_what}}', '{{target_time}}', '{{phone}}']) expect(pending).toContain(v);
    expect(pending).toContain('If you have not heard from us by then, call {{phone}}.');
    expect(pending).toContain('If this is an emergency, call 911 now.');
  });

  it('every check-in prompt and title is approved and tone-reviewed, and every item is tagged (FR-09, FR-55, FR-58)', () => {
    for (const t of Object.values(loaded.config.checkins)) {
      expect(t.items.length).toBeLessThanOrEqual(loaded.config.cadence.max_items_per_checkin);
      expect(t.placeholder).toBe(true);
      for (const id of [t.title_content_id, ...t.items.map((i) => i.prompt_content_id)]) {
        const item = loaded.content.get(id, 'en');
        expect(item?.status, id).toBe('approved');
        expect(item?.tone_review_by, id).toBeTruthy();
      }
      for (const item of t.items) {
        expect(item.tags.length, `${t.key}.${item.key}`).toBeGreaterThan(0);
        expect(item.skippable).toBe(true);
      }
    }
    // Standard set: urgent-symptom item, coping item, barrier item, callback item, one optional free text.
    for (const key of CADENCE_KEYS) {
      const t = loaded.config.checkins[key];
      const tags = new Set(t.items.flatMap((i) => i.options.flatMap((o) => o.rule_tags)));
      for (const tag of ['urgent_candidate', 'coping_difficulty', 'coping_difficulty_mild', 'barrier_transport', 'barrier_childcare', 'barrier_phone_data', 'barrier_interpreter', 'barrier_cost', 'callback_requested']) {
        expect(tags.has(tag as never), `${key} ${tag}`).toBe(true);
      }
      expect(t.items.filter((i) => i.response_type === 'free_text_optional')).toHaveLength(1);
    }
    expect(loaded.config.checkins.day14.instrument_key).toBe('epds');
    expect(loaded.config.checkins.week06.instrument_key).toBe('epds');
    expect(loaded.config.checkins.week06.visit_preparation).toBe(true);
    expect(loaded.config.checkins.week06.usefulness_item).toBe(true);
    expect(loaded.config.checkins.week12.usefulness_item).toBe(true);
    // Loss set never carries an infant-related tag.
    for (const item of loaded.config.checkins.loss_checkin.items) {
      expect(item.tags).not.toEqual(expect.arrayContaining(['infant']));
      expect(item.tags).not.toEqual(expect.arrayContaining(['feeding']));
    }
  });

  it('care plan titles and bodies exist with reword exemplars (FR-18, AI-21)', () => {
    for (const item of loaded.config.careplan.items) {
      expect(loaded.content.get(item.title_content_id, 'en')?.status, item.key).toBe('approved');
      expect(loaded.config.ai_exemplars.reword[item.title_content_id], item.key).toBeTruthy();
      if (item.body_content_id) {
        expect(loaded.content.get(item.body_content_id, 'en')?.status, item.key).toBe('approved');
        expect(loaded.config.ai_exemplars.reword[item.body_content_id], item.key).toBeTruthy();
      }
    }
    for (const persona of ['dana', 'priya', 'marisol', 'elena', 'keisha', 'lucia', 'tamsin']) {
      for (const period of ['week9', 'week12', 'on_demand']) {
        expect(loaded.config.ai_exemplars.summary_narrative[`${persona}:${period}`], `${persona}:${period}`).toBeTruthy();
      }
    }
    expect(loaded.config.ai_exemplars.question_organizer.tamsin?.length).toBeGreaterThan(0);
    expect(loaded.config.ai_exemplars.staff_label).toBe('AI draft, not reviewed');
  });

  it('acknowledgment items carry the counsel-review marker (FR-05)', () => {
    for (const id of ['acknowledgment.standard', 'acknowledgment.critical_shared', 'acknowledgment.critical_not_shared', 'acknowledgment.free_text_scan_on', 'acknowledgment.free_text_scan_off']) {
      expect(loaded.content.get(id, 'en')?.counsel_review_pending, id).toBe(true);
    }
  });
});
