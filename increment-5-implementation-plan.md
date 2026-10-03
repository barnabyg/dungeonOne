# Increment 5 — Generate Tiny Adventures

## 1. Proposed outcome

A player enters a short premise such as “smugglers at an abandoned temple,” receives a generated, validated adventure file, and can start it through the existing data runtime. Generation finishes before play begins. The resulting file is an ordinary schema-3 adventure: it can be validated, inspected, played offline in command mode, played through the opt-in AI DM, copied, and included in a self-contained format-4 trace. The live DM cannot add hidden canon or repair the document during play.

This is an implementation plan for later ticketing, not a set of implementation issues. It does not authorize publishing or create GitHub issues.

## 2. Project baseline and implications

Reviewed the repository at local `main` revision `efb3520` on 27 September 2026, the high-level roadmap, increment-4 handoff, schemas, loader, progression analysis, CLI, tests, and live-DM evidence. This planning task did not rerun executable verification. The clean-checkout 366-test, seven-gate result in `docs/acceptance/issue-53.md` is prior evidence.

| Existing capability | Implication for generation |
| --- | --- |
| Built-in chapel and Signet, and the independent observatory, run as validated JSON through `createDataRuntime`. | Generate the current supported document format; do not create a second play engine or generator-specific runtime callbacks. |
| Schema 3 with `chapel-clues-rules-v4` supports discoveries, conversations, checks, one active opponent per location, healing, casualties, and two authored endings. | Constrain generated content to these mechanics. A 3–5 location adventure can offer 1–3 encounters, but no room may require simultaneous opponents. |
| The loader rejects malformed/oversized input, duplicate keys, broken references, unsupported rules, and some impossible progression. | Reuse it as the first hard gate. A valid document still needs executable route checks and editorial review. |
| Positive progression analysis marks combat, social outcomes, actor state, and relocation as `analysis-incomplete`. The shipped chapel and observatory carry route-backed warnings. | Do not equate `ok: true` or warning-free output with solvability. Resolve every generated warning with a route witness or reject the candidate. |
| Format-4 traces embed a validated snapshot and digest; formats 1–3 remain readable. | Generated adventures require no trace-format change. Verify replay after removing or moving the source file. |
| The live DM campaign qualifies the data chapel only, and the default model is configured for DM play. | Generation needs its own model identity, prompts, evidence, costs, and evaluation. Chapel DM scores do not qualify generated content or an arbitrary new model. |

## 3. Scope and constraints

Generate one central problem in **3–5 locations**, with **3–5 distinct NPCs**, **1–3 supported single-opponent combat encounters**, several obtainable clues, and **at least two genuinely different resolutions**. At most one encounter should be mandatory on the supported completion routes. Every mandatory clue must have an obtainable route that does not depend on a successful social roll or the survival of one NPC. The player must be able to understand the goal, find the next lead, and explicitly choose an ending. The generated story can vary in names, layout, motivations, clue order, optional challenges, and consequences; it must remain inside the current rules vocabulary.

The initial generator accepts a bounded text premise and uses an explicitly selected or configured generation model. It creates a new local JSON file only after all hard gates pass. Generation may require network access and credentials; playing the saved result does not. Keep the normal chapel startup, `--adventure-file`, validation, replay, and historical trace readers unchanged.

Defer new classes, spells, multi-enemy combat, dynamic rules, arbitrary scripts, clocks, long-session memory, save/resume, remote adventure publishing, and on-demand canon invention. Do not weaken schema validation merely to accept model output. Authoring and repairing must use the existing supported schema and rules tuple. If a narrow schema improvement proves necessary, version it deliberately and keep older documents and traces readable.

## 4. Player and author flow

1. The player provides a premise and a destination, for example `--generate "smugglers at an abandoned temple" --output <path>`. The exact CLI names can be settled in the first slice. Generation is mutually exclusive with play, replay, validation, and trace options.
2. Before calling the provider, reject an empty/oversized premise, an invalid destination, missing credentials, or an existing destination unless the user explicitly chose replacement. Do not spend a model call on invalid arguments. Make model, timeout, and attempt limits visible.
3. Generate a complete schema-3/rules-v4 candidate in a bounded response. Parse it as untrusted input and run the normal loader. Keep failed candidates and diagnostics only in a bounded, ignored diagnostic area; never offer them as playable files.
4. Run deterministic quality gates, including route witnesses for two resolutions. If the candidate fails, send compact diagnostic codes and paths plus the relevant candidate fragment to a repair pass. Limit repair to two attempts after the initial generation. Each attempt reruns all gates from the start; a changed premise or candidate cannot inherit earlier passes.
5. If a candidate passes, write the canonical validated document atomically to the requested path and show its ID, digest, model, attempt count, warning/route summary, and copyable validation/play commands. A failed run exits nonzero and leaves the requested output untouched.
6. The player starts the file through `--adventure-file`. Command and AI modes share the same validated adventure. No generation provider is invoked during a play session.

