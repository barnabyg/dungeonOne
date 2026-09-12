# Increment 3 — A Small but Enjoyable Adventure

Status: proposed plan for review and later conversion into implementation issues. This document creates no issues and makes no implementation changes.

Source: [the high-level implementation plan](dnd-ai-dungeon-master-implementation-plan.md), especially increment 3 and the delivery principles. Reviewed against the current source and checked-in acceptance evidence on 12 September 2026, at commit `6e0b77e`.

## 1. Recommendation and project review

Build one authored, terminal-based missing-person adventure, provisionally **The Bell Beneath the Chapel**. Target a first playthrough of 30–60 minutes through investigation, three distinct NPCs, one required fight, a healing potion, and a consequential decision with two authored resolutions.

Keep the prebuilt Fighter, existing combat model, production model adapter, and bounded DM turn. Add only the rules and state needed for this adventure. Preserve The Stolen Signet as an explicitly selectable regression adventure. Do not bring forward the external adventure loader from increment 4 or save/resume from increment 6.

### What is already usable

| Existing implementation | Implication for increment 3 |
| --- | --- |
| `src/session.ts`: immutable authoritative transitions, typed actions/events/rejections, stable-reference action seam | Extend this boundary; dialogue, clues, healing, and endings must not become model-owned state. |
| `src/game-tools.ts`: strict state-derived tools, reference validation, scene/status projections | Extend projections and tools. Continue checking legality in the engine even for offered references. |
| `src/dm-turn.ts`: provider-neutral model port, one mutation attempt per submission, bounded reads/history, deterministic recovery | Retain the execution budget and committed-action recovery. Treat dialogue and clue discovery as potential mutations. |
| `src/combat.ts` and `src/random.ts`: deterministic attacks, initiative, seeded rolls | Reuse for a second monster type and authored social checks. Keep one active opponent. |
| `src/play.ts`, `src/parser.ts`, `src/presenter.ts`: terminal interaction and separate mechanics | Deliver status, journal, and conversation improvements here; a web UI is unnecessary for this increment. |
| `src/trace.ts`, `src/replay.ts`: versioned command/DM exports and model-free replay | New state and actions require explicit version dispatch and old-adventure compatibility. |
| Interpretation library, scripted model, evaluator, CLI tests | Extend existing harnesses with multi-scene dialogue and investigation cases. |

### Gaps that affect the plan

1. **Content assumptions extend beyond `adventure.ts`.** IDs are closed unions; initial placements, victory requirements, combat outcomes, prompt wording, presentation, and replay assume the signet dungeon. A small built-in adventure selection seam is necessary now. Complete engine/content separation remains increment 4.
2. **There is no dialogue or knowledge model.** Current visibility covers rooms and objects, not different speakers' knowledge, beliefs, motives, or reveal conditions. Adding NPC biographies to the global prompt would expose secrets before the engine authorizes disclosure.
3. **Inspection currently has read-only semantics.** An investigation cannot quietly write discovered clues through an action that the DM loop still counts as a read.
4. **Inventory items cannot be consumed.** Healing needs an explicit consumed placement/state, an atomic HP/resource transition, and a combat action cost.
5. **Replay uses the current session factory and tools.** Merely replacing `ADVENTURE` or incrementing a version string would break historical exports.
6. **Live prose quality remains a separate risk.** Issue #23 records successful human acceptance with the current default model. Issue #22 also records an older candidate passing isolated evaluator cases while contradicting completed actions in full playthroughs. Neither result establishes quality for NPC roleplay or a longer adventure.

