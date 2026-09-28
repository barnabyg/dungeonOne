# Issue 59: generation reliability evaluation

## Frozen protocol

`scripts/generation-premises.json` fixes ten public premises, three independent initial generations per premise, their categories, schema 3, rules `chapel-clues-rules-v4`, and model `gpt-5-mini-2025-08-07`. The set covers investigation, rescue, negotiation, combat, vague input, an adversarial instruction, and unsupported mechanics. The generation instructions and request shape are in `src/generation.ts`; the complete structural example is `adventures/generation-example.json`. The runner records SHA-256 hashes of that source, example, schema, plan, and every exact request prompt, plus the exact request instructions for each attempt. Repair prompts contain only bounded candidate reference context and diagnostic codes; rejected candidate prose is not stored. The engine version is recorded with each batch.

Run `npm.cmd run build`, then `node scripts/eval-generation.mjs` with `OPENAI_API_KEY` set. The runner requires the exact 30-run plan. Each run starts a fresh generation request and has at most two repairs. Provider and validation failures count in the denominator. A file qualifies only when both ending routes are witnessed, the failed-social physical fallback is witnessed, both endings complete in command mode, and format-4 traces replay after the source file is removed. The production generator's route checker also requires evidence for every static progression warning. A command/replay failure counts against yield.

The ignored `.generation-evaluations/report.json` records per-attempt status, diagnostic codes, candidate and prompt hashes, elapsed time, reported input/output tokens, and each accepted route's seed, tool actions, and random draws. It records per-run replay status, category, and an uncached-input cost estimate at the [published model rates](https://developers.openai.com/api/docs/models/gpt-5-mini). Missing provider usage is zero in the arithmetic and must be treated as unknown cost. The report is capped at 4 MiB; generated files and traces are removed after qualification. No API key, raw provider error, SDK response, or rejected draft is written to the report. An interrupted run resumes from the last recorded result when the frozen protocol hashes match.

The pass target is at least 24 playable results out of 30. Report first-pass, first-repair, and second-repair yield, category-level yield, failure codes, elapsed time, tokens, and estimated cost. Any category with repeated failures needs its own diagnosis even if the total meets 24. The 80% threshold is a provisional product gate, not a population-wide reliability claim.

## Measured batch: 28 September 2026

The user approved the external API run. The ignored `.generation-evaluations/report.json` contains all 30 independent initial generations and their repair histories. It records hashes for the exact source, example, schema, plan, and prompts used in this batch. The report is 473,021 bytes. The product gate **failed: 0/30 playable**, against the required 24/30. First-pass yield was 0, first-repair yield was 0, and second-repair yield was 0. No candidate reached route or source-free replay qualification, so there are no live route seeds or actions to report.

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