Use the existing official OpenAI SDK adapter conventions for timeouts, bounded retries, provider-failure classification, no stored provider response where supported, and sanitized diagnostics. Keep generation prompts and output types separate from DM prompts and tool schemas. Never send local secrets, unrelated adventure files, hidden campaign data, or previous player transcripts to the generator. The premise is untrusted text, not an instruction that can change rules, tool authority, output path, or validation policy.

## 5. Generation contract

Start with **direct generation of the current adventure document**, with a strict output shape and a compact authoring guide in the generation request. This avoids a second, subtly different adventure dialect. The model supplies content and supported data; a deterministic preparation layer may normalize only harmless representation details such as whitespace and generated ID casing before validation. It must not silently invent missing clues, endings, encounters, or rules. Substantive repair should be visible as another model attempt and then independently checked.

The generation contract should require:

- A connected directed map with a reachable starting location and explicit location purpose.
- Stable unique IDs/aliases, distinct NPC voices and knowledge limits, and no alias collisions.
- A private fact ledger: what is true, who knows or believes it, where evidence is found, and what releases each fact. Public prose must not reveal secrets before those conditions.
- A clue graph with an initial lead, at least two independent evidence sources for the central problem, and a supported path to each ending. Optional clues may enrich a route but cannot be the only unguarded route to completion.
- Finite searches, topic replies with unconditional fallback, supported checks/effects, explicit resolution aliases, truthful consequences, and no claim that a future promise has already happened.
- Encounter placement and statistics within the supported rules. No encounter should block its own prerequisite clue. The mandatory route must remain possible after a failed check; an NPC casualty must not silently make the only ending unreachable.
- A generated content ID and version that cannot collide with bundled IDs, plus a clear title, objective, introduction, and terminal narration. IDs and versions are metadata; the digest identifies the exact document.

Template prose and player-visible action hints are part of content review. Generated text that asserts an unsupported action, unavailable exit, already collected item, unreleased secret, or false actor fate fails quality review even if the JSON validates. The generator must not claim D&D mechanics outside the implemented rules.

## 6. Validation and executable quality gates

Keep a structured result per attempt with a stable reason code and concise path. Candidate content may contain hidden facts and user text, so keep raw drafts out of console errors and source control.

| Gate | Required evidence |
| --- | --- |
| Parse and contract | Response size/depth bound; exactly one JSON document; `loadAdventure` succeeds; schema/rules tuple is supported; no duplicate keys, unknown fields, broken references, ambiguous aliases, or unsupported mechanics. |
| Shape | 3–5 locations, 3–5 NPCs, 1–3 encounters, one central objective, an initial lead, several clues, and at least two eligible, distinct ending choices. Count actual reachable/placed entities rather than prose mentions. |
| Static progression | No error diagnostics. Each warning has a named route witness or the candidate fails. Check independent evidence paths, unreachable locations, missing producers, shadowed replies, cycles, and prerequisite self-locking. |
| State exploration | A bounded, model-free route checker acts on the *real runtime*, not a parallel interpretation of the JSON. It records legal actions, seeded draws, states, and outcomes. It finds a witness for each ending and a route after a failed social challenge; it verifies that blocked and read-only actions do not mutate state. Search budgets and unsupported cases are explicit failures, not silent passes. |
| Combat and resources | Execute mandatory combat with a documented seed set and check that at least one seeded route survives to each ending; report defeat cases. Verify one-use healing and rejected actions when present. Do not claim success for every seed. |
| Information and narration | Inspect public scene/tool projections at each witness step for unreleased facts, inaccessible targets, stale locations/items, and wrong fates. Check both command rendering and scripted-DM fallback. An optional AI critic may flag story holes, but cannot override deterministic failures. |
| Artifact | Reload the written file, compare digest, play both endings, export format-4 traces, and replay after the source file is absent. |

The route checker should use the runtime's public action surface and generic IDs. Bound turns, states, random seeds, and wall time so a malformed adventure cannot cause an indefinite search. Prefer a small enumerator of existing supported actions and document its coverage limits. Do not treat a simulated impossible attack roll or unseen NPC as a legal shortcut. When exhaustive search is not feasible, retain explicit witnessed routes and name what remains unproven.

## 7. Reliability and story-quality evaluation

Before choosing a default generation model or claiming the exit criterion, freeze a small, varied premise set and evaluation protocol. Include investigation, rescue, negotiation, and combat themes; a premise with adversarial instructions; a vague premise; and one that asks for unsupported mechanics. The generator should translate unsupported requests into the supported profile or clearly reject them. Store the exact prompt, model, schema/rules/engine versions, attempt settings, candidate digest, diagnostic codes, repair history, route seeds and action traces, elapsed time, and token use in a sanitized, ignored report. Do not store credentials, SDK payloads, or private provider errors.