The recorded increment-2 clean-checkout baseline is 161 passing tests and seven zero-warning gates in [issue #23](docs/acceptance/issue-23.md). This planning review inspected source and evidence; it did not rerun verification or perform a new live model evaluation.

## 2. Proposed adventure and player journey

### Premise

Tavi, a village apprentice, disappeared while investigating strange sounds beneath a ruined chapel. The innkeeper asks the Fighter to find them. A ferryman conceals a related wrongdoing: he diverted chapel repair money to buy medicine, leaving unsafe works unfinished. Tavi followed the missing ledger into the crypt and became trapped behind an awakened skeleton guardian.

The final decision concerns public accountability versus a private restitution agreement. Finding Tavi and learning the truth should create reasons to consider both, rather than presenting an unexplained ending menu.

Names and prose are proposed content defaults. Their replacement must preserve the dependency and failure contracts below.

### Bounded content budget

- Five locations: village inn, ferry landing, chapel path, ruined chapel, and crypt.
- Three speaking NPCs: Mara the innkeeper, Oren the ferryman, and Tavi the missing apprentice.
- One main quest with a few explicit milestones; no side-quest framework.
- Four substantive discoveries: the chapel lead, evidence of unsafe repairs, the diversion ledger, and Tavi's fate/testimony.
- One required skeleton encounter. The existing goblin remains in The Stolen Signet, providing coverage for both monster types without padding the new adventure with another compulsory fight.
- One healing potion, available on the chapel path before combat.
- Two authored resolutions, each with casualty-aware variations; fighter defeat is a separate terminal outcome, not one of the two advertised endings.

### Intended session

| Beat | Player activity | Approximate first-play time |
| --- | --- | --- |
| Arrival | Meet Mara, understand the disappearance, learn how to check status and notes | 5–10 minutes |
| Investigation | Speak with Oren, choose an approach, inspect independent physical evidence | 10–15 minutes |
| Chapel | Explore the ruins, find the potion, understand the danger | 5–10 minutes |
| Crypt | Fight the skeleton, investigate the ledger, resolve Tavi's situation | 5–10 minutes |
| Return | Compare accounts, choose a resolution, see concrete consequences | 5–15 minutes |

These are playtest targets, not timers or minimum turn counts. Do not add repeated checks, compulsory backtracking, lengthy prose, or extra encounters to inflate duration. Experienced replay may be much shorter.

### Navigation and failure routes

The inn connects to the landing and chapel path; the path leads to the chapel and then the crypt. Movement into the crypt starts the guardian fight using existing initiative behavior. Its defeat opens access to Tavi and the ledger. Returning to the inn is possible after the fight.

The main quest is active at startup so killing or ignoring Mara cannot prevent it from starting. A public missing-person notice at the inn provides the chapel lead without a social roll. A searchable damaged repair notice at the chapel corroborates Oren's involvement. The ledger is accessible after the guardian is defeated, independent of any NPC's cooperation or survival.

Rescuing a living Tavi is an explicit authored interaction after combat; it moves Tavi safely to the inn in that same transition. This is a fixed scene transition, not an escort simulation. If Tavi is dead, examining their remains records their fate and the quest can still reach a resolution with different text. Dead NPCs cannot converse or be rescued.

### Two consequential resolutions

Both require the ledger to be discovered, Tavi's fate to be established, and the player to return to the inn. Neither requires an NPC to be alive: the public noticeboard is the durable interaction point.

1. **Expose the diversion:** publish the evidence. Record public disclosure and an initiated village inquiry. The ending states the medicine motive, the accountability consequence, and Tavi's actual fate.
2. **Seek private restitution:** lodge the evidence privately with the village trustees. Record confidential referral and a repair/restitution request rather than public disclosure. If Oren is alive, his authored response can commit to restitution; if dead, describe a trustees' review, never a promise from him.

The engine records distinct resolution IDs and their immediate consequences. Narration must not claim money was paid, repairs completed, or an absent authority took an unmodeled action. These are bounded endings, not a simulation of the village's future economy or relationships.

Show both available choices and their known stakes before commitment. “Tell everyone about the ledger” can commit directly when unambiguous; “deal with Oren” requires clarification. Do not infer the ending from tone or a persuasion result. After resolution, freeze gameplay mutations and retain final-state reads.

## 3. Scope and startup contract

Keep command mode as a complete offline route through the new adventure, with deterministic dialogue text. Live AI supplies interpretation and expressive roleplay over the same actions. Scripted AI remains the deterministic test seam.

Proposed startup behavior:

```powershell
# New default adventure, offline or live
npm.cmd start -- --seed 0
npm.cmd start -- --ai --seed 0

# Explicit built-in selection, including the regression adventure
npm.cmd start -- --adventure chapel --ai --seed 0
npm.cmd start -- --adventure stolen-signet --seed 0

# Replay chooses content/rules from trace metadata
npm.cmd start -- --replay .\session-trace.json
```

`chapel` is the proposed CLI selector; the internal adventure ID and version must be stable. Unknown selectors fail clearly before model use. Reject conflicting replay/play options. Preserve `--model`, `--seed`, `--trace`, local `help`, local `quit`, and EOF behavior.

Switch the default only when the complete new slice passes its handoff gates. Update old documented playthrough commands to select `stolen-signet` explicitly. Existing traces choose their original adventure without needing a new flag.

No new classes, levels, spellcasting, saves, skill list beyond the three social approaches, group combat, tactical movement, retreat system, death saves, economy, equipment switching, or general improvisation engine.

## 4. Authoritative state and module boundaries

Add the smallest typed structures needed for:

- Adventure identity and content/rules versions.
- NPC position and life/HP state, plus authored conversation progress.
- Discovered facts with their source and whether they are observation, testimony, or belief.
- Social attempt results keyed by NPC and authored challenge, preventing retry farming.
- Quest milestones, Tavi's fate, and the chosen resolution.
- Item placement including `consumed` for the single potion.

Keep static NPC definitions, dialogue opportunities, evidence, and ending text in authored content modules. Store changing facts in session state. Prefer small discriminated records and named conditions over an extensible condition language or arbitrary JSON effects.

Use one canonical life state for any attackable NPC; do not duplicate HP between dialogue and combat records. Generalize combatant instance identity just enough to distinguish a skeleton, a goblin, and an authored NPC. A monster type is its definition; an encounter participant is an instance.

Extend the existing action handler with focused helpers for conversation, discovery, checks, item use, and quest resolution. All consequences of one accepted action commit atomically and emit ordered events. Quest changes triggered by death or discovery occur in that transition, not in a later model call. No tool accepts arbitrary HP, DCs, fact text, quest state, or outcome flags.

Pass a selected built-in adventure/runtime through startup, rules, projection, presentation, and replay. Avoid a mutable global “current adventure.” Limited named chapel-specific predicates are acceptable in an authored module. External files, a generic loader/schema, condition DSL, editor, and full separation of every content rule are explicitly deferred to increment 4.

## 5. Dialogue, social checks, and knowledge boundaries

### NPC definitions

For each NPC, author separate fields for:

| Field | Meaning | Example |
| --- | --- | --- |
| Knows | Facts personally known to the NPC | Oren diverted repair funds and bought medicine. |
| Believes | Claims the NPC considers true, not necessarily canon | Mara thinks Tavi went to the ferry. |
| Wants | Motivation that guides authored responses | Oren wants to protect the medicine recipients and avoid exposure. |
| Reveals | Exact claims permitted under named conditions | Oren admits the diversion after a successful social challenge or presentation of the ledger. |

Mara can report Tavi's disappearance and her mistaken ferry lead, but cannot reveal Oren's motive. Oren knows the diversion and chapel route, but does not know Tavi's current condition. Tavi knows what happened in the crypt, but cannot report later conversations at the inn. Journal entries identify their speaker/source; a belief is never silently promoted to an observed fact.

### Conversation action

Use a bounded action such as `talk(npc_id, topic_id, approach)`, where approach is `ask`, `persuade`, `deceive`, or `intimidate`. Topic IDs represent public discussion subjects, not secret-bearing labels such as `oren-stole-funds`. The engine owns which authored challenge, if any, applies.

Ordinary greetings, repeating released information, and already-authorized answers need no roll. An authored social challenge can release a fact and advance a milestone, so **all talk attempts consume the one mutation-attempt budget**, even when the result happens to leave state unchanged. Return a structured response containing the speaker, permitted claims, attitude for this response, optional check result, and newly released information. Offline presentation supplies a complete authored reply.

Each social approach must have at least one valid, authored use in the adventure. For Oren's guarded account, persuasion appeals to finding Tavi, deception uses the specific pretext that the records have already been checked, and intimidation threatens public scrutiny. A deception success changes Oren's response; it does not make the player's fabricated claim true. Unsupported bargains and threats receive a coherent bounded response, not invented mechanical effects.

### Check rules and retry policy

- Use one seeded d20 plus a documented fixed Fighter social modifier. Proposed starting balance: +1 for each supported social approach and DC 11 for Oren's challenge; these are game-specific initial values, not a claim of complete tabletop rules compliance.
- Success is total greater than or equal to DC. Natural 1 and 20 have no additional social-check rule in this slice.
- The engine chooses the modifier and DC from authored definitions. The model chooses a supported intent/approach, never a difficulty or result.
- One resolved attempt across all three approaches for Oren's guarded-account challenge. Rephrasing, switching skills, leaving, and returning do not grant another roll.
- Presenting newly discovered ledger evidence bypasses that guard through an authored no-roll condition; it does not reset the challenge for another random attempt.
- Failure withholds the guarded admission but leaves the public chapel route and physical evidence available. Repeated requests return the remembered response without new draws.
- Invalid targets, impossible approaches, ambiguity, and terminal mutations consume no randomness. A legal check consumes exactly one d20 and records it.

Show skill, die, modifier, total, DC, and success/failure in Mechanics. Do not expose unrevealed conditions or a secret explanation of why a topic is guarded.

### Model information flow

Do not send the complete adventure, NPC knowledge tables, hidden reveal predicates, or undiscovered fact text to the model. Filtering must apply to prompts, schemas and descriptions, tool results, errors, transcript reuse, and fallback text—not just the scene object.

Separate the **intent request** from the **NPC reply request** within the existing DM turn module:

1. Interpret player intent using visible scene, public topics, character state, and bounded player-known context.
2. Dispatch the authoritative talk action, resolve the check/reveal once, and commit its events.
3. Generate the NPC reply from that speaker's approved response facts and voice only. Start a fresh request context rather than carrying forward the routing request's tool chain or unrestricted transcript.

The NPC reply request must not receive another NPC's dialogue, the full player journal, unreleased private motives, or the router's conversation history. Provide only the current addressed utterance and a bounded speaker-scoped history of authorized statements. A player's assertion is attributed untrusted speech; hearing it does not establish its truth. Out-of-topic assertions should receive an authored uncertainty response.

This is request scoping through the existing adapter, not a new autonomous agent or model provider. Include both stages in the existing four-response ceiling; normal talk uses one routing response and one reply response. Preserve the one-mutation budget. If the reply fails, display the committed authored reply and exact mechanics without retrying the action.

Prompt rules alone cannot prove that generated prose never invents a secret or endorses a player's false claim. Boundary tests prove what data was supplied; live semantic evaluation separately assesses what the model says. For guarded disclosures, keep the factual claim in deterministic authored dialogue and allow AI expression only around the permitted facts. If live testing still finds leakage or contradiction, ship authored replies for the affected dialogue class until a bounded fix passes. Do not weaken disclosure conditions to accommodate the model.

## 6. Investigation and quest progression

Keep `look`, `inspect`, status, and journal reads idempotent. Add a distinct discovery action, proposed `search(target_id)`, for examining authored evidence sites and recording discoveries. Natural-language “inspect the repair notice carefully” may map to `search` when its purpose is discovering evidence; superficial descriptions remain available through `inspect`.

The dispatcher and DM turn budget must classify `search` as a mutation attempt. Essential physical clues are automatic on a valid search; no new perception/investigation skill is required. Repeated search returns the already-discovered result without duplicate journal entries, quest events, rewards, or rolls.

Define named quest milestones rather than a fragile strictly linear stage:

- chapel lead discovered;
- diversion evidence discovered;
- guardian defeated;
- Tavi rescued or death confirmed;
- resolution chosen.

Allow evidence to be discovered before speaking with the intended NPC. Revisiting an NPC after discovering the ledger exposes the evidence-backed response. Player knowledge must remain available after the eight-entry transcript window expires; reproject relevant structured discoveries instead of enlarging history indefinitely.

Each required dependency must have a written source and fallback:

| Requirement | Normal route | Failure/absence route |
| --- | --- | --- |
| Find chapel | Mara or Oren | Public inn notice; route remains navigable |
| Understand repair problem | Oren's social disclosure | Chapel repair evidence |
| Obtain conclusive diversion evidence | Search ledger after guardian fight | Same evidence available regardless of NPC survival |
| Establish Tavi's fate | Speak/rescue after fight | Inspect/search remains if dead |
| Resolve quest | Return and discuss with Mara | Inn noticeboard action if Mara is unavailable |

Killing an NPC is supported because the roadmap explicitly requires that scenario. Use the existing single-opponent combat rules with simple authored NPC statistics; no guards, witnesses, reputation simulator, or extra encounter AI. Deliberate NPC attacks can add player-triggered fights beyond the one required guardian encounter. One attack action must obey initiative/retaliation behavior rather than instantly killing by narrative fiat. Defeat of an NPC updates life state, disables dialogue, and emits any affected quest consequence immediately.

Automated alternate-route claims are conditional on the Fighter surviving combat. They do not require the game to undo death or guarantee success for every random seed.

## 7. Potion, second monster, and action economy

Add a skeleton definition with ordinary AC, HP, initiative, attack, and damage. Do not add resistances, vulnerabilities, conditions, or multiple simultaneous opponents. Replace goblin-specific combat outcome wording with combatant-based events for the new rules version while preserving historical replay semantics.

The potion is a single pickup before the crypt. Proposed effect: restore `2d4 + 2` HP, capped at maximum, and consume the item exactly once. Record each d4 and actual healing separately. At full HP, reject use without consuming it, rolling, or spending a combat turn.

Outside combat, valid use heals and consumes the potion. During combat, valid use consumes the Fighter's turn and then runs the existing opponent response if both participants remain alive. Resolve consumption, healing, retaliation, and possible defeat as one authoritative action result. Repeated, absent-item, dead-character, and terminal uses cannot heal or consume randomness. No resurrection, giving items to NPCs, shop, or carrying limit.

Keep goblin and skeleton definition tests and full playthrough coverage. Select deterministic healing and defeat seeds after the new action sequence is implemented; do not assume increment-1 seed outcomes carry over when social/healing rolls are added.

## 8. Player-facing tools and terminal presentation

Retain existing tools, with adventure-aware targets. Add only:

| Tool | Contract |
| --- | --- |
| `talk` | Visible living NPC, public topic, supported approach; resolves at most one authored conversation interaction |
| `search` | Visible authored evidence target; discovers facts atomically |
| `use_item` | Owned usable item; engine owns effect and action cost |
| `get_journal` | Read-only player discoveries, sources, quest progress, and known next leads |
| `resolve_quest` | Explicit available resolution at the inn, validated against evidence/fate/location |

Use an authored talk topic for rescuing Tavi after the fight; it has a clear rescue intent and deterministic state effect. Offer it only when applicable, and still validate conditions at dispatch. Do not add generic `reveal_secret`, `set_quest_state`, `roll_check`, `kill_npc`, or arbitrary world-mutation tools.

Provide offline command equivalents with copyable examples in help, including conversation topics and approaches. At a location, show public NPC names and suggested subjects so neither the player nor the model must guess hidden identifiers. Suggestions aid discovery; free text remains the primary AI interface.

Print a compact authoritative status line at startup and after accepted gameplay actions: HP/max HP, potion availability, combat turn when active, and quest summary. Avoid repeatedly printing the full sheet. Show speaker names on dialogue, and distinguish Mechanics, Dungeon Master narration, and Journal updates.

Make exact `status`, `inventory`, and `journal` local reads in AI mode, alongside `help` and `quit`, so these controls remain available during provider failure without using tokens. Ordinary-language questions continue through validated read tools. Record the new local read kinds in the new trace version.

The journal must list known actionable leads without revealing undiscovered secrets or solution conditions. Failed checks should leave a clear public alternative. A request outside scope should receive a short explanation and a useful supported next action. Do not silently substitute an attack, accusation, rescue, or ending choice.

## 9. Trace and replay compatibility

Before changing historical state shapes, capture small sanitized golden fixtures for currently supported format-1 command and format-2 command/DM traces, including rejected actions, victory, defeat, and failure after mutation. Preserve the existing format-1 fixture as well.

Introduce a new trace format for the new adventure/state/actions, proposed **format 3**, with explicit adventure ID/version, rules version, prompt/tool versions, seed/random algorithm, local controls, attempted calls, events, draws, and resulting state. Keep transcript/provider metadata subject to existing allowlists and privacy rules.

Replay must select the correct historical runtime from metadata. For old traces without an adventure ID, infer The Stolen Signet from their existing supported version tuple. Never replay an old trace against the new default adventure or silently reinterpret old checks/actions. Keep a narrowly frozen legacy compatibility path if adapters cannot reproduce historical state and event shapes exactly; do not maintain two implementations of the new game.

Replaying new traces resolves dialogue/checks/discovery/consumption/endings from recorded actions and random draws without calling a model. Verify event and state equality; recorded narration is display evidence, not authority. Detect tampered checks, repeated consumption, invented revelations, inconsistent endings, invalid local-read records, and unknown version tuples.

Authoritative trace state may contain spoilers. Document exports as diagnostic artifacts, not player-safe journals, and never feed trace state back into model context. Commit minimal sanitized fixtures rather than personal live transcripts. Save/load and session continuation from a trace are not part of this work.

## 10. Verification and acceptance evidence

Every behavior slice includes focused deterministic tests and a playable terminal path. Use the existing test runner, scripted DM adapter, and canonical verification command; no new dashboard or testing platform is needed.

### Required automated coverage

| Area | Required examples |
| --- | --- |
| Rules | Social success/equality/failure, exact draws, no social critical rule, retry lock across approaches; healing cap, consumption, retaliation, defeat |
| State | Duplicate clues, out-of-order evidence, rescue transition, NPC death, quest prerequisites, terminal freeze |
| Knowledge | Oren's guarded fact absent before success; successful release present; failed check absent; Mara's belief attributed; NPC cannot receive another speaker's exclusive knowledge |
| Tool boundary | Hidden/remote/dead NPC, unavailable topic, forged DC/result/fact, extra arguments, direct ending injection, stale tools after state change |
| DM orchestration | Talk/search count as mutation; compound requests; scoped reply request; provider failure before/after reveal, healing, rescue, and final choice |
| History | Revisit Oren after enough turns to evict early dialogue; only structured discoveries and the correct speaker's allowed statements return |
| Terminal | Offline and scripted-AI complete paths, status/journal with failed provider, legible check/healing output, clarification without mutation |
| Replay | Old fixtures unchanged; new successful/failed social checks, both resolutions, death fallback, potion/defeat, tampering and unknown versions |

Knowledge tests should inspect every request delivered to the scripted provider, including schema descriptions and follow-up payloads. Include an authored secret marker for exact boundary assertions, plus semantic live review for paraphrases; marker absence alone does not prove no leakage.

### End-to-end scenario matrix

Run through the actual CLI/parser or CLI/scripted-DM boundary, then export and replay the trace:

1. Successful persuasion, guardian defeat, potion use, rescue, public resolution.
2. Failed social check, attempted skill-switch retry, physical evidence fallback, private resolution.
3. Deception success and intimidation success in separate sessions; confirm each reveals only its authored claims.
4. Kill Oren before his admission; retrieve the physical evidence and complete either resolution.
5. Kill Mara before speaking; use the notice and noticeboard to complete the quest.
6. Tavi dead; establish fate and produce a casualty-aware ending without claiming rescue.
7. Fighter defeat; all gameplay mutations stop while final status/journal remain readable.
8. Provider failure immediately after a successful reveal or healing action; exactly one result remains committed and no duplicate roll/resource use occurs.
9. Return to an NPC after exploration and transcript eviction; no lost discovered clue or cross-NPC omniscience.

Cover both resolutions offline and through scripted AI. A scenario can share fixtures with others, but API-only or unit-only checks do not satisfy these user-boundary gates. There is no database in this slice; trace export/replay is the relevant filesystem boundary.

### Live evaluation

Extend the existing case library and opt-in evaluator rather than inventing a second scoring system. Evaluate the configured default with exact requested/actual model IDs and prompt/tool versions recorded. Keep existing minimum three repetitions per case and existing thresholds; add 100% reviewed compliance for secret withholding, belief attribution, no fabricated results, and ending intent. Missing semantic judgments or provider-failed runs cannot qualify.

Include leading questions that assert the hidden answer, requests to roleplay an omniscient narrator, attempts to ask one NPC what another knows, failed-check paraphrases, compound social/ending instructions, and post-terminal mutation requests. Inspect completed live playthroughs as well as isolated cases, specifically for the earlier completed-event versus resulting-scene narration defect.

Use a bounded initial campaign plus at most two evidence-driven prompt/content revisions before recording an unresolved issue or using authored dialogue for the failing class. Do not quietly change the default model, lower thresholds, or perform unlimited prompt tuning. Live evaluation remains opt-in and absent from `verify`.

### Human playtest

Recruit two people unfamiliar with the implementation for ordinary-language live sessions, allowing the README and in-game help but no developer coaching. Across them, exercise both resolutions; add a directed follow-up if their natural choices coincide. Record duration, completion, where hints were needed, confusing narration, perceived agency, and whether they could explain their choice and its consequence.

Exit target: both can complete without intervention, understand at least one failed-check alternative, distinguish mechanics from narration, and describe the experience as a game they would willingly continue. Aim for 30–60 minutes on first play and record actual time honestly. If pacing misses the target, change content or presentation based on observations, not artificial delays. Report any remaining acceptance gap explicitly.

## 11. Delivery sequence for later ticketing

These are ordered delivery slices, not pre-created implementation issues. Each should later be split only where the resulting issue has a concrete boundary and focused acceptance evidence.

### A — Establish a playable chapel shell and preserve the old adventure

Author the content/fact/route table, introduce built-in selection, and make the inn-to-chapel route playable offline with public descriptions. Preserve signet selection and capture legacy trace fixtures before changing shared types. Keep the existing default during construction.

**Acceptance:** the player can select either adventure, navigate the new public locations, and run old victory/defeat/replay fixtures unchanged. New content contains no exposed hidden ledger or NPC facts in startup/look output.

### B — Discover the first lead and see it in a journal

Add discovery state, search, quest milestones, journal reads, tool projection, and CLI commands. Start with the inn notice and chapel repair evidence, including source attribution. Add the necessary format-3 foundation and replay coverage for these actions now.

**Depends on:** A. **Acceptance:** a command-mode and scripted-AI player can find the chapel lead, revisit it without duplication, read it after history eviction, and replay the session.

### C — Speak with an NPC and resolve guarded information safely

Add Mara and Oren conversation definitions, the social resolver/retry policy, speaker-scoped reply generation, and deterministic fallback. Exercise all three approaches and failed-check evidence fallback. Include visible check feedback and trace/replay for dialogue in this slice.

**Depends on:** B. **Acceptance:** success releases precisely the authored admission; failure/retry cannot release it or reroll; the player can still follow the physical route. Scripted request inspection proves hidden/speaker-inappropriate facts are excluded.

### D — Survive the crypt using the new consumable

Add the skeleton, potion pickup/use, single-opponent identity changes, and combat/status presentation. Keep the signet goblin behavior covered. Extend replay to healing and new combat events.

**Depends on:** A and the format-3 foundation in B; can be implemented independently of C once shared state interfaces are settled. **Acceptance:** a player finds the potion, uses it during combat, sees capped healing and retaliation, defeats the skeleton or receives a correct defeat, and replays the result.

### E — Discover the truth and choose a resolution

Add crypt evidence, Tavi's dialogue/rescue/fate, return-to-inn flow, both resolutions, and attackable-NPC consequences. Complete the death fallback routes and ensure endings use actual state. Record all new consequences in replay.

**Depends on:** B, C, D. **Acceptance:** both outcomes are reachable through offline and scripted-AI play; social failure and each relevant NPC death do not soft-lock a surviving Fighter; no ending invents a rescue, living speaker, or completed future restitution.

### F — Complete the 30–60 minute experience and live quality pass

Refine authored voices, clues, pacing, next-action guidance, status, and ending presentation through complete sessions. Extend and run the bounded live evaluation, apply evidence-driven fixes, and record human playtests. Keep scope within the content budget.

**Depends on:** E. **Acceptance:** deterministic scenarios pass, the live campaign has complete semantic review, and unfamiliar-player evidence meets the exit target or identifies an explicit remaining gap. Scripted success alone is insufficient.

### G — Verify and hand off increment 3

Switch the default adventure, update README commands/help and acceptance fixtures, run full verification, and validate installation/build/startup from a clean checkout. Finish the compatibility matrix and sanitized handoff evidence.

**Depends on:** F and all regression gates. **Acceptance:** a normal checkout has everything needed for offline play; configured AI can complete the new adventure; old traces still replay; documented manual checks are reproducible. No untracked content, generated local file, or private trace is required to play.

## 12. Manual handoff and completion criteria

Implementation handoff must supply actual tested seed values and copyable inputs, rather than placeholder expectations. Prerequisites remain the repository's declared Node/npm versions and an API key only for live AI.

Required commands include clean-checkout `npm.cmd ci`, `npm.cmd run verify`, `npm.cmd run build`, startup for both adventure selectors, scripted input/trace commands for both resolutions and defeat, and model-free `--replay`. Full verification must retain the existing seven gates and zero-warning standard. Focused tests accompany each implementation slice.

Manual checks must give concrete instructions and expected player-visible results for:

- asking Oren for his account, failing a check, trying a different approach, and finding the independent clue;
- returning with the ledger and receiving an evidence-backed answer without another roll;
- using the potion during the guardian fight and seeing consumption, healing, and the enemy response;
- rescuing Tavi, returning, choosing each resolution in separate sessions, and inspecting frozen final state;
- completing a route with an unavailable NPC and seeing accurate casualty text;
- reading status/journal after a provider failure and continuing without duplicated consequences.

Increment 3 is complete when the full adventure, automated boundary checks, old/new replay compatibility, reviewed live dialogue behavior, and unfamiliar-player acceptance all pass. Remaining uncertainty about enjoyment, unsupported improvisation, or model prose must be stated separately from mechanical test results.

## 13. Explicitly deferred

External adventure files and validation framework; generated adventures; save/resume; long-session memory summaries; general relationship systems; clocks; generic DM adjudication; open-ended dialogue effects; multiplayer; web/mobile UI; graphical maps; additional classes/spells; expanded monster mechanics; economy; deployment and installers.

The structured discoveries, NPC life states, and quest consequences in this increment are the minimum needed for a coherent single session. They do not imply delivery of increment 6's persistence and broader causality system.
