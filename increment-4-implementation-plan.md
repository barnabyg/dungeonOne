# Increment 4 — Separate the Adventure From the Engine

## 1. Proposed outcome

The Bell Beneath the Chapel and The Stolen Signet load from versioned JSON adventure documents and run through the same deterministic runtime. Their normal command and AI journeys remain recognisable, with the same rules, available choices, hidden-information protections, seeded outcomes, and explicit ending decisions. A third, tiny regression adventure runs without changing application code or registering a bespoke runtime.

The key acceptance statement is: **changing an adventure's identities, layout, discoveries, dialogue conditions, and ending requirements requires only valid data; the current engine contains no adventure-specific branches.**

This is a proposed implementation plan for later ticketing, not implementation issues. No GitHub issues are created by this work. Module and field names below describe the intended interfaces and can be refined during the first delivery slice without weakening the acceptance criteria.

## 2. Review of the current project

Reviewed against local revision `94ce388` on 20 September 2026, including the high-level roadmap, increment 3 plan, source, tests, packaging scripts, and acceptance records.

| Existing area | Finding | Increment 4 implication |
| --- | --- | --- |
| `src/adventure.ts` | Signet definitions are structured, but IDs are literal unions and the definition is imported globally. | Moving this object alone would not separate adventure and engine. |
| `src/chapel.ts` | Content, state types, NPC-specific conversation functions, social checks, rescue, casualties, endings, combat orchestration, and rendering live together. | Extract behavior as well as text; preserve the already-qualified edge cases. |
| `src/session.ts`, `src/combat.ts` | Signet orchestration is specific to its rooms, item, and opponent; combat resolution already accepts generic combatant IDs, although default types import adventure IDs. | Reuse deterministic mechanics and remove content dependency from current rules types. |
| `src/runtime.ts`, `src/runtime-contract.ts` | A useful runtime interface exists, but its state/events include adventure-specific unions. Runtime adapters include chapel-specific intent checks and authoritative narration fixes. | Introduce one current runtime implementation behind an adventure-independent interface; isolate historical adapters. |
| `src/chapel-tools.ts`, `src/game-tools.ts`, `src/dm-turn.ts` | Tools, descriptions, projections, and prompt examples contain authored knowledge and adventure assumptions. | Data extraction must cover every route by which content reaches the player/model, not just engine dispatch. |
| `src/trace.ts`, `src/replay.ts` | Formats 1–3 and explicit rules/content/prompt/tool tuples are compatibility contracts. Replay reconstructs state; it does not load recorded state. | Preserve readers and exact historical semantics; introduce a new export contract for external content. |
| `scripts/package-checks.mjs`, `tsconfig.build.json` | Build compiles TypeScript; package checks currently require JavaScript entry points but no adventure assets. | Runtime JSON must be shipped, resolved independently of working directory, and exercised from an extracted package. |
| Acceptance records 36–38 | Scripted, live, and unfamiliar-player evidence exists, including fixes for stale rescue narration and mistaken potion collection. Issue 37 retains a waiver for missing timing/questionnaire fields. | Carry these regressions forward. Do not interpret this refactor as new evidence of enjoyment or 30–60 minute duration. |

This review did not rerun executable verification. The 280-test, seven-gate result in issue 38 is recorded prior evidence, not a fresh result from this planning task.

## 3. Scope and deliberate limits

### Included

- A documented, versioned, strict JSON format and loader with useful diagnostics.
- Structural, reference, initial-state, supported-mechanics, and bounded dependency validation.
- External definitions for both existing adventures, including authored behavior and presentation.
- One deterministic runtime parameterised by a validated adventure definition.
- Local file selection and validation-only CLI modes.
- Data-driven public projections, offered tools, dialogue, narration fallbacks, and ending choices.
- Self-contained diagnostic traces for external adventures and model-free replay.
- Package/startup verification, author documentation, and a small independence fixture.