Run **at least 30 independent generations** across the frozen premise set, counting every initial request, including failures and provider errors. A qualifying pipeline should produce **at least 24/30** playable artifacts within the initial request plus two repairs, with both ending witnesses, a failed-social fallback witness, and source-independent replay. Also report first-pass success, repair success by attempt, failure categories, generation time, and token cost; the aggregate cannot hide a premise category that repeatedly fails. Treat the 80% threshold as a provisional product gate, not a statistical guarantee for all prompts.

For a smaller blind human review, have unfamiliar players complete several generated adventures spanning different premises, without developer hints. Record whether they understood the goal, found a clue, reached an ending, recognized the choice, and encountered contradictions or dead ends. Ask separately whether the scenario was interesting enough to finish. Reviewers should flag repetitive structures and hollow choice differences; automated completion alone does not establish enjoyment. Do not infer 30–60 minute duration or broad content quality from the tiny generated scope.

Evaluate live DM behavior on a bounded sample of generated files only after command-mode qualification. Review projected requests, tool calls, prose, secret withholding, item/actor continuity, and ending choice. Keep this live evidence separate from canonical verification and from the existing data-chapel campaign. Missing credentials or human observations must be reported as outstanding evidence, not silently replaced by scripted tests.

## 8. Delivery slices for later ticketing

Each slice should be a focused implementation issue with its own acceptance tests and, if commits are requested, its own commit. These are work boundaries, not issue text.

1. **Generation entry point and safe output.** Add bounded premise/options parsing, explicit provider configuration, output-path policy, failure codes, temporary diagnostic storage, and atomic final write. Prove no file is promoted and no model call is made on invalid input. Dependency: current loader/CLI only.
2. **Schema-3 generation request.** Version a generation prompt and strict response shape; produce candidate documents for a few fixed premises, with distinct IDs, cast, map, clues, and endings. Confirm the provider response is never executed or treated as authoritative. Dependency: slice 1.
3. **Hard validation and feedback.** Apply the existing loader and shape checks, map diagnostics to concise repair feedback, and preserve version/digest metadata. Reject unsupported rules and all errors before play. Dependency: slice 2.
4. **Bounded repair loop.** Retry only on actionable failure, at most twice, with a full recheck and safe provider-failure handling. Show why attempts failed without printing hidden content. Use mocked responses for initial-invalid/repaired-valid, repeated-invalid, malformed, timeout, and refusal cases. Dependency: slice 3.
5. **Runtime route witnesses.** Implement bounded legal-action exploration on the current runtime; prove both endings, the independent physical-clue path after a failed check, and warning coverage. Add deliberately unsolvable fixtures: circular clue, mandatory dead NPC, combat-gated self-prerequisite, hidden-only target, and misleading alternate ending. Dependency: slice 3; integrate into slice 4's acceptance.
6. **Continuity and replay qualification.** Check public projections along witnesses; exercise combat/healing, terminal freeze, command and scripted-AI journeys, atomic output reload, format-4 replay after deleting the source, and older trace formats. Dependency: slices 4–5.
7. **Batch evaluation and optional critic experiment.** Freeze premises, run the 30-generation protocol, report first-pass and repaired yield, diagnose recurring failures, and decide from evidence whether an AI critic adds value. A critic is advisory and may be omitted if it adds cost without finding actionable defects. Dependency: slice 6.
8. **Player review, live DM sample, and handoff.** Review generated adventures with unfamiliar players, run a bounded live sample, fix evidence-led issues, document supported scope/cost/privacy/commands, and perform clean-checkout install, full canonical verification, package/startup, and offline replay checks. Dependency: slice 7.

If an early slice shows that direct schema generation repeatedly fails for structural reasons, record those failure categories before changing approach. A bounded blueprint plus deterministic compiler is a possible follow-up, but it should replace the direct-output contract deliberately, with its own version and proof that it cannot silently alter story facts. Do not start by building a general procedural authoring framework without that evidence.

## 9. Exit criterion and handoff

Increment 5 is complete when a player can request a small adventure, receive a validated file without hand editing, play it to either ending through the normal runtime, and replay the diagnostic trace after the file is removed; the frozen batch meets the stated yield gate; human review finds no blocking dead end or continuity failure in its sampled adventures; and any required live-DM qualification is recorded with its actual limits. The canonical zero-warning verification and clean-checkout/package checks must pass. Record unresolved generator failure modes, provider availability, cost, seed-dependent combat outcomes, and the limits of route search and human sampling.

The result remains a tiny single-session adventure. Persistent consequences, save/resume, clocks, and open-ended DM judgment belong to later increments.
