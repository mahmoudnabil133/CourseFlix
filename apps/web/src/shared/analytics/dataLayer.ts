/**
 * GTM dataLayer foundation (sprint3-plan.md S-3/S-4). Every event is
 * versioned and privacy-checked before it reaches `window.dataLayer` —
 * GTM/GA4 config is authoritative for *how* an event is used, but this
 * file is the one place that decides *what's allowed to leave the app*.
 */

export const ANALYTICS_SCHEMA_VERSION = 1

// The event dictionary — every event name the app is allowed to push.
// Adding a new event means adding it here first.
export type AnalyticsEventName =
  | 'checkout_start'
  | 'checkout_redirect'
  | 'purchase'
  | 'checkout_error'
  | 'intervention_created'
  | 'lesson_progress'
  | 'quiz_submitted'
  | 'tutor_message_sent'

export type AnalyticsEventPayload = Record<
  string,
  string | number | boolean | null
>

export interface AnalyticsEvent extends AnalyticsEventPayload {
  event: AnalyticsEventName
  schemaVersion: number
}

declare global {
  interface Window {
    dataLayer: unknown[]
  }
}

// Field names that must never appear in an event payload, however the
// event is later extended. Keys only — matching every casing/spelling
// variant callers might reasonably use.
const DENYLISTED_KEYS = new Set([
  'email',
  'fullname',
  'full_name',
  'name',
  'password',
  'chattext',
  'chat_text',
  'message',
  'messagetext',
  'message_text',
  'answertext',
  'answer_text',
  'questiontext',
  'question_text',
  'documenttext',
  'document_text',
  'cardnumber',
  'card_number',
  'cvv',
  'cardexpiry',
  'card_expiry',
])

// Value-shape safety net, in case a raw string slips through under a
// key that isn't itself denylisted (e.g. a free-text field pasted with
// an email or card number in it).
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/
const CARD_NUMBER_PATTERN = /\b\d{12,19}\b/

function isDeniedValue(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return EMAIL_PATTERN.test(value) || CARD_NUMBER_PATTERN.test(value)
}

function assertSafePayload(payload: AnalyticsEventPayload): void {
  for (const [key, value] of Object.entries(payload)) {
    if (DENYLISTED_KEYS.has(key.toLowerCase())) {
      throw new Error(
        `pushDataLayerEvent: field "${key}" is not allowed in analytics events (PII/denylist).`,
      )
    }
    if (isDeniedValue(value)) {
      throw new Error(
        `pushDataLayerEvent: value of field "${key}" looks like PII or payment data and was blocked.`,
      )
    }
  }
}

/**
 * Push a versioned, privacy-checked event to `window.dataLayer`. Throws
 * (rather than silently dropping) on a denylisted payload — a caller
 * building the wrong event shape should fail loudly in dev/tests, not
 * ship a prohibited field to production quietly.
 */
export function pushDataLayerEvent(
  event: AnalyticsEventName,
  payload: AnalyticsEventPayload = {},
): void {
  assertSafePayload(payload)

  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer ?? []

  // Ecommerce reset rule: clear any previous `ecommerce` object before
  // pushing a new ecommerce event so fields never leak between pushes —
  // standard GTM/GA4 ecommerce guidance.
  if (event === 'purchase') {
    window.dataLayer.push({ ecommerce: null })
  }

  const analyticsEvent: AnalyticsEvent = {
    event,
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    ...payload,
  }
  window.dataLayer.push(analyticsEvent)
}