### Deferred

AI adventure generation/repair/criticism, a visual editor, remote downloads, script plugins, arbitrary rules definitions, broad modding support, tactical or group combat, new classes/spells, world clocks, general relationships, save slots, session resume, and long-session memory. Do not add empty clock or faction abstractions merely because the roadmap lists possible sections.

The roadmap's “load/save round trips” means **adventure document parse/serialize/reload** here. World-state save/resume remains increment 6. Traces remain diagnostic recordings and are never presented as saves.

## 4. Target design and module interfaces

Use a deep adventure-loading module and a deep runtime module, with private helpers as needed:

1. `loadAdventure(text)` returns either an immutable validated definition or ordered diagnostics. It parses, checks, and builds reference indexes internally. It does not access the filesystem, start a session, invoke a provider, or draw randomness.
2. `createAdventureRuntime(definition)` returns the current adventure-independent runtime interface. Session creation, actions, public projections, tool validation, and rendering all use this definition.
3. The CLI's file adapter reads a bounded local file, reports I/O failures, and calls the loader. Built-in selection uses the same loader and runtime factory.
4. The replay module selects either a historical adapter or the new current versioned runtime from validated trace metadata. It never selects by the startup default.

Keep deterministic dice and attack resolution as shared mechanics. New runtime state uses validated string IDs and generic records for locations, actors, items, discoveries, quests, challenge attempts, and completion. Definition indexes are not mutable state. Each session starts from a fresh state; separate sessions cannot mutate each other's content or progress.

Current engine, rules, parser, presentation, tool, and orchestration modules must not import chapel/signet content or test IDs such as `oren`, `tavi`, `crypt`, `signet`, or `diversion-ledger`. The built-in registry may map selector IDs to files. Explicitly versioned historical implementations, tests, fixtures, and authored data are allowed to retain those names.

Do not wrap existing chapel functions in a generic-looking adapter and call the separation complete. Avoid a second registry of per-adventure handlers or callback names in JSON.

## 5. Adventure document contract

Use UTF-8 JSON, one self-contained document per adventure, initially under `adventures/`. No executable modules, includes, remote references, expressions, arbitrary state paths, or regular-expression programs supplied by content. Publish a machine-readable schema plus a small authoring guide; derive or check structural validation against that schema to prevent competing contracts.

| Section | Required meaning |
| --- | --- |
| Metadata | Schema version, adventure ID, content version, title, objective, supported rules profile. Schema/content/rules versions are distinct. |
| Starting state | Player location and supported prebuilt character statistics/equipment; initial doors, item placements, actor placements/HP, quest status, and explicitly allowed initial discoveries/milestones. |
| Locations and connections | Stable IDs, public descriptions, directed destinations, optional door references, features and conditional visibility. Preserve existing map semantics rather than forcing every exit to be reciprocal. |
| Actors and encounters | NPC/monster definitions and separate placed instances, supported combat statistics, encounter activation conditions, and bounded consequences of defeat/death. One active opponent at a time. |
| Equipment and items | Names, aliases, descriptions, weapon damage, collectible behavior, and the supported healing consumable profile with authored dice parameters. |
| Facts and discoveries | Canonical statements, observation/testimony/belief classification, source references, discoverable text, leads, and release conditions. Private knowledge and a player's discoveries are distinct. |
| NPC conversations | Knows, believes, wants, explicit knowledge limits, voice, topics, approved facts, conditional reply variants, authored fallbacks, and effects. Knowing a fact never automatically authorises revealing it. |
| Social challenges | Supported approaches, modifier/DC, stable challenge ID, lifetime retry policy, and success/failure branches. Evidence-backed follow-up bypasses the check without clearing its recorded attempt. |
| Quests and interactions | Milestones, visible search/talk/use/exit interactions, prerequisites, and finite typed effects. Rescue is an interaction that relocates a living actor and records progress. |
| Endings | Eligibility, explicit choice labels/aliases, conditional consequences and text, and completion effects. Casualties and actual fate select truthful variants. |
| Presentation | Conditional scene additions, journal leads, action suggestions, authoritative narration variants, and content-specific language mappings. Mechanical summaries remain generic. |

