# Task: Switch tutor LLM adapter to Structured Outputs

## Goal
Replace prompt-based JSON ("ask the model to return JSON, then regex-scrape
the reply if it doesn't") with the OpenAI Responses API's native Structured
Outputs (`text.format` + JSON Schema, `strict: true`). This applies to the
tutor **and** video-qa, since both share the same adapter.

## File to change
`apps/api/src/modules/tutor/adapters/llm.adapter.ts`

Do not touch `video-qa` — it imports `LlmProvider`/`LLM_PROVIDER` from this
same file, so fixing it here fixes both.

## Function to change
`OpenAILlmProvider.generateAnswer()`

## Changes

1. **Request body** — remove the "Return JSON in this exact shape..."
   instructions from the system/user messages. Add a `text.format` field to
   the request body:

   ```ts
   text: {
     format: {
       type: 'json_schema',
       name: 'grounded_tutor_answer',
       strict: true,
       schema: {
         type: 'object',
         properties: {
           answer: { type: 'string' },
           citedChunkIds: {
             type: 'array',
             items: { type: 'string' },
           },
         },
         required: ['answer', 'citedChunkIds'],
         additionalProperties: false,
       },
     },
   },
   ```

   Keep `max_output_tokens: 700` as-is. System message should just describe
   the answering policy (Arabic, grounded-only, valid citedChunkIds) — no
   JSON-formatting instructions needed anymore, the schema enforces that.

2. **Refusal handling** — structured outputs can still return a `refusal`
   instead of the schema (safety-related declines bypass the schema). Add a
   check in `extractOutputText` (or right after calling it) for any
   `payload.output` item with `type: 'refusal'`, and if present, throw or
   return the `NO_ANSWER`-equivalent result instead of silently parsing an
   empty answer.

3. **`parseJson`** — keep the function, but it no longer needs the regex
   fallback as the primary path; the API now guarantees valid JSON matching
   the schema when there's no refusal. You can leave the regex fallback in
   place as a defensive last resort, or remove it — either is fine, just
   don't rely on it being reached in normal operation.

## Tests to update
`apps/api/src/modules/tutor/adapters/llm.adapter.spec.ts`

- Existing test still passes unmodified (it doesn't assert on request body
  shape).
- Add one new test asserting the request body sent to `fetch` includes
  `body` containing `"type":"json_schema"` and `"strict":true`, so a future
  edit can't silently regress back to prompt-only JSON.
- Optionally add a test for the refusal path (mock `payload.output` with a
  `refusal` item, assert the provider does not return a fabricated answer).

## Out of scope
- Do not touch `exam-generation` — it has no direct LLM call yet (enqueues a
  job for the not-yet-built worker), nothing to change there.
- Do not apply Outlines/logit-level constrained decoding — not applicable,
  this adapter calls OpenAI's hosted API and has no logit access. Structured
  Outputs (this change) is the correct technique for a hosted-API provider.