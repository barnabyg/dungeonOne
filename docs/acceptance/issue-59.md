# Issue 59: generation reliability evaluation

## Frozen protocol

`scripts/generation-premises.json` fixes ten public premises, one independent initial generation per premise in each numbered batch, their categories, schema 3, rules `chapel-clues-rules-v4`, and the current protocol's model (`gpt-5.6-terra` in protocol 8). The set covers investigation, rescue, negotiation, combat, vague input, an adversarial instruction, and unsupported mechanics. The generation instructions and request shape are in `src/generation.ts`; the complete structural example is `adventures/generation-example.json`. The runner records SHA-256 hashes of that source, example, schema, plan, and every exact request prompt, plus the exact request instructions for each attempt. Repair prompts contain only bounded candidate reference context and diagnostic codes; rejected candidate prose is not stored. The engine version is recorded with each batch.

Run `npm.cmd run build`, then `node scripts/eval-generation.mjs --batch 1` with `OPENAI_API_KEY` set. Use `--dry-run` first to inspect the ten premises without calling the provider. Run batches 2 and 3 separately after inspecting each result. Three batches with an unchanged protocol can form the 30-run qualification set. Each run starts a fresh generation request and has at most two repairs. Provider and validation failures count in the denominator. A file qualifies only when both ending routes are witnessed, the failed-social physical fallback is witnessed, both endings complete in command mode, and format-4 traces replay after the source file is removed. The production generator's route checker also requires evidence for every static progression warning. A command/replay failure counts against yield.

Each new ignored `.generation-evaluations/protocol-<version>/batch-<number>/report.json` records per-attempt status, diagnostic codes, candidate and prompt hashes, elapsed time, reported input/output tokens, and each accepted route's seed, tool actions, and random draws. It records per-run replay status, category, and an uncached-input cost estimate at the published rate for its recorded model. Missing provider usage is zero in the arithmetic and must be treated as unknown cost. The report is capped at 4 MiB; generated files and traces are removed after qualification. No API key, raw provider error, SDK response, or rejected draft is written to the report. An interrupted run resumes from the last recorded result when the frozen protocol hashes match.

The pass target is at least 24 playable results out of 30. Report first-pass, first-repair, and second-repair yield, category-level yield, failure codes, elapsed time, tokens, and estimated cost. Any category with repeated failures needs its own diagnosis even if the total meets 24. The 80% threshold is a provisional product gate, not a population-wide reliability claim.

## Baseline 30-run protocol: 28 September 2026

The user approved the external API run. The ignored `.generation-evaluations/report.json` contains all 30 independent initial generations and their repair histories under protocol 1. The ten-at-a-time protocol 2 preserves that report separately. It records hashes for the exact source, example, schema, plan, and prompts used in this batch. The report is 473,021 bytes. The product gate **failed: 0/30 playable**, against the required 24/30. First-pass yield was 0, first-repair yield was 0, and second-repair yield was 0. No candidate reached route or source-free replay qualification, so there are no live route seeds or actions to report.

| Category | Playable / total | Final failure reasons |
| --- | ---: | --- |
| Investigation | 0/6 | 6 provider requests |
| Rescue | 0/6 | 5 provider requests; 1 incomplete or refused response |
| Negotiation | 0/6 | 3 provider requests; 2 invalid IDs or aliases; 1 incomplete or refused response |
| Combat | 0/3 | 2 provider requests; 1 ambiguous alias |
| Vague | 0/3 | 2 provider requests; 1 unknown reference |
| Adversarial | 0/3 | 3 provider requests |
| Unsupported mechanics | 0/3 | 3 provider requests |

Across 58 provider attempts, the first attempt returned a rejected document in 20 runs, failed at the provider boundary in 8, and was incomplete or refused in 2. Later attempts added 16 provider failures and 12 rejected documents. All 24 provider failures ended at the configured 60-second timeout; the report does not establish whether the underlying provider would have completed later. Rejected documents most often had invalid IDs (95 diagnostic entries), overlong strings (55), and unknown references (38); counts include multiple diagnostics per attempt. The batch took 3,181,942 ms (about 53 minutes). Reported usage totaled 119,742 input and 164,336 output tokens. Applying the published rates to usage returned by the provider gives a nominal $0.358609; actual billed cost is unknown because timed-out requests returned no usage and caching may change input charges.