Use arrays of entities so duplicate entity IDs can be diagnosed before constructing indexes. Define ID namespaces explicitly and validate typed references against the appropriate namespace. Duplicate JSON object keys must also fail rather than being silently overwritten during parsing. IDs, aliases, and command arguments must fit a documented bounded grammar; reject ambiguous aliases within the same actionable context. Keep display labels separate from command tokens.

Require explicit initial placement for each actor and collectible, or a defined inactive/absent state. Validate HP against maximum HP, equipment ownership, and door/connection consistency. Reject unsupported fields and unsupported versions with actionable diagnostics rather than silently ignoring them.

## 6. Bounded conditions and effects

The difficult part is representing the current chapel's authored behavior without inventing a programming language. Start with the smallest finite vocabulary that expresses both existing adventures.

### Conditions

Allow bounded `all`, `any`, and `not` combinations over typed predicates: player/actor location; actor alive/dead; item carried/available/consumed; door open; discovery known; quest status or milestone; encounter cleared; social challenge attempted/result; and session playing/completed. No string evaluation, arbitrary comparisons over state paths, callbacks, or loops.

### Effects

Support granting a sourced discovery, recording a milestone, relocating a living actor, transferring/consuming an item, opening a door, recording an authored consequence, and completing a quest/session. Damage, healing, initiative, and social rolls remain engine operations with supported parameter profiles, not arbitrary “set HP” effects.

Prefer effects attached to explicit interactions or engine lifecycle events, such as encounter cleared or actor died. Avoid a continuously reevaluated trigger system. Each action evaluates prerequisites against the pre-action state, selects a documented ordered branch, and applies its finite effect list atomically. Reject conflicting effects or unsupported nested action dispatch during validation. An invalid/rejected request changes no state and consumes no rolls; validate everything possible before resolving dice.

Declare deterministic ordering for encounter activation, rolls, effects, events, and presentation variants. Make discoveries, milestones, rescue, and completion idempotent. A challenge ID, rather than a topic/approach spelling, owns the retry lock. Read-only inspection never grants a discovery or confirms a death.

### Required behavior mappings

| Current behavior | Required data representation |
| --- | --- |
| Notice and repair record provide independent leads | Separate searchable sources with no NPC dependency. |
| Oren's guarded account | Challenge definition, one attempt across approaches, approved facts on success, physical fallback on failure. |
| Ledger unlocks a later answer | Higher-priority evidence-conditioned reply; does not reroll/reset the challenge. |
| Crypt guardian blocks evidence and Tavi | Encounter-cleared visibility and interaction conditions. |
| Tavi rescue / remains | Living-actor relocation interaction versus explicit dead-actor search, each recording appropriate fate progress. |
| NPC casualties | Generic HP/death handling plus authored milestone/ending conditions; preserve death location. |
| Public/confidential resolution | Two explicit eligible choices, location/evidence/fate prerequisites, conditional future commitments, terminal mutation freeze. |
| Signet objective | Item possession plus authored exit interaction; retain the distinction between leaving and ordinary movement. |
| Potion collection/use | Data aliases plus generic intent/tool consistency; healing profile, ownership, capped HP and combat turn cost. |
| Post-rescue guidance | State-conditioned approved conversation and narration text, including truthful location/fate and next actions. |

During extraction, compare all public channels. Preserve qualified player-visible behavior while eliminating inconsistencies between an approved conversation payload and its authoritative fallback; record any intentional correction separately from mechanical equivalence.

## 7. Validation contract and its limits

Validation-only mode should collect independent diagnostics in a stable order, with a code, JSON path, entity ID where available, and a concise explanation. It must not print entire private documents. Invalid content exits nonzero before a game or provider starts.

