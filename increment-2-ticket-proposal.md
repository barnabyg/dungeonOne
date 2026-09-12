# Increment 2 ticket proposal

Status: approved and published to GitHub on 11 September 2026 as issues #12–#23, with ready-for-agent labels and native blocking dependencies.

## Published tickets

| Proposal | GitHub issue | Blocked by |
| --- | --- | --- |
| 1 | [#12 — Route existing gameplay through stable-ID actions](https://github.com/barnabyg/dungeonOne/issues/12) | None |
| 2 | [#13 — Inspect the living and defeated goblin without breaking old traces](https://github.com/barnabyg/dungeonOne/issues/13) | #12 |
| 3 | [#14 — Expose eight validated game tools with visibility-limited context](https://github.com/barnabyg/dungeonOne/issues/14) | #13 |
| 4 | [#15 — Answer read-only free-text turns in the terminal with a scripted DM](https://github.com/barnabyg/dungeonOne/issues/15) | #14 |
| 5 | [#16 — Play complete bounded DM turns without repeating actions](https://github.com/barnabyg/dungeonOne/issues/16) | #15 |
| 6 | [#17 — Export and replay AI sessions through the terminal](https://github.com/barnabyg/dungeonOne/issues/17) | #16 |
| 7 | [#18 — Reproduce failed and adversarial AI turns from traces](https://github.com/barnabyg/dungeonOne/issues/18) | #17 |
| 8 | [#19 — Start live AI play through the OpenAI Responses adapter](https://github.com/barnabyg/dungeonOne/issues/19) | #16 |
| 9 | [#20 — Define and verify the shared DM interpretation case library](https://github.com/barnabyg/dungeonOne/issues/20) | #16 |
| 10 | [#21 — Run opt-in live DM evaluations with reproducible reports](https://github.com/barnabyg/dungeonOne/issues/21) | #18, #19, #20 |
| 11 | [#22 — Evaluate and pin a qualifying default DM model](https://github.com/barnabyg/dungeonOne/issues/22) | #21 |
| 12 | [#23 — Verify the Increment 2 tester handoff from a clean checkout](https://github.com/barnabyg/dungeonOne/issues/23) | #22 |

Reviewed against the Increment 2 implementation plan and the current command, engine, trace, and replay boundaries. Existing GitHub issues 1–11 are closed Increment 1 work. Numbers below are proposal identifiers, not GitHub issue numbers.

## Sizing and shared acceptance

Each ticket is intended for one fresh implementation context, targeting approximately 60–150k tokens including investigation, implementation, focused tests, full verification, and handoff. These are planning allowances, not measured predictions or guarantees. Split further if implementation discovers a larger compatibility or interface change; do not consume the 300k ceiling trying to complete adjacent tickets. No ticket owns general cleanup or unlimited defect fixing.

Every implementation ticket includes focused tests and usage documentation for its own capability, must pass the canonical seven-gate `npm.cmd run verify` with zero warnings, and must report meaningful manual checks and limitations. Canonical gameplay/model tests use scripted or mocked adapters, with no live API requests or API key. Live evaluation is explicitly separate; dependency installation and security tooling retain the repository's existing network requirements. Installation/startup/package changes require clean-checkout evidence using tracked files. Preserve seeded mechanics and released trace semantics.

All tickets retain the existing three-room adventure, one authoritative rules engine, and offline command mode. No new rules/content, autonomous multi-action plans, save/resume, hosted conversation state, streaming, graphical UI, or deployment. Apply `ready-for-agent` when published; blockers still gate implementation. Ticket 12 requires actual human acceptance evidence and must remain open until it exists.

## Review decisions carried into the tickets

- Historical `inspect goblin` commands were rejected. Adding inspection must preserve those results when replaying old traces, using explicit supported version metadata and a narrow compatibility adapter. Do not silently reinterpret old traces or infer versions from expected results.
- Relevant-reference schemas must handle empty target sets with valid strict schemas, for example by omitting an unavailable function. Carried-item references needed for inspection may be offered without dumping inventory details into every scene.
- Format 2 must represent malformed/unknown calls and budget failures without pretending they executed. Define the complete recording envelope before release, including call identity, ordering, and execution disposition needed for deterministic verification.
- Before model selection, live use explicitly requires `--model`; the final default is selected only from evaluation evidence. Missing-key errors validate configuration locally; a rejected key is a normalized provider failure.
- Software can guarantee state authority and action budgets. Narration truthfulness is evaluated, not claimed to be provable by text sanitization or scripted tests.

## 1 — Route existing gameplay through stable-ID actions

**What to build:** Prefactor the existing playable command game so canonical stable-ID game actions drive the same authoritative engine, providing the seam for DM tools without changing existing play.

**Blocked by:** None — can start immediately.

**Acceptance criteria:**

- [ ] Introduce canonical look, inspect, move, open, take, attack, and leave actions. Inspection uses discriminated feature, door, item, opponent, and named-exit references; opponent inspection can remain unsupported until ticket 2.
- [ ] Adapt the existing parser/terminal actions to this seam, preserving help, status, inventory, quit, empty/unknown input, existing rejection precedence and wording, events, and random-draw ordering.
- [ ] The authoritative handler checks visibility, adjacency, ownership, door/combat/life-state restrictions and victory requirements, even for well-typed IDs. No second rules implementation or permissive trusted-caller shortcut.
- [ ] Direct canonical-action tests and adapter tests demonstrate equivalent accepted/rejected behavior; spawned command victory and defeat remain unchanged.
- [ ] Existing format-1 traces, including invalid input and rejected actions, replay unchanged without new required fields. Capture relevant historical regression fixtures before later behavior additions.

**Scope boundary:** Prefactor only; no DM schemas, prompts, provider, or replay framework redesign.

## 2 — Inspect the living and defeated goblin without breaking old traces

**What to build:** A player can inspect the visible goblin before and after combat and read an adventure-defined description plus its authoritative condition.

**Blocked by:** 1.

**Acceptance criteria:**

- [ ] Canonical opponent inspection and command `inspect goblin` work while visible, including during combat and after defeat; remote inspection remains rejected.
- [ ] Adventure definition, structured inspection result and deterministic presentation carry the description/condition; inspection changes neither state nor random draws and creates no loot or new content.
- [ ] Preserve replay of historical format-1 traces whose goblin-inspection command was rejected. Use explicit compatible version handling, preserving old parser/rejection behavior rather than trusting recorded expectations.
- [ ] Newly exported command traces containing successful opponent inspection round-trip with supported explicit version metadata. Continue accepting all previously released metadata and formats without migration.
- [ ] Built-CLI tests demonstrate living/dead inspection, remote rejection, new trace replay and historical rejection replay, with unchanged later seeded combat.

**Scope boundary:** Only this behavior extension and the compatibility it requires; no generic version migration framework.

## 3 — Expose eight validated game tools with visibility-limited context

**What to build:** An untrusted caller can inspect the current scene/status or attempt supported gameplay through a narrow tool dispatcher that uses canonical actions.

**Blocked by:** 2.

**Acceptance criteria:**

- [ ] Support look, move, inspect, open, take, attack, leave and get_character_status, with runtime JSON validation independent of TypeScript. Reject unknown names, malformed JSON, extra fields, invalid references and unavailable targets without mutation or random draws.
- [ ] A pure scene projection exposes the public title/objective, current room, visible features/items/opponent condition, named adjacent exits/door states, outcome and combat turn. Status returns exact HP/max HP, equipment, collected items, outcome and combat turn without mutation.
- [ ] Remote descriptions/placements, RNG internals/future rolls, trace expectations, credentials and implementation-only data are absent from model-facing scene/tool results. Carried items remain inspectable without unsolicited inventory-detail disclosure.
- [ ] Derive strict schemas and runtime reference validation from shared visibility data: all properties required, no extra properties, currently relevant enums and valid handling of empty target sets. Engine authorization remains independent of schema filtering.
- [ ] Public-interface tests cover every room, door state, goblin state, carried signet, combat, victory/defeat, all eight tools, malicious references, and a canonical winning sequence through the dispatcher. Read/rejected calls preserve later combat rolls.

**Scope boundary:** A verifiable tool capability, not a standalone schema layer; no model orchestration yet.

## 4 — Answer read-only free-text turns in the terminal with a scripted DM

**What to build:** Through an injected scripted model, a player can ask about the scene/status, inspect a target, or receive clarification in the real terminal loop.

**Blocked by:** 3.

**Acceptance criteria:**

- [ ] Introduce the small provider-neutral model port and deep DM turn module, returning authoritative state, ordered tool results/mechanics, narration, bounded transcript and normalized diagnostics. SDK types do not enter game or terminal interfaces.
- [ ] Implement the versioned prompt: engine authority, untrusted player intent in user input, structured authoritative context/results, no hidden facts or invented outcomes, concise second-person narration and clarification instead of materially different guesses.
- [ ] This intermediate mode offers only read tools. Enforce three read calls and four model responses per submission, reject repeated call IDs and multi-call responses, and refresh projection after each call. No mutation can execute in this slice.
- [ ] Sanitize ANSI/control characters, preserve ordinary line breaks and document narration/transcript length limits. Empty, malformed, overlong or failed output produces deterministic fallback and a usable next prompt.
- [ ] Terminal integration retains deterministic introduction, separate Mechanics/Dungeon Master sections, exact local help/quit and EOF. Spawned-process tests use a documented test-only injection seam through the real terminal path; command mode is unchanged and production live startup remains ticket 8.

**Scope boundary:** Read-only conversation only. Build the full authority prompt now; enabling mutation and proving its safety belongs to ticket 5.

## 5 — Play complete bounded DM turns without repeating actions

**What to build:** A scripted DM can guide a player through the dungeon, executing at most one state-changing attempt per submission and narrating its authoritative result.

**Blocked by:** 4.

**Acceptance criteria:**

- [ ] Enable move/open/take/attack/leave through the dispatcher. One attempt consumes the mutation budget even if rejected; stop offering mutations afterward. Retain three-read/four-response bounds and never execute parallel calls or repeated IDs.
- [ ] A multi-call response executes no member; repeated, malformed and over-budget calls produce typed failures. Track attempted/validated/executed dispositions so later tracing can distinguish orchestration rejection from engine execution.
- [ ] Function continuations receive accepted or rejected structured results and the latest scene. Record each committed result and its rolls once; stale transcript/model claims never change state.
- [ ] Before-action provider failure preserves state/RNG. After-action provider failure or budget exhaustion preserves the committed result, renders mechanics once, uses deterministic fallback, and never automatically repeats the action. Terminal sessions allow reflection/reads and local exit but no gameplay mutation.
- [ ] Spawned-process scripted seed-0 victory and seed-207 defeat use natural-language inputs through the real terminal path, including corpse inspection, backtracking, signet and explicit leave. Cover clarification, impossible/compound/injection inputs and failure immediately after attack; inserted reads/rejections/narration do not alter later seeded combat.

**Scope boundary:** Complete offline scripted play and software guardrails, not proof of real-model interpretation accuracy.

## 6 — Export and replay AI sessions through the terminal

**What to build:** A tester can export an AI session and verify its mechanical history headlessly without a model or API key.

**Blocked by:** 5.

**Acceptance criteria:**

- [ ] Define a complete normalized format-2 envelope before release: format/rules/adventure/RNG and prompt/tool versions, provider/model identifiers, seed/initial state, raw player input, ordered call identity/name/arguments/disposition, results/failures/rolls, per-call/per-turn states, narration/failures and completion. Include lossless safe representation for invalid JSON and unexecuted orchestration failures.
- [ ] Export on quit and EOF, retaining victory/defeat/incomplete distinction and current local-quit semantics. Unwritable/serialization failures report accurately without changing gameplay.
- [ ] Dispatch to real format-1 and format-2 decoder/replayers. Replay executed calls through the canonical engine/validated dispatcher with the recorded seed; do not call a model or assign recorded state as authority.
- [ ] Compare rolls, ordered accepted/rejected results, per-call/per-turn state and final completion; ignore narration and provider identifiers for deterministic equality. Clarification-only turns prove no call, state change or random draw.
- [ ] Spawned CLI exports/replays victory, defeat, clarification and early EOF; corruption of a valid call's name/arguments/roll/result/state reports the first mismatch. Preserve all format-1 behavior and ticket-2 compatibility.
- [ ] Record only allowlisted application data, never configuration credentials, headers, hidden provider reasoning or full SDK payloads. Test exclusion with synthetic sensitive provider data and document that raw player text is intentionally included.

**Scope boundary:** Normal round trips plus complete recording schema. Exhaustive hostile/failure-history validation is ticket 7; do not make incompatible schema changes there.

## 7 — Reproduce failed and adversarial AI turns from traces

**What to build:** A tester can replay a session containing rejected tools or provider/orchestration failures and distinguish legitimate no-ops from corrupted history.

**Blocked by:** 6.

**Acceptance criteria:**

- [ ] Round-trip unknown tools, malformed JSON, extra/hidden/invalid references, engine rejection, duplicate IDs, multi-call responses, and read/mutation/model-response budget exhaustion using the existing format-2 envelope.
- [ ] Deterministically validate recorded orchestration dispositions/order/budgets rather than executing blocked calls. Invalid-JSON records remain diagnosable without treating them as valid actions.
- [ ] Reproduce provider failure before execution and after an attack, verifying zero versus exactly one committed action and its rolls. Provider/narration metadata remains non-authoritative.
- [ ] Detect the first altered execution disposition, failure result, state, roll, ordering or completion; reject malformed/unsupported versions clearly. Cover terminal reflection/read-only turns and incomplete sessions.
- [ ] Built-CLI tests show failure traces export and replay without API access; format-1 malformed/unsupported/corrupted diagnostics remain unchanged. Secret-exclusion checks include failure paths.

**Scope boundary:** Trace diagnostic hardening only; new orchestration behavior or discovered unrelated defects become separate tickets.

## 8 — Start live AI play through the OpenAI Responses adapter

**What to build:** A configured player can launch opt-in live AI play while command mode and replay remain independent of AI credentials.

**Blocked by:** 5.

**Acceptance criteria:**

- [ ] Add the official exact-version OpenAI SDK and lockfile/package/security checks. An injected-config adapter maps the narrow model port to Responses and returns normalized calls, visible narration, response/model IDs, usage and status/errors.
- [ ] Mocked SDK/transport tests verify strict functions, disabled parallel calls, store=false, required same-turn output-item preservation and exactly one function output per validated call ID. Opaque provider continuation data stays inside the adapter and outside traces/domain results; no hosted or previous-response continuation across turns.
- [ ] Add explicit --ai and --model startup support and updated usage. Until ticket 11 selects a default, require --model in AI mode. Reject missing configuration and duplicate/incompatible arguments before gameplay; offline help/command/replay/invalid-argument handling works without a key.
- [ ] Read OPENAI_API_KEY through configuration, never CLI arguments. Finite timeout/cancellation and normalized auth/rate-limit/timeout/unavailable/malformed/unknown failures expose no credentials, headers or raw provider error data. Configure retry behavior so it cannot repeat an engine action or make waits unbounded.
- [ ] Through the terminal/adapter boundary, test failures before/after execution and recovery to another prompt. A narrowly scoped opt-in smoke test and clean-checkout install/build/startup documentation exercise explicit-model live startup; canonical tests remain mocked.

**Scope boundary:** No default-model guess, broad live evaluation, additional provider, or streaming. Broad live testing waits for tickets 7 and 10.

## 9 — Define and verify the shared DM interpretation case library

**What to build:** Maintainers can run one data-driven set of interpretation contracts with scripted responses and later reuse it against a live model.

**Blocked by:** 5.

**Acceptance criteria:**

- [ ] Each case supplies a named authoritative state or deterministic setup actions, input, expected tool/arguments or clarification/no-action class, allowed engine outcomes, call/attempt budgets, random behavior and safety tags.
- [ ] Include all twelve minimum examples from the plan: cautious door opening, sword attack, family seal, corpse search, backtracking, injury status, ambiguous 'Use it', teleportation, remote signet pickup, compound door/entry, direct HP injection and fabricated victory. Include clear movement and explicit leave for the full adventure.
- [ ] Cover the relevant visible/hidden, alive/defeated and terminal contexts with reproducible seeded setup. Invalid cases prove state/RNG invariants rather than merely matching prose.
- [ ] Reuse case definitions in scripted deterministic tests through the DM turn boundary; validate expected calls, arguments, results, attempts and draws. Scripted success is evidence of harness/guardrails, not real-model tool-selection accuracy.
- [ ] Specify denominators/classification for safety, clear/synonym/navigation/status accuracy, ambiguous clarification and compounds so the live evaluator can score reproducibly. Do not assert exact creative narration; mark semantic/manual judgments explicitly.

**Scope boundary:** Case definitions, scoring contract and deterministic consumer; no live requests or prompt-tuning campaign.

## 10 — Run opt-in live DM evaluations with reproducible reports

**What to build:** A maintainer can evaluate a named live model against the shared cases and inspect diagnostic evidence without affecting canonical verification.

**Blocked by:** 7, 8, 9.

**Acceptance criteria:**

- [ ] Provide a separate eval:dm command requiring explicit model selection and supporting at least three repetitions per case, with isolated state/RNG/transcript per run. No live command runs from canonical verification.
- [ ] Use the production adapter, prompt, tool definitions and case contracts. Record actual model ID, prompt/tool versions, case/repetition, normalized calls and outcomes, latency, token use, failures and trace references sufficient for diagnosis.
- [ ] Report 100% safety compliance per run; at least 90% expected call/argument accuracy for clear/synonym/navigation/status; at least 90% appropriate nonmutating clarification for ambiguous cases; and every compound respecting the mutation budget. Missing/manual classifications cannot silently count as passes.
- [ ] Keep reports local and excluded from routine commits, omit secrets/headers/provider internals, document prerequisites/output/exit behavior and preserve partial evidence after provider failures. A failed evaluation must not be reported as success.
- [ ] Test evaluator aggregation, repeated-case isolation, failure reporting, sensitive-data exclusion and exit behavior using scripted/mocked adapters. Record a bounded opt-in live smoke when credentials are available; do not claim unavailable live evidence.

**Scope boundary:** Evaluator delivery only. Model selection and quality acceptance are ticket 11.

## 11 — Evaluate and pin a qualifying default DM model

**What to build:** A player can start --ai without choosing a model, using a documented default backed by repeated evaluation evidence.

**Blocked by:** 10.

**Acceptance criteria:**

- [ ] With authorized live credentials, run every case at least three times per evaluated candidate using the shipped evaluator. Record exact candidate IDs, prompt/tool versions, threshold totals and failures; keep detailed local reports out of routine commits and check in a concise evidence summary.
- [ ] Tune only the versioned prompt/tool descriptions and bounded case regressions justified by observed failures. Reevaluate after each relevant change; do not weaken engine/tool/orchestration guardrails to improve scores.
- [ ] Select and pin one documented default identifier only when every stated safety/quality threshold passes. --model remains available; --ai alone now uses that default. Test both paths and unchanged offline startup behavior.
- [ ] Complete real seed-0 victory and seed-207 defeat, manually reviewing narration against mechanics with zero contradicted completed outcomes; capture corpse inspection and meaningful tool calls. Record reviewer/evidence accurately.
- [ ] Bound the work to an initial candidate and at most two evidence-driven candidate/prompt revisions. If none qualifies, report the quality blocker and concrete next experiment; leave selection acceptance pending rather than running an unlimited tuning campaign or inventing success.

**Scope boundary:** Evaluation, limited prompt tuning and default selection. Engine defects require separate findings/tickets. Live credentials and sufficient API quota are prerequisites, not reasons to bypass thresholds.

## 12 — Verify the Increment 2 tester handoff from a clean checkout

**What to build:** An unfamiliar tester can install and finish the dungeon entirely in ordinary language, understand failure/defeat, and mechanically replay the resulting traces.

**Blocked by:** 11.

**Acceptance criteria:**

- [ ] Using tracked files in a clean checkout, record prerequisites, install, seven-gate zero-warning verification, build, offline command startup, both trace-version replays, configured AI startup and evaluation commands/results. Document default model, key setup, --model/seed/trace/replay and provider-error recovery.
- [ ] Obtain actual unfamiliar-human evidence for a full natural-language victory without canonical gameplay syntax or developer intervention, plus an understandable defeat and local quit. An agent/scripted playthrough does not substitute for the human criterion; leave it pending if a tester is unavailable.
- [ ] Confirm distinct deterministic mechanics/narration, living/dead goblin inspection including 'Search the corpse', signet/backtracking/explicit exit, and terminal reads with frozen mutations.
- [ ] Record ambiguity, impossible/remote action, early exit, fabricated victory, HP override, prompt injection and compound-action probes. Simulate provider failure before/after an attack and confirm zero/one committed action and continued usability.
- [ ] Export/replay victory, defeat, clarification and interrupted/failure sessions without an API key; inspect traces/reports for unexpected provider/configuration data. Record model/prompt/tool versions, seeds, observed failures and limitations.
- [ ] Make documentation corrections within this scope; file bounded implementation defects separately and retain them as release blockers where required. Do not turn acceptance into an unlimited polishing ticket or declare completion with missing evidence.

**Scope boundary:** Final evidence and documentation only; no new content, general refactor, deployment or unrelated usability work.

## Coverage and frontier

Original A: 1–3. B: 3. C: 4–5. D: 6–7. E: 8. F: 9–11. G: 12.

Initial frontier: 1. After 5, trace work (6–7), provider integration (8) and case-library work (9) can proceed independently. They converge at 10. Dependencies list immediate blockers rather than redundant transitive edges.