The optional AI critic was not run: no candidate passed the deterministic checks, and a critic cannot promote a failing one. The observed failure modes point first to response latency and schema-constrained authoring/repair. The report preserves prompt text, candidate hashes, diagnostic codes, and paths in repair prompts, but not rejected candidate bodies; exact replay of those deterministic validation failures is therefore unavailable from this batch. The present result does not establish story quality, seeded combat reliability, source-free replay success for live generated files, or reliability on unseen premises. Blind player review and live DM qualification remain outstanding because this batch produced no playable file.

## Protocol 2, batch 1: constrained IDs

The first ten-at-a-time batch kept the baseline model, prompt, example, 60-second timeout, and repair limit. The generation response schema added the loader's ID and alias grammar. The ignored `protocol-2/batch-1/report.json` records **0/10 playable**, with first-pass, first-repair, and second-repair yield all zero. Eight runs ended in provider timeouts, one in a string-limit rejection, and one in an incomplete or refused response. The recorded total was **1,295,298 ms** (about 21 minutes 35 seconds). Reported usage was 53,545 input and 79,316 output tokens, with a nominal $0.172019 estimate. Actual billing remains unknown for timed-out calls.

Returned candidates had no invalid-ID diagnostics, compared with 95 such diagnostic entries in protocol 1. Their main remaining diagnostics were 62 unknown references, 20 missing fallbacks, and 9 invalid sources. These are counts of entries, not independent runs. The narrower schema therefore addressed the targeted syntax failure but did not produce a qualified adventure. The next isolated experiment is a longer provider timeout; cross-reference and fallback authoring still need separate work.

## Protocol 3, batch 1: 120-second client timeout

This batch changed only the client timeout from 60 to 120 seconds. It produced **0/10 playable**: seven provider failures, one unknown-reference failure, one incomplete or refused response, and one file that passed generation and ending replay but lacked the failed-social fallback. All seven provider failures arrived after about 60 seconds (60,019–60,029 ms) despite the longer client limit; the evidence suggests an upstream limit, but the report does not identify the provider's internal cause. The batch took 1,099,076 ms (about 18 minutes 19 seconds), with 50,162 reported input and 69,399 output tokens and a nominal $0.151340 estimate. The accepted file's missing fallback exposed a structural contract gap: the strict generation schema did not permit `socialChallenges`, and its example had no social challenge. Protocol 4 adds that supported shape and a route-backed example; it retains the 120-second local limit for observation while normalizing provider status codes without storing raw errors.

## Protocol 4, batch 1: social-capable document shape

The strict response schema and structural example now include a supported social challenge, four reply outcomes, and an independent search route after a failed check. The example passed the real route and continuity checks locally. The live batch produced **0/10 playable** because every initial provider request failed after about 60 seconds (60,057–60,095 ms), despite a configured 120-second client limit. No response returned token usage, so the nominal report estimate is $0 and actual billed usage is unknown. The batch took 600,694 ms (about 10 minutes). This experiment cannot measure the social-schema change's effect on candidate quality; a different provider/model configuration or smaller output contract is needed before spending further calls on the same request shape.

## Protocol 5: background polling