Validation layers:

1. **Input and structure:** bounded bytes, nesting, collection sizes, string lengths, safe integers/dice ranges; valid JSON without duplicate keys; required sections; supported schema/rules versions; unknown fields rejected.
2. **Identity and references:** duplicate IDs, missing locations, misplaced NPCs/items, missing monster definitions, invalid source/fact/topic/milestone/ending references, invalid aliases and template placeholders.
3. **Initial-state consistency:** valid player start, legal HP and placements, valid equipment, inactive versus living/dead actors, legal quest state, no conflicting item ownership or initial encounter occupancy.
4. **Supported behavior:** finite conditions/effects, valid effect targets, one-opponent encounter limits, explicit social retry semantics, safe presentation substitutions, deterministic branch ordering.
5. **Dependency analysis:** structurally unreachable required locations, milestones with no producer, and closed prerequisite cycles with no initial or alternate entry route. Account for `any` alternatives and initial facts; an ordinary bidirectional map is not a quest dependency cycle.

The first slice must specify a bounded analysis for the positive discovery/milestone prerequisite subset, with tests for an impossible cycle, an initially satisfied cycle, and an alternate obtainable branch. Report unsupported logical analysis as a diagnostic with a defined severity, never as “solvable.” Reject demonstrably impossible required progression; expose analysis limitations in validation output and author docs. Built-ins and the independence fixture must have no unresolved validation warnings at handoff.

Do not claim that static validation proves full solvability through combat, negative conditions, consumable use, or all casualty combinations. Authored scenario tests prove the supported routes; broader generated-adventure quality checking belongs to increment 5.

## 8. AI, visibility, and command behavior

Create tools and player-facing views from the same authoritative availability decisions. Enforce legality again at dispatch: omitting a hidden action from a tool schema is insufficient protection against fabricated calls.

Never send the complete adventure document, private fact index, ending conditions, or trace snapshot to the DM. Scene tools expose only currently visible entities and interactions. Journal reads expose only discoveries. Speaker responses contain only that speaker's permitted facts, current reply variant, and scoped history. Trace content is diagnostic and may include secrets; it is not a model projection.

Keep generic DM instructions in code. Move authored names, examples, voices, fallback prose, and state-specific guidance to data, projecting only appropriate text. Content is untrusted input and cannot extend the tool set or override rules instructions.

Preserve the current one-mutation/read/response budgets, failure-after-commit behavior, and local `help`, `quit`, `status`, `inventory`, and `journal` controls. Make tool capability classification generic and deterministic. Retain tests for explicit potion collection and unambiguous ending intent. Use bounded token/phrase aliases and generic negation/ambiguity handling; when intent cannot be established, clarify without committing. Content must not supply arbitrary regular expressions or code to interpret intent.

An independence fixture must exercise the same safeguards with different item and ending labels, so the intent checks cannot silently remain chapel-specific.

## 9. Compatibility and trace identity

Keep formats 1, 2, and 3 readable with their currently supported exact tuples, including absent adventure IDs and historical prompt versions. Capture missing chapel coverage before extraction. Never regenerate historical fixtures to accommodate a refactor.

Recommended migration: retain explicitly isolated legacy implementations/adapters for historical replay, while both ordinary built-in selectors eventually use the new data runtime. Historical application code is a compatibility island, not a route for new adventures. During rollout keep current defaults until parity passes.

Introduce trace format 4 for all new data-runtime command and AI exports. Its envelope includes:

- format, engine/rules, RNG, content-schema, content-ID/version, and relevant prompt/tool versions;
- the complete validated adventure document snapshot and a deterministic digest;
- the seed and existing authoritative action/tool, rejection, event, draw, and state evidence;
- diagnostic provider/narration metadata with the existing sanitization constraints.

