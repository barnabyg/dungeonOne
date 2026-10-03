# Increment 4 ticket proposal

Status: approved and published to barnabyg/dungeonOne as issues #39–#53. All 15 titles, bodies, ready-for-agent labels, open states, and 19 native blocking relationships were verified.

Published one issue per approved ticket with the ready-for-agent label, native GitHub blocking relationships and matching body references. Draft sections retain proposal numbers; use the publication index below for GitHub identifiers. No parent issue was created or modified.

Every behavior ticket includes schema/data, authoritative execution, command and model tools, public presentation, focused boundary tests and format-4 replay for its behavior. Preserve historical formats 1–3 exactly and keep current defaults until cutover. Run focused checks per ticket and canonical full verification before pushing an implementation series. Include concrete manual tests and limitations in each handoff. No save/resume, generation, arbitrary scripts, clocks or new rule systems.

Ticket 1 is preparatory compatibility work. Tickets 2–10 build playable slices beside the existing runtime; ticket 11 supplies the author-facing logical validation workflow; ticket 12 proves independence; ticket 13 contracts the old active paths after parity. All land green. Tickets 14–15 qualify and hand off.

## Publication index

| Proposal | GitHub issue | Title |
| --- | --- | --- |
| 1 | [#39](https://github.com/barnabyg/dungeonOne/issues/39) | Preserve historical gameplay and define the data migration contract |
| 2 | [#40](https://github.com/barnabyg/dungeonOne/issues/40) | Explore an external adventure and replay it without the source file |
| 3 | [#41](https://github.com/barnabyg/dungeonOne/issues/41) | Complete external Signet combat, collection and escape |
| 4 | [#42](https://github.com/barnabyg/dungeonOne/issues/42) | Investigate external chapel clues and read a sourced journal |
| 5 | [#43](https://github.com/barnabyg/dungeonOne/issues/43) | Speak to data-authored NPCs and resolve one-attempt social checks |
| 6 | [#44](https://github.com/barnabyg/dungeonOne/issues/44) | Fight the external chapel guardian and unlock the crypt |
| 7 | [#45](https://github.com/barnabyg/dungeonOne/issues/45) | Collect and use a data-defined healing item during combat |
| 8 | [#46](https://github.com/barnabyg/dungeonOne/issues/46) | Recover the ledger, rescue Tavi and present current guidance |
| 9 | [#47](https://github.com/barnabyg/dungeonOne/issues/47) | Preserve playable investigation after NPC casualties |
| 10 | [#48](https://github.com/barnabyg/dungeonOne/issues/48) | Choose data-authored endings with explicit intent and truthful consequences |
| 11 | [#49](https://github.com/barnabyg/dungeonOne/issues/49) | Diagnose impossible authored progression before play |
| 12 | [#50](https://github.com/barnabyg/dungeonOne/issues/50) | Prove independence with a structurally different adventure |
| 13 | [#51](https://github.com/barnabyg/dungeonOne/issues/51) | Switch built-ins to the shared runtime and ship complete content assets |
| 14 | [#52](https://github.com/barnabyg/dungeonOne/issues/52) | Qualify live DM behavior on the data runtime |
| 15 | [#53](https://github.com/barnabyg/dungeonOne/issues/53) | Document authoring and verify the clean-checkout increment 4 handoff |

## 1 — Preserve historical gameplay and define the data migration contract

### What to build

Establish a green compatibility seam before changing current gameplay, with a complete inventory of authored behavior and reproducible historical journeys.

### Acceptance criteria

- [ ] Inventory supported format 1–3 rules/content/prompt/tool tuples, including missing adventure IDs, and capture missing synthetic chapel command/scripted-AI fixtures before extraction. Never regenerate existing goldens to accommodate changes.
- [ ] Isolate historical runtime selection from current startup without changing visible behavior, random draws, local controls, or replay semantics; unknown combinations fail explicitly.
- [ ] Specify the finite condition/effect catalog, ordering and atomicity rules, ID namespaces, alias grammar, schema/content/rules identities, and format-4 canonical snapshot/digest contract.
- [ ] Map every existing authored behavior—including potion intent, rescue guidance, social retry locks and casualty endings—to data and a regression scenario. Define semantic comparison fields for the generic runtime.
- [ ] Specify bounded positive prerequisite analysis, including seeded cycles and alternative branches; define analysis-limit diagnostic severity without claiming universal solvability.
- [ ] Demonstrate both existing adventures and historical replays remain green; keep the chapel default unchanged.

### Blocked by

None — can start immediately.

## 2 — Explore an external adventure and replay it without the source file

### What to build

Load a small external Signet exploration slice through command and scripted-AI play, with validation and self-contained replay from the first interaction.

### Acceptance criteria

- [ ] Provide a bounded UTF-8 JSON loader and machine-readable schema with immutable validated definitions, reference indexes, distinct versions and no provider, filesystem or RNG work inside the pure loading interface.
- [ ] Validate supported exploration structure, duplicate JSON keys/entity IDs, unknown fields/versions, numeric/string/collection/depth limits, typed references, initial placement, aliases and placeholders; produce stable code/path/entity diagnostics.
- [ ] Add --adventure-file and --validate-adventure, consistent equals forms, mutually exclusive/duplicate selector checks, and replay/validation option conflicts. Invalid or unreadable files fail before session/provider startup.
- [ ] Exercise data-authored startup, movement, look, inspect, help and local controls via CLI and scripted AI; use one generic runtime and matching public projections/dispatch validation. Keep unfinished interactions unavailable.
- [ ] Export format 4 command/AI traces with validated content snapshot, canonical digest, exact runtime/version metadata and authoritative call/action/event/draw/state evidence. Replay reconstructs state without a provider or source file.
- [ ] Reject stale digests, unknown tuples and changed expected actions/results/states; bound embedded content; preserve sanitization and never project full definitions/snapshots to the model.
- [ ] Round-trip definitions deterministically and test paths containing spaces, source removal before replay and isolated sessions. Existing built-in selection and legacy replays remain unchanged.

### Blocked by

- Proposal 1 — Preserve historical gameplay and define the data migration contract.

## 3 — Complete external Signet combat, collection and escape

### What to build

Play The Stolen Signet to victory or defeat entirely from external data in command and scripted-AI modes.

### Acceptance criteria

- [ ] Externalise the complete map, door, player/equipment, monster definition/instance, item, aliases and exit objective; implement their generic mechanics without content-ID branches.
- [ ] Preserve opening initiative, attack/critical/damage ordering, automatic retaliation, HP/death, item ownership and door restrictions. Illegal/read-only requests consume no rolls or turns.
- [ ] Require the signet for the authored exit action; preserve leave versus movement and terminal mutation freeze with final-state reads.
- [ ] Preserve DM budgets, strict arguments, local controls and failure-before/after-commit behavior; rejected or blocked calls cannot change state or duplicate effects.
- [ ] Run CLI and scripted-AI victory/defeat scenarios against the historical semantic baseline with actual seeds; replay format-4 traces and retain exact historical fixture assertions.
- [ ] Document the supported external-file journey; ordinary built-in selectors remain on their historical implementation until final cutover.

### Blocked by

- Proposal 2 — Explore an external adventure and replay it without the source file.

## 4 — Investigate external chapel clues and read a sourced journal

### What to build

Explore the chapel route, search independent physical leads and retain discoveries in a journal through external content.

### Acceptance criteria

- [ ] Author chapel public locations, starting quest, notice and repair record in data, with conditional visibility and directed connections; keep guardian-gated content inaccessible until implemented.
- [ ] Implement bounded typed conditions/effects with pre-action eligibility, deterministic branch/effect ordering and atomic application; reject conflicting effects or nested dispatch before execution.
- [ ] Search grants sourced observation/testimony/belief discoveries and milestones once; look/inspect remain read-only. Either physical lead can be obtained without an NPC or roll.
- [ ] Journal, scenes, help, suggestions and tool definitions expose only released content; forged hidden-target calls fail with no mutation/draw.
- [ ] Reproject discovered knowledge after transcript eviction; local journal/status/inventory controls survive provider failure.
- [ ] Test CLI/scripted-AI routes, duplicate searches, unknown references and cross-session isolation; replay each new action and preserve historical fixtures.

### Blocked by

- Proposal 3 — Complete external Signet combat, collection and escape.

## 5 — Speak to data-authored NPCs and resolve one-attempt social checks

### What to build

Talk to Mara and Oren through data-defined topics, with safe speaker knowledge and an independent route after a failed social check.

### Acceptance criteria

- [ ] Represent knowledge, beliefs, wants, knowledge limits, voices, topics, approved facts, ordered reply variants and fallbacks in content; knowledge alone does not authorize disclosure.
- [ ] Support the existing persuasion/deception/intimidation mechanics and challenge-ID lifetime retry lock across approach changes, repeat visits and topic aliases.
- [ ] Success releases precisely the authored facts; failure releases none of the guarded facts and keeps the physical evidence route available. Read-only/invalid requests draw no dice.
- [ ] Use speaker-scoped history and permitted facts only; private definitions, other speakers' knowledge and hidden prerequisites never enter model projections or public errors.
- [ ] Parameterise conditional evidence-backed replies for later ledger integration without resetting attempts; use a small fixture to test that mechanism now.
- [ ] Verify command/scripted-AI success, failure/retry, speaker leakage, deterministic fallback and failure recovery at the CLI/tool interface; export/replay all results.

### Blocked by

- Proposal 4 — Investigate external chapel clues and read a sourced journal.

## 6 — Fight the external chapel guardian and unlock the crypt

### What to build

Defeat or lose to the crypt guardian using generic encounter data and reveal only the content its defeat unlocks.

### Acceptance criteria

- [ ] Author skeleton definition/instance, activation conditions, crypt obstruction and encounter-cleared effects in chapel data; allow one active opponent only.
- [ ] Reuse generic combat resolution and seeded ordering, preserving existing guardian victory/defeat outcomes and terminal defeat.
- [ ] Keep protected evidence/NPC interactions unavailable before encounter clearance, including forged calls; after clearance, reveal authored entities without automatically granting discoveries or rescue.
- [ ] Record encounter consequences idempotently with deterministic events; reject unsupported overlapping encounter definitions and missing monster references.
- [ ] Exercise complete command/scripted-AI combat journeys with actual baseline seeds, visibility transitions and model-free format-4 replay; historical traces remain valid.

### Blocked by

- Proposal 4 — Investigate external chapel clues and read a sourced journal.

## 7 — Collect and use a data-defined healing item during combat

### What to build

Find the chapel potion, collect it deliberately, use it in a fight, and see authoritative healing and retaliation.

### Acceptance criteria

- [ ] Represent placement, aliases, description and supported healing dice in data; validate ownership, parameters and effect targets.
- [ ] Owned use heals 2d4+2 capped at maximum and consumes once; full-HP use preserves the item; combat use spends the turn and permits normal retaliation.
- [ ] Generic intent/tool consistency preserves explicit collection requests using content aliases, including a differently named fixture item; no content regex programs or potion-ID branches.
- [ ] Scenes/help/status and narration agree with actual ownership, healing and remaining combat consequences; provider failure cannot repeat a committed use.
- [ ] Test collection, capped/full-HP use, duplicate/invalid use, combat defeat, exact draws and replay through command and scripted AI using known seeds.

### Blocked by

- Proposal 6 — Fight the external chapel guardian and unlock the crypt.

## 8 — Recover the ledger, rescue Tavi and present current guidance

### What to build

Recover the truth, obtain an evidence-backed answer without another check, rescue Tavi, and receive truthful guidance at the inn.

### Acceptance criteria

- [ ] Author ledger discovery/source/milestones, Tavi topics and rescue relocation as bounded interactions; require guardian clearance and a visible living actor.
- [ ] Ledger discovery permits Oren's higher-priority no-roll response after either prior social result without clearing or rerolling the recorded attempt.
- [ ] Rescue moves living Tavi once to the inn, records fate/progress and leaves discoveries intact; repeats do not duplicate consequences.
- [ ] State-conditioned approved facts, fallback narration, scenes and leads agree after ledger recovery and rescue; Mara must not claim a rescued Tavi remains missing.
- [ ] Use actual actor locations/fate, not transcript memory; private motive remains hidden until its authorized release.
- [ ] Verify command/scripted-AI evidence-first and failed-social routes, post-rescue conversations, stale-prose regressions, provider recovery and format-4 replay.

### Blocked by

- Proposal 5 — Speak to data-authored NPCs and resolve one-attempt social checks.
- Proposal 6 — Fight the external chapel guardian and unlock the crypt.

## 9 — Preserve playable investigation after NPC casualties

### What to build

Attack an accessible NPC with the same combat rules and continue through durable evidence and truthful fate handling.

### Acceptance criteria

- [ ] Use generic actor combat profiles for Mara, Oren and accessible Tavi; HP is authoritative and death records its actual location.
- [ ] Death immediately removes living dialogue/rescue availability and rejects forged calls without deleting prior discoveries.
- [ ] Searching Tavi's remains explicitly confirms death; inspection alone is read-only. Cover death in the crypt and after rescue at the inn.
- [ ] Physical notice and ledger retain investigation/fate routes when relevant NPCs die; preserve authored dead-actor visibility and casualty state for endings.
- [ ] Test each NPC casualty and both Tavi death locations through command/scripted-AI interfaces, with no dead-speaker replies or false rescues; replay all new outcomes.

### Blocked by

- Proposal 8 — Recover the ledger, rescue Tavi and present current guidance.

## 10 — Choose data-authored endings with explicit intent and truthful consequences

### What to build

Finish the external chapel through either resolution, with eligibility, casualty-aware consequences and frozen final state defined by data.

### Acceptance criteria

- [ ] Author public/confidential choices, labels/aliases, inn/evidence/fate prerequisites, consequences and ordered narration variants.
- [ ] Use generic bounded intent matching: ambiguous, mixed or negated choices clarify without commitment; differently named ending fixtures exercise the same mechanism.
- [ ] Record actual Tavi fate and casualties; a dead Oren cannot promise restitution, and requested future repairs are not narrated as completed.
- [ ] Make completion atomic/idempotent; freeze mutations while local status/journal/inventory/help/quit and permitted AI reflection remain available.
- [ ] Run both complete external-file CLI/scripted-AI endings, social fallback, each casualty variation and provider recovery, with actual known seeds and exact replay evidence.

### Blocked by

- Proposal 9 — Preserve playable investigation after NPC casualties.

## 11 — Diagnose impossible authored progression before play

### What to build

Let authors validate required clue/milestone progression and receive actionable diagnostics without starting a game.

### Acceptance criteria

- [ ] Integrate positive prerequisite analysis into validation-only and startup loading, covering unreachable required locations, missing producers and closed required cycles with no entry.
- [ ] Respect directed maps, initially available facts and any-branch alternatives; ordinary map cycles and satisfiable prerequisite cycles must not be rejected.
- [ ] Provide deterministic code/path/entity diagnostics and defined severities for unsupported analysis; never call unanalysed combat/negative-condition/resource paths proven solvable.
- [ ] Reject demonstrably impossible required progression and unsupported behavior; keep all currently implemented adventure fixtures free of unresolved warnings.
- [ ] Test impossible/initially seeded cycles, alternate obtainable routes, missing producers and an analysis-limit case through the actual CLI; verify no RNG/provider/session use.
- [ ] Document algorithm bounds and limitations; later content must use the same validator and add route evidence for facts it cannot prove.

### Blocked by

- Proposal 5 — Speak to data-authored NPCs and resolve one-attempt social checks.
- Proposal 6 — Fight the external chapel guardian and unlock the crypt.

## 12 — Prove independence with a structurally different adventure

### What to build

Play a third tiny adventure and a renamed/reordered variant by editing only JSON, without runtime registration or rebuilding.

### Acceptance criteria

- [ ] Author unrelated IDs/prose, a different map/start, clue order, gated speaker, healing item, encounter and two endings with at least one different prerequisite structure.
- [ ] Complete both choices via CLI/scripted AI and export/replay; validate with no unresolved warnings.
- [ ] Rename IDs/aliases and reorder semantically unordered content without changing behavior; preserve explicitly authored branch ordering.
- [ ] Change supported descriptions and ending requirements in a copied file and observe the effect without rebuilding; replay an earlier trace after deleting the copied source.
- [ ] Demonstrate no cross-session state leakage and generic collection/ending intent safeguards with the new vocabulary.
- [ ] Audit current modules for authored ID branches, content imports and per-adventure callbacks; fix any exposed coupling as part of this slice. Keep the fixture small and non-showcase.

### Blocked by

- Proposal 7 — Collect and use a data-defined healing item during combat.
- Proposal 10 — Choose data-authored endings with explicit intent and truthful consequences.
- Proposal 11 — Diagnose impossible authored progression before play.

## 13 — Switch built-ins to the shared runtime and ship complete content assets

### What to build

Start either built-in adventure on the data runtime from a normal build or extracted package, including outside the repository directory.

### Acceptance criteria

- [ ] Route chapel default and explicit chapel/stolen-signet selectors through the shared loader/runtime; built-in and explicit-file runs have equivalent seeded gameplay.
- [ ] Remove superseded active adventure-specific dispatch, projections, prompt examples and rendering; retain explicitly isolated historical implementations/readers for formats 1–3.
- [ ] Resolve bundled assets relative to installed modules and explicit paths relative to caller working directory; ship all authored JSON and schema assets.
- [ ] Exercise both startups, external load, validation and self-contained replay from an extracted package outside the repo, including paths with spaces.
- [ ] Add JSON formatting/content validation and package asset checks to existing canonical gates, preserving order, zero warnings and dashboard behavior.
- [ ] Run full semantic parity and exact historical replay regression; new built-in exports use format 4 and no untracked/generated content is required.

### Blocked by

- Proposal 12 — Prove independence with a structurally different adventure.

## 14 — Qualify live DM behavior on the data runtime

### What to build

Verify the migrated player experience with a bounded live campaign and a manual journey focused on guidance and explicit choices.

### Acceptance criteria

- [ ] Adapt the existing evaluator's runtime selection/version metadata and scenario inputs; do not assume chapel-specific evaluation automatically covers arbitrary definitions.
- [ ] Cover both endings, failed-social fallback, post-rescue Mara, explicit item collection and casualty truthfulness; inspect actual projected requests and resulting prose.
- [ ] Keep configured model and existing quality thresholds; record model/prompt/tool/content versions and actual observations with sanitized durable evidence.
- [ ] Allow at most two evidence-led correction rounds; retain deterministic reproductions for fixes and explicitly record unresolved failures.
- [ ] Complete a manual journey reviewing truthful guidance, readable mechanics and clear choice intent; do not claim new timing/enjoyment evidence or erase issue 37's waiver.
- [ ] Keep live calls outside canonical verification. Missing credentials, unavailable provider or human evidence remain explicit outstanding gates, never scripted substitutes.

### Blocked by

- Proposal 13 — Switch built-ins to the shared runtime and ship complete content assets.

## 15 — Document authoring and verify the clean-checkout increment 4 handoff

### What to build

Deliver a reproducible author/player handoff showing the complete increment works using only tracked content.

### Acceptance criteria

- [ ] Document schema, supported predicates/effects, IDs/aliases, diagnostics and analysis limits, CLI conflicts, asset resolution, canonical digest/versioning and historical replay policy.
- [ ] Explain adventure-document round trips versus diagnostic traces versus deferred save/resume; snapshots may contain secrets/raw player text and are not authenticity proofs.
- [ ] Provide checked-in synthetic journey inputs, actual seeds and copyable manual instructions for both endings, social fallback, healing/defeat, casualties, recovery and external-file independence.
- [ ] From a clean checkout run installation, canonical seven-gate zero-warning verification, build, built-in/external startup, validation and replay; also confirm extracted-package operation outside the checkout.
- [ ] Record automated results, manual/live evidence and any unresolved risks. All implementation and qualification gates must pass before claiming increment complete.
- [ ] Preserve no-generation/no-save/no-new-rules scope and historical format support. Publishing code is a separate authorization; do not claim normal-clone availability without verified remote-default inclusion.

### Blocked by

- Proposal 13 — Switch built-ins to the shared runtime and ship complete content assets.
- Proposal 14 — Qualify live DM behavior on the data runtime.