The generation request now uses the [Responses background mode](https://developers.openai.com/api/docs/guides/background) with `store=false` and polls queued or in-progress responses, so a single foreground connection need not survive the entire generation. Individual HTTP calls retain a 120-second client limit, and each generation attempt has a five-minute polling limit. Background mode temporarily stores response data for polling even with `store=false`; the evaluation report still excludes raw responses. The model, premises, schema, prompt, and output token allowance are otherwise the same as protocol 4. The ignored `protocol-5/batch-1/report.json` records **2/10 playable**, both on the first attempt. Seven runs were incomplete or refused, six at exactly the 6,000-token output limit; one run failed the approved-knowledge check after two repairs. The batch used 57,426 reported input and 78,993 output tokens, a nominal $0.172342 estimate, and 844,970 ms (about 14 minutes 5 seconds). Background polling resolved the uniform provider failure, but the six cap-limited responses justified testing a larger output allowance.

## Protocol 6: output allowance

The only generation change from protocol 5 is an increase in `max_output_tokens` from 6,000 to 10,000. The candidate's 16 KiB byte limit, validation, and repair bound remain fixed. The ignored `protocol-6/batch-1/report.json` records **1/10 playable**, on the first attempt. There were five unapproved-knowledge failures, two unknown-reference failures, one invalid placement, and one HTTP 503 during repair. No run failed from truncation. The batch used 98,725 reported input and 139,113 output tokens, a nominal $0.302906 estimate, and 1,586,535 ms (about 26 minutes 27 seconds). The output cap was no longer the dominant failure; the original model repeatedly failed cross-field consistency even when repairs named the failing paths.

## Protocol 7: model capability

The frozen premise set, request, validation, and 10,000-token allowance stay the same. The model changes to `gpt-5.6-terra`; the report uses the [published uncached rates](https://developers.openai.com/api/docs/models/gpt-5.6-terra) of $2 per million input and $12 per million output tokens. The ignored `protocol-7/batch-1/report.json` records **6/10 playable**, with zero first-pass successes, five first-repair successes, and one second-repair success. Three runs ended with invalid-source and one with unknown-reference. It used 98,279 reported input and 77,383 output tokens, a nominal $1.125154 estimate, and 1,149,874 ms (about 19 minutes 10 seconds). Every initial document required repair, usually because NPC `believes` entries referenced nonexistent facts. The three invalid-source failures arose where dialogue granted a discovery despite the generation schema permitting only feature-sourced discoveries.

## Protocol 8: supported subset constraints

The strict output schema now requires empty NPC `believes`, NPC reply `effects`, and encounter `effects` arrays. Those fields are outside this generation subset: unsupported beliefs had produced nonexistent fact references, dialogue discovery effects could not satisfy the schema's feature-only source, and encounter discovery effects are invalid in the loader. The prompt states the same cross-reference rules. The model and other limits remain those of protocol 7. The ignored reports are `protocol-8/batch-1/report.json` through `batch-3/report.json`.

### Qualification result: three unchanged ten-run batches

Protocol 8 passed the provisional gate: **28/30 playable (93.3%)**, against the 24/30 target. Batch yields were **10/10**, **9/10**, and **9/10**. First-pass yield was **26/30**, first-repair added **2/30**, and second-repair added **0/30**. Both failures count in the denominator: one provider HTTP 500 and one unknown reference after two repairs. All 28 qualified files had two ending witnesses, a failed-social physical fallback, successful command-mode endings, and source-independent format-4 replay. Route seeds, actions, random draws, and per-attempt prompt hashes and diagnostic codes are in the three ignored reports; candidate and trace files were removed.

| Category | Playable / total |
| --- | ---: |
| Investigation | 6/6 |
| Rescue | 5/6 |
| Negotiation | 5/6 |
| Combat | 3/3 |
| Vague | 3/3 |
| Adversarial | 3/3 |
| Unsupported mechanics | 3/3 |

The three reports share identical generation-source, example, schema, generation-schema, premise-plan, engine-version, model, and limit fields. Combined reported usage was **142,628 input** and **88,801 output tokens**; at the model's uncached rates, the nominal estimate is **$1.350868**. Combined elapsed time was **1,386,440 ms** (about 23 minutes 6 seconds). Report sizes were 167,829, 159,990, and 181,883 bytes, each below the 4 MiB cap. The report SHA-256 values for batches 1–3 are `33c6c6b4d5bb7208899c8c6d96a4925c040271e2ef86006c5f9f295eeed9105e`, `2fb0162bd748ef24b29110d86fa122247fceaeaa6e211db82663047d225eb1c3`, and `87119c3fbaabfe1fc9254adeb65af619f8d02a4b910d4bb3d342fdb7384021c6`.

After the live batches, a callback was wrapped in braces to satisfy the repository's static analyzer. That formatting-only source change does not alter the polling request or generation behavior; it does make the final file hash differ from the frozen live source hash. The exact prompts and live source hash remain recorded in each report.

The rescue and negotiation categories each had one failure, so neither shows repeated failure in this sample. The 80% gate is a provisional product threshold on these ten repeated premises; it does not establish quality or reliability on unseen premises. Blind player review, live DM quality assessment, and exact replay of rejected candidate bodies remain outside this evidence set.