Specify canonical serialization for the digest, including object-key order and number handling. The digest binds the snapshot to the header; it is not a signature or authenticity claim. Replay validates the embedded document and supported version tuple, reconstructs the initial state, and executes recorded inputs/calls. Recorded states are expectations only. Do not load executable code or trust a supplied initial state.

Embedding the document makes external-file traces replayable after the source is edited, moved, or deleted, without an unbounded content archive or path lookup. Apply file-size/structure limits to embedded content too. A changed snapshot with a stale digest, unknown rules version, altered call, changed draw, or wrong state must fail clearly. A coherently rewritten trace is not something this format authenticates.

New exports may differ in generic state/event shape and format number. Preserve seeded gameplay semantics and results through an explicit semantic comparison; keep historical replay assertions exact. Update current-export tests deliberately while retaining historical decoder/adapter coverage.

## 10. CLI and distribution

Proposed syntax:

```powershell
npm.cmd start -- --adventure chapel --seed 0
npm.cmd start -- --adventure stolen-signet --seed 0
npm.cmd start -- --adventure-file .\adventures\chapel.json --seed 0
npm.cmd start -- --ai --adventure-file .\adventures\chapel.json --seed 0
npm.cmd start -- --validate-adventure .\adventures\chapel.json
npm.cmd start -- --replay .\session-trace.json
```

`--adventure` and `--adventure-file` are mutually exclusive; duplicate selectors fail. Validation and replay are standalone modes, incompatible with play-only options. Document accepted `--flag=value` forms consistently with existing CLI behavior. Missing, unreadable, malformed, and unsupported files produce useful errors without stack traces or provider access.

Built-in IDs and the chapel default remain stable. Resolve bundled assets relative to the installed module, and explicit file paths relative to the caller's working directory. Ship authored JSON and schema in the package; build/package checks must verify every required asset and run startup from an extracted package outside the repository working directory. Test paths containing spaces.

Add JSON/schema formatting and deterministic validation to the existing verification gates. Preserve the seven-gate order, zero-warning standard, and observational dashboard behavior; do not create a separate competing verifier.

## 11. Ordered delivery slices for later ticketing

Each slice must produce reviewable behavior and focused tests. Keep all work local until a separate publishing request. The dependency order below is for delivery, not a request to create issues now.

### A — Lock the migration contract and baseline

Inventory every current authored branch across engine, prompts, tools, narration and commands. Produce the final supported condition/effect catalog and content-to-code map. Capture synthetic chapel command/AI replay fixtures for the latest supported behavior and inventory all historical tuples. Define new-state semantic comparison fields, preserving roll/event ordering, discoveries, checks, HP, placements, fate and completion.

**Acceptance:** every behavior in section 6 has a data representation and regression scenario; old fixtures replay before refactoring; the positive dependency analysis and compatibility isolation strategy are specified. No gameplay switches yet.

### B — Validate and run an external Signet adventure

Implement the loader/schema/diagnostics, generic session/action mechanics required for Signet, local file selection and validation-only mode. Externalise Signet rooms, door, actor, item, weapon, starting state and exit objective. Include generic rendering, tool projection, and the format-4 command/AI replay foundation in this slice so the first external adventure is diagnosable. Keep ordinary built-in selection on its existing runtime until final parity.

**Depends on:** A. **Acceptance:** external Signet can be completed and lost through CLI and scripted AI, without source changes or provider access; seeded mechanics match the baseline; malformed files fail before play; new traces replay after removing the source file; historical traces remain exact.

### C — Load chapel exploration, investigation and dialogue

Add only the remaining schema/runtime capabilities needed for chapel locations, clues, journal, conditional NPC conversations and one-attempt social checks. Externalise aliases, facts, sources, voices, replies, and independently searchable fallback evidence. Include bounded dependency analysis and rejected-content fixtures.

