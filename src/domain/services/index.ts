/**
 * Services barrel (ARCHITECTURE 3.2). Every command is `(input) => Command`. Where two modules use
 * the same short name (enrollment.acknowledge vs queues.acknowledge) the barrel exports an
 * unambiguous alias and the module namespace, so `queues.acknowledge(...)` also works.
 */
export { DomainError, assertDomain } from './errors';

export * as enrollment from './enrollment';
export * as checkins from './checkins';
export * as freetext from './freetext';
export * as rules from './rules';
export * as queues from './queues';
export * as screening from './screening';
export * as followthrough from './followthrough';
export * as sensitive from './sensitive';
export * as summaries from './summaries';
export * as careplan from './careplan';
export * as ai from './ai';
export * as notifications from './notifications';
export * as admin from './admin';

// enrollment.ts
export {
  registerPatient, recordEligibility, enroll, recordDelivery, acknowledge as acknowledgeEnrollment, setPreference, pauseCheckins, resumeCheckins,
  stopProgram, closeEpisode, closeEarly, safetyClassStatus, scheduleCheckinEvents, SAFETY_CRITICAL_CONTENT_IDS, isLossOutcome,
} from './enrollment';
// checkins.ts
export { openCheckin, submitCheckin, skipItem, skipCheckin, notNow, rateUsefulness, tagsForResponses, closingStatementFor, burdenCapAllows } from './checkins';
export type { SubmitResponse, ClosingStatement } from './checkins';
// freetext.ts
export { routeFreeText, routeFreeTextEvents, matchLexicon, assertScanConsistency, addSavedQuestion } from './freetext';
export type { FreeTextInput, FreeTextResult } from './freetext';
// rules.ts
export { evaluateRules, conditionHolds, ruleMatches, actionKey, triggerTypeForRule } from './rules';
export type { Facts, RuleInput, RuleOutcome } from './rules';
// queues.ts
export {
  createQueueItem, acknowledge as acknowledgeQueueItem, resolve as resolveQueueItem, reopen as reopenQueueItem, rate as rateEscalation,
  logOutreach, requestCallback, completeCallback, helpNow,
} from './queues';
// screening.ts
export {
  administerScreen, skipScreen, declineScreen, readScreen, recordAssessment, score, sharedWithFor, visibleScreenFor, screensFor, latestPositiveScreen,
  CRITICAL_WITHHELD_NOTE, SHARING_WITHHELD_NOTICE,
} from './screening';
export type { VisibleScreen, ScoreResult, AdministerInput } from './screening';
// followthrough.ts
export { createReferral, setReferralState, logContact, scheduleVisit, setVisitState, completeCarePlanItem, DEAD_END_STATES } from './followthrough';
// sensitive.ts
export { setSensitiveStatus, confirmSensitiveStatus, liftSensitiveStatus, setSensitivePreferences, patientControlSubtype } from './sensitive';
export type { PatientControl, SetStatusInput, SensitivePreferencesInput } from './sensitive';
// summaries.ts
export { draftSummary, setSummaryState, buildStructured } from './summaries';
// careplan.ts
export { carePlanItemsFor, visitsFor, explanationFor } from './careplan';
export type { Explanation, CarePlanSeed } from './careplan';
// ai.ts
export {
  reword, rewordResult, narrative, narrativeResult, organizeQuestions, organizeQuestionsResult, narrativeViolations, assertNarrativeClean,
  narrativeAllowlist, normalizeNarrative, patientLabel, staffLabel, NARRATIVE_DENY_WORDS, AI_PATIENT_LABEL_ID, AI_STAFF_LABEL_ID, AI_BLOCK_RESPONSE_ID,
} from './ai';
export type { RewordResult, NarrativeResult, OrganizeResult } from './ai';
// notifications.ts
export { checkinNotification, reminderNotification, carePlanNotification, outboxIsNeutral, NEUTRAL_CONTENT_ID } from './notifications';
// admin.ts
export { recordIncident, resolveIncident, recordPracticeSetupMinutes, reportFalseReassurance, recordMissedEscalation } from './admin';
// shared.ts
export { newQueueItem, contactEvents, staffUserId, dayNumberFor, requireEpisode, requirePatient } from './shared';