**Depends on:** B. **Acceptance:** chapel's public route is playable from data; successful and failed social attempts behave correctly; changing approach cannot reroll; failed persuasion leaves the physical route; hidden facts and unavailable targets stay out of all public/model projections and are rejected on forged dispatch. All new actions replay.

### D — Complete chapel combat, rescue, casualties and endings

Add typed healing use, encounter consequences, rescue relocation, corpse searches, conditional ending consequences and terminal freeze. Externalise post-ledger/post-rescue guidance and ending-intent labels. Use shared combat rules for guardian and NPC opponents.

**Depends on:** C. **Acceptance:** both endings, potion/defeat, evidence fallback, each NPC casualty route, Tavi death before/after rescue, and post-completion reads work through the external file. No rerolls, duplicate effects, false rescue, dead-speaker replies, or dead-Oren commitments. Qualified potion/ending intent regressions and scripted provider recovery pass. Every route exports/replays format 4.

### E — Prove independence and complete the runtime separation

Create a tiny regression adventure with unrelated IDs and prose, a different map/start location, a different clue order, a gated speaker, healing item, encounter and two ending choices. At least one ending must use a different prerequisite structure from chapel. Include a renamed/reordered variant to expose hidden ID/order assumptions. Keep content brief; this is a contract fixture, not a new showcase adventure.

Move both ordinary built-in selectors onto the generic loader/runtime after their parity checks pass. Remove active chapel/signet-specific paths from current engine, prompt, tool and rendering modules. Preserve isolated historical adapters and tests. Finish package asset handling.

**Depends on:** D. **Acceptance:** the fixture is loaded by file with no TypeScript edit or runtime registration, completes via CLI/scripted AI, and replays; built-in and explicit-file versions agree; multiple independent sessions work; a source/import audit finds no current content coupling. Historical fixtures still pass. Extracted-package startup works away from the repo.

### F — Qualify, document and hand off

Document authoring, supported predicates/effects, diagnostics, logical-analysis limits, CLI modes, content/version identity and replay. Run full verification and clean-checkout/package checks. Perform a bounded live regression campaign and a manual playthrough focused on migrated guidance and choices. Record actual results and unresolved gaps.

**Depends on:** E. **Acceptance:** all completion gates below have evidence, commands, seeds and checked-in synthetic inputs. No generated/untracked content is needed. Any live/human gate that cannot run is explicitly outstanding, never inferred from scripted tests.

The slices are intentionally larger than future issues. When applying to-tickets, split by independently testable behavior within each slice; preserve loader/runtime/trace integration and do not defer all regression protection to F.

## 12. Verification and acceptance matrix

| Concern | Required evidence |
| --- | --- |
| Format correctness | Valid minimal and complete definitions; malformed JSON, duplicate keys/IDs, unknown fields/versions, missing start, invalid numeric limits, missing/wrong-kind references and ambiguous aliases. |
| Logical checks | Missing producers, unreachable required route, impossible positive cycle, valid initially seeded cycle, alternate branch, and a documented analysis-limit result. |
| Serialization | Parse → canonical serialize → reload retains the same definition and digest; stable initial state and same seeded scenario results; authoring order cannot accidentally change semantics. |
| Runtime parity | Both existing victories/defeats, Signet door/exit, chapel social retry lock, evidence bypass, journal provenance, healing consumption/retaliation, rescue and casualty endings. |
| Public information | Startup/look/inspect/help/tool definitions, forged calls, journal, speaker facts/history, fallback narration and terminal reflection do not leak unreleased facts. |
| AI orchestration | Scripted full journeys; ambiguous/negated endings; explicit collection; invalid/batched/over-budget calls; provider failure before and after a committed mutation; local recovery without double effects. |
| Replay compatibility | All historical tuples/fixtures exact; format 4 command and AI self-contained replay; invalid/tampered content, metadata, calls, results, draws and states rejected. |
| Independence | Third adventure plus renamed/reordered variant; no content-specific current runtime branch; fresh sessions do not share state. |
| Distribution | Clean checkout install/verify/build; bundled and external-file startup, validation and replay; extracted package run outside repo with paths containing spaces. |

Run focused tests per slice, then `npm.cmd run verify` for the integrated implementation. Preserve the ordered formatting, lint, typecheck, static analysis, tests, security/dependency/package, and build/package gates with zero warnings. No live-provider calls enter canonical verification.

For live qualification, reuse the existing evaluator and reviewed scenario definitions, adapting runtime selection and trace metadata. Cover both endings, social failure fallback, post-rescue Mara, item collection and casualty truthfulness; inspect the emitted request projections as well as prose. Keep the configured model and prior quality thresholds, record model/prompt/tool/content versions, and allow at most two evidence-led correction rounds before recording unresolved failures. Do not assume an existing chapel-specific evaluator automatically evaluates arbitrary adventures.

## 13. Concrete manual handoff

Prerequisites: declared Node.js 24.x and npm version, clean installation and build; API credentials only for live play. The implementation must check in short synthetic journeys for new coverage and provide actual passing seeds, rather than placeholders.

1. Validate `adventures/chapel.json`; expect success with no warnings and no interactive session. Validate fixtures with a missing location and a circular required clue dependency; expect precise paths/codes, nonzero exit, and no provider call.
2. Start default chapel and explicit `--adventure-file` chapel. Use `help`, `look`, `journal`, and `status`; expect matching public choices and no hidden ledger/motive. Existing `docs/acceptance/inputs/chapel-public-social-fallback.txt` with seed 7 and `chapel-confidential.txt` with seed 0 provide baseline full journeys; preserve these seeds unless a separately justified rules change is agreed.
3. Run the existing potion/defeat input with seed 15 and Oren-casualty input with seed 0 against the external file; expect the recorded mechanical outcomes and truthful ending consequences. Replay each new trace.
4. Rescue Tavi and speak to Mara at the inn; expect current rescued-state guidance. Attempt an ambiguous or negated ending in AI/scripted mode; expect no resolution until an explicit valid choice. Inspect final journal/status and try another mutation; expect readable final state and no further gameplay change.
5. Run the checked-in provider-failure script against the new runtime; expect a committed discovery exactly once, followed by working local recovery controls and model-free replay.
6. Copy the independence fixture to a path containing spaces, change a public description and supported ending requirement, validate and play without rebuilding. Expect the edited content/requirement to apply. Export a trace, move/delete the copied source, and replay; expect success using the embedded original content.
7. Start both built-ins and validate/load an external adventure from an extracted package outside the checkout. Expect all assets present and no reliance on the repository current directory.

These steps complement automated CLI journeys. Human review should focus on readability, truthful state-dependent guidance and choice intent. No new claim about session length or enjoyment is required by this architecture increment.

## 14. Completion criteria and main risks

Increment 4 is complete when:

- Both existing adventures are externally authored and normally run on one generic engine.
- The independent fixture needs no runtime code/registration, and active modules contain no adventure identity branches.
- Validation rejects structurally invalid, unsupported and demonstrably impossible required content, with documented logical limits.
- Hidden knowledge, social retry rules, casualty truthfulness, explicit choices and deterministic outcomes survive migration.
- New self-contained traces replay, and all released historical traces remain readable with their original semantics.
- Data assets work from a clean checkout and extracted package; canonical checks pass with zero warnings.
- Manual/live regression evidence and author documentation are supplied, with outstanding limitations stated explicitly.

The largest risks are under-modeling authored behavior (which leaves special cases in code), over-modeling it (which creates a scripting platform), and changing replay semantics while extracting shared logic. Counter these with the behavior inventory, finite vocabulary, early external Signet slice, explicit legacy isolation, and structurally different fixture. Keep new rules or general adjudication out of this increment; a newly discovered requirement must first be justified by an existing supported behavior.
