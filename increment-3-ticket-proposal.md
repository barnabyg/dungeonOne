# Increment 3 ticket proposal

Status: approved and published to GitHub as issues #24–#38. All 15 issue bodies, titles, ready-for-agent labels, open states, and 18 native blocking edges were verified. Numbers in the draft sections below remain proposal numbers; use the publication index for GitHub references.

Before publication, the 23 existing repository issues were closed and no increment-3 tickets existed. Published one issue per approved ticket with the ready-for-agent label, native blocking relationships, and matching issue references in each body. No parent issue was created or modified.

The approved adventure is The Bell Beneath the Chapel: five locations, Mara/Oren/Tavi, one required skeleton fight, one potion, a missing-person investigation, and public-disclosure/private-referral resolutions. Preserve the signet regression adventure. External content loading, save/resume, general improvisation, group combat, and additional rule systems remain deferred.

Every implementation ticket below includes the relevant engine, model-tool, offline command, terminal presentation, deterministic CLI tests, and trace/replay changes needed for its behavior. Full verification remains the repository's canonical seven-gate command with zero warnings. Never treat scripted tests as evidence of live model quality or unfamiliar-human enjoyment. Include concrete manual checks and any remaining limitations in each handoff.

## 1 — Preserve signet gameplay through explicit adventure selection

### What to build

Introduce the minimal built-in adventure/runtime selection seam while keeping The Stolen Signet behavior unchanged. This prefactoring ticket makes later content changes safe: a player can explicitly select the existing adventure, play either outcome, and replay previously exported sessions.

### Acceptance criteria

- [ ] Capture sanitized historical command/DM golden fixtures before changing shared state or events, covering supported formats, victory, defeat, rejections, and failure after mutation.
- [ ] An explicit `stolen-signet` selector works in offline and AI modes; omitting it retains current behavior. Unknown selectors and conflicting replay options fail clearly before provider use.
- [ ] Selection flows through authoritative execution, presentation, tool projection, and replay without a mutable global current adventure. Introduce only the built-in seam; no external loader or generic effects language.
- [ ] Historical version tuples still choose the original signet runtime, including exports lacking an adventure ID. Unknown tuples fail rather than silently using the current default.
- [ ] Existing gameplay, strict tool validation, bounded turns, local controls, trace privacy, and random sequences remain compatible. Preserve model/seed/trace overrides.
- [ ] CLI winning/losing paths and all supported historical fixtures pass unchanged; the change is green before subsequent content work.

### Blocked by

None — can start immediately.

## 2 — Explore the chapel adventure and replay the journey

### What to build

Let an offline or AI player select `chapel`, understand Tavi's disappearance, and travel through the public adventure locations. Establish the new trace format with this first complete new-adventure interaction.

### Acceptance criteria

- [ ] Author the five-location topology: inn connects to ferry landing and chapel path; path leads to ruined chapel, then crypt. Author a concise canon/fact-source/reveal/fallback table covering the approved premise and three NPCs for subsequent tickets.
- [ ] Chapel startup clearly presents the missing-person objective and active quest; navigation and public inspection work through canonical tools and command mode. Do not expose undiscovered ledger details or private NPC facts in scene prose, schemas, errors, or prompts.
- [ ] Keep signet as the default during construction. The unfinished crypt must not offer rescue, ledger access, or completion before its guardian is implemented; describe the temporary boundary honestly.
- [ ] Introduce format-3 exports with explicit adventure/rules identity, seed/random algorithm, actions, events, results, and state, plus appropriate DM identity/version metadata. Record actual rules/content versions as capabilities evolve rather than silently reinterpreting incompatible traces.
- [ ] Offline and scripted-AI navigation traces replay without a model, verify state/events/draws, and reject tampering or unknown versions. Historical signet fixtures remain green.
- [ ] Copyable help and CLI tests demonstrate selecting, exploring, quitting, and replaying both adventures.

### Blocked by

- Proposal 1.

## 3 — Discover physical leads and retain them in a journal

### What to build

Let the player search the inn notice and chapel repair evidence, discover actionable leads without a roll, and consult those discoveries after leaving or losing the original conversation history.

### Acceptance criteria

- [ ] Add a validated search action/tool and offline equivalent for visible authored evidence targets. Search consumes the mutation-attempt budget; look and inspect remain read-only.
- [ ] The public inn notice supplies the chapel route; damaged repair evidence links the unsafe work to Oren. Neither requires NPC cooperation, a social check, or a prescribed discovery order.
- [ ] Record named milestones and discoveries with source and observation/testimony/belief classification. Duplicate search produces no duplicate entries, rewards, events, or random draws.
- [ ] The journal shows only discovered facts, attribution, quest progress, and known actionable leads. Reproject relevant structured knowledge after bounded transcript eviction without unbounded history.
- [ ] Exact `journal` is a local AI-mode read that works without a provider; ordinary-language journal questions use a validated read tool. Include corresponding local-read trace records and replay validation.
- [ ] CLI offline/scripted-AI search, repeat-search, remote/forged target, provider failure after discovery, journal, history-eviction, and export/replay tests pass. The first committed discovery is never repeated by recovery.

### Blocked by

- Proposal 2.

## 4 — Talk to Mara through a speaker-scoped dialogue boundary

### What to build

Let the player speak naturally or through offline commands with Mara, receive attributed information about Tavi, and hear expressive replies whose factual content is constrained by an authoritative conversation result.

### Acceptance criteria

- [ ] Author distinct knows/believes/wants/reveals fields and public conversation topics. Mara can report the disappearance and her mistaken ferry lead; she cannot reveal Oren's private motive or Tavi's current crypt condition.
- [ ] Validate visible, living speaker and public topic in the engine. All talk attempts consume the mutation-attempt budget; ordinary authorized questions do not roll. Show NPC names, public subjects, speaker labels, and an authored offline reply.
- [ ] Dialogue can record attributed testimony/belief in the journal, without treating mistaken belief as observed truth. Repeat conversation is idempotent for discoveries.
- [ ] Route intent with public/player-known context, then generate the NPC reply using a fresh scoped request containing only approved response facts, voice, the addressed utterance, and bounded authorized speaker history. Do not carry the router's full transcript, journal, or other speakers' knowledge into the reply request.
- [ ] Keep the existing one-mutation/four-response ceiling and provider-neutral adapter. A reply failure displays the committed authored response and mechanics without rerunning the action. Unsupported requests do not invent effects.
- [ ] Inspect every scripted provider request, including schemas and continuations, for private facts and cross-speaker information. Player assertions remain untrusted attributed speech, not canon.
- [ ] Offline/scripted-AI CLI conversations, invalid/stale targets, repeated dialogue, before/after-provider failures, transcript eviction, and replay pass. Factual guarded replies can fall back to deterministic authored text.

### Blocked by

- Proposal 3.

## 5 — Investigate Oren with bounded social checks

### What to build

Let the player persuade, deceive, or intimidate Oren about his guarded account, see the exact check, and continue via physical evidence after failure.

### Acceptance criteria

- [ ] Oren's authored private canon distinguishes diverted repair funds and purchased medicine from his ignorance of Tavi's current condition. Only a successful authored challenge releases his guarded admission at this stage.
- [ ] Support persuasion to help find Tavi, the deception pretext that records were checked, and intimidation through public scrutiny. A successful deception affects the response but never makes the pretext true.
- [ ] Resolve one seeded d20 +1 against DC 11, with success on equality and no special natural-1/20 rule. Difficulty, modifier, and result are engine-owned. Show approach, die, modifier, total, DC, and result separately from prose.
- [ ] Persist one attempt for the guarded-account challenge across all approaches. Rephrasing, switching skills, leaving/returning, or provider retry cannot reroll. Invalid attempts consume no draws; a valid check consumes exactly one d20.
- [ ] Success releases only the authored admission; failure withholds it and leaves the inn notice and chapel evidence usable. Public topic names, tool errors, fallback prose, and prompts do not disclose secret conditions.
- [ ] Offline/scripted-AI CLI tests cover each approach, success/equality/failure, repeated requests, compound actions, prompt injection, failure after commitment, and trace/replay. Preserve no-roll greetings and already-authorized answers.

### Blocked by

- Proposal 4.

## 6 — Fight the skeleton guardian in the crypt

### What to build

Let the player enter the crypt, fight one skeleton using the existing deterministic combat model, and either clear the guardian or suffer an understandable terminal defeat.

### Acceptance criteria

- [ ] Author one skeleton using ordinary HP/AC/initiative/attack/damage statistics. Encounter entry starts initiative and any opponent opening attack according to existing rules.
- [ ] Distinguish combatant instances from definitions and use combatant-based events for new rules without changing historical goblin trace semantics. Keep one active opponent and one canonical life state.
- [ ] Clearing the guardian records its milestone, allows subsequent access to crypt evidence, and prevents combat restarting on revisit. Do not introduce premature quest completion.
- [ ] Render correct skeleton identity, rolls, damage, remaining HP, turn, and terminal defeat in offline and AI play. Retain readable final state and reject terminal mutations without additional draws.
- [ ] Preserve the signet goblin regression and existing movement/combat restrictions. No extra monster mechanics, tactical system, or simultaneous opponents.
- [ ] Seeded CLI win/defeat/revisit paths and format-3 replay/tampering tests pass, alongside historical fixtures.

### Blocked by

- Proposal 3.

## 7 — Find and drink a healing potion during combat

### What to build

Let the player collect the single potion on the chapel path and use it before or during a fight, seeing actual healing, consumption, and any enemy response.

### Acceptance criteria

- [ ] Add a single pre-crypt pickup and owned-item use through command mode and a strict validated tool. Inventory/status show whether the potion remains available.
- [ ] Valid use restores 2d4 +2 HP capped at maximum, records both rolls and actual healing, and marks the item consumed exactly once.
- [ ] Full-HP use is rejected without consuming the potion, randomness, or a combat turn. Missing/consumed items, dead characters, and terminal state cannot heal or roll.
- [ ] In combat, valid use spends the Fighter's turn and executes the existing opponent response when appropriate. Consumption, healing, retaliation, and possible defeat are one atomic action result.
- [ ] Provider failure after use preserves the committed result and does not repeat healing or retaliation. No NPC healing, resurrection, shop, or new inventory system.
- [ ] Offline/scripted-AI CLI tests cover pickup, capped and out-of-combat healing, in-combat retaliation/defeat, invalid/repeated use, provider recovery, exact draw records, and replay/tampering. Supply tested seeds rather than reusing old assumptions.

### Blocked by

- Proposal 6.

## 8 — Recover the ledger and rescue Tavi

### What to build

Let the player discover the truth after defeating the guardian, speak with Tavi, rescue them to the inn, and confront Oren with conclusive evidence without another check.

### Acceptance criteria

- [ ] The ledger and Tavi interaction become accessible only after the guardian is defeated. Search records conclusive evidence independently of NPC cooperation or earlier social results.
- [ ] Author ledger evidence sufficient to establish the diversion and medicine motive even when Oren is unavailable, while keeping it hidden until discovery. Journal entries preserve sources.
- [ ] Tavi's approved replies describe their crypt experience without knowledge of unrelated village conversations. Apply the same scoped reply and fallback contracts as other NPCs.
- [ ] An explicit rescue topic atomically records rescue and moves a living Tavi to the inn. Repeated rescue cannot duplicate events or move them again; this is an authored transition, not an escort simulation.
- [ ] Returning to Oren with discovered ledger evidence produces an authored no-roll response even after a failed social attempt. It does not reset the attempt lock or invent new facts.
- [ ] Invalid/pre-combat/stale/ambiguous rescue requests do not mutate state. Provider failure after rescue preserves one transition. State and projections support life-state checks for the later NPC-death slice.
- [ ] Offline/scripted-AI CLI tests cover out-of-order evidence, successful and failed social routes, rescue, return, evidence-backed dialogue, transcript eviction, and export/replay.

### Blocked by

- Proposal 5.
- Proposal 6.

## 9 — Resolve the disappearance with two explicit endings

### What to build

Let the player return to the inn and deliberately choose public disclosure or confidential referral, producing distinct authoritative consequences and a readable final state.

### Acceptance criteria

- [ ] Both choices require discovered ledger evidence, established Tavi fate, and the inn location. Present known stakes before commitment and expose only eligible choice references.
- [ ] Public disclosure records published evidence and initiated inquiry. Private referral records confidential delivery to trustees and a restitution/repair request. These are different resolution IDs and consequences.
- [ ] A living Oren may make an authored future restitution commitment; neither ending claims completed payment/repairs or an unmodeled authority action. Endings use actual Tavi fate.
- [ ] An inn noticeboard provides the durable resolution interaction. No living quest giver is an engine prerequisite.
- [ ] Unambiguous player intent can commit directly; ambiguous requests such as dealing with Oren require clarification. Social outcome or tone cannot choose an ending. Invalid/forged choices and remote use are rejected.
- [ ] Freeze gameplay mutations after resolution; retain status, journal, inventory, reflection, help, and quit. Provider failure after resolution cannot duplicate or change the ending.
- [ ] Both full endings pass offline and scripted-AI CLI playthroughs and replay, including failed-social/evidence fallback, prerequisite rejection, compound requests, terminal tampering, and explicit outcome evidence.

### Blocked by

- Proposal 8.

## 10 — Complete the quest despite NPC casualties

### What to build

Let deliberate attacks on Mara, Oren, or Tavi resolve through combat, update their availability, and leave a surviving Fighter a truthful route to either quest resolution.

### Acceptance criteria

- [ ] Give the three NPCs simple authored combat statistics and use the existing single-opponent initiative/attack/retaliation rules. Attacking cannot instantly kill through prose or a direct state tool.
- [ ] Keep one authoritative life/HP state across combat and dialogue. NPC defeat immediately disables conversation/rescue and records affected quest consequences in the same transition.
- [ ] Killing Mara before dialogue leaves the startup quest, public chapel lead, and noticeboard resolution usable. Killing Oren before admission leaves the physical ledger and medicine motive discoverable.
- [ ] Discovering Tavi's remains records death-confirmed fate through a mutation-classified search, not a hidden write in inspect. Dead Tavi cannot be rescued or speak; the player can still return and resolve the investigation.
- [ ] Both ending definitions support all relevant casualty combinations. Dead Oren never promises restitution; dead Tavi is never described as rescued. Existing structured knowledge survives its source's death.
- [ ] CLI tests traverse each NPC casualty route through an ending and replay it; add a combined-casualty scenario to prove the durable fallback does not secretly require a living NPC. Assertions assume the Fighter survives the combats.
- [ ] Repeated attacks on dead targets, stale dialogue tools, simultaneous-encounter attempts, provider failure after fatal action, and terminal mutations are rejected/recovered correctly. No witnesses, guards, relationship simulator, or new enemy AI.

### Blocked by

- Proposal 9.

## 11 — Make a complete chapel session readable and recoverable

### What to build

Make the full investigation easy to follow in the terminal, with authoritative status, source-aware journal guidance, clear dialogue and mechanics, and useful controls during provider failure.

### Acceptance criteria

- [ ] Print compact HP/max HP, potion availability, active combat turn, and quest summary at startup and after accepted gameplay actions without repeatedly dumping the whole sheet.
- [ ] Exact status/inventory/journal/help/quit controls work locally in AI mode without provider calls. Ordinary-language requests still use appropriate validated tools. New local-read records replay and invalid records are detected.
- [ ] Provide copyable offline examples and public topic suggestions for search, each social approach, item use, rescue, and resolution. Never expose hidden identifiers or undiscovered solution conditions.
- [ ] Distinguish speaker dialogue, mechanics, DM narration, and journal updates. Failed social checks leave a visible public alternative; unsupported/ambiguous input cannot silently become an attack, rescue, or ending.
- [ ] Refine the three voices and authored scene/ending text within five locations, four substantive discoveries, one required fight, and one potion. No padding through repeated checks, artificial delays, or new systems.
- [ ] CLI tests and a complete manual pass cover readability, local controls during provider failure, failed-check recovery, potion feedback, casualty-aware endings, and frozen final-state inspection. Record actionable observations for live/human playtests.

### Blocked by

- Proposal 7.
- Proposal 10.

## 12 — Evaluate multi-scene knowledge and consequence contracts

### What to build

Extend the existing shared interpretation/evaluation harness so a maintainer can reproducibly check the new adventure's secrets, NPC knowledge, social checks, resources, and ending intent at the real DM/terminal boundary.

### Acceptance criteria

- [ ] Extend the existing case library and opt-in evaluator, not a parallel framework. Retain prior cases, minimum three repetitions, existing thresholds, and explicit manual judgments; live calls remain outside canonical verification.
- [ ] Add leading secret assertions, omniscient-roleplay requests, cross-NPC knowledge probes, belief attribution, social retry paraphrases, compound requests, forged outcomes/DCs, unavailable targets, and post-terminal mutations.
- [ ] Define 100% reviewed compliance for secret withholding, belief attribution, no fabricated outcomes, and ending intent. Missing judgments and provider-failed runs cannot qualify; exact requested/actual model and prompt/tool versions are recorded.
- [ ] Inspect complete scripted requests, schema descriptions, continuations, fallback responses, and speaker histories. Use secret markers for exact boundary checks without treating marker absence as proof against semantic leakage.
- [ ] Complete the CLI scenario matrix: both resolutions; successful/failed social routes; each approach; potion use/defeat; each NPC casualty; provider failure after disclosure/healing/rescue/resolution; history eviction. Reuse existing meaningful coverage rather than duplicate it.
- [ ] Export and replay scenario evidence; reject tampered rolls, revelations, consumed items, endings, and local-read records. Preserve legacy fixtures and privacy allowlists; no personal live transcripts or credentials in tracked evidence.
- [ ] A maintainer can run deterministic contracts offline and launch a separate explicit live campaign with complete scoring/report semantics. Report scripted results as harness/guardrail evidence only.

### Blocked by

- Proposal 7.
- Proposal 10.

## 13 — Qualify live chapel dialogue with a bounded campaign

### What to build

Run the configured default model through the new evaluation cases and complete adventure sessions, then make bounded evidence-driven fixes or select authored dialogue fallback for failing classes.

### Acceptance criteria

- [ ] Run an initial campaign at the configured default with minimum three repetitions per case and complete manual semantic review. Record exact model/version identities, sanitized results, and observed failures; do not change the default model silently.
- [ ] Review completed live sessions for both endings and defeat, not just isolated cases. Specifically compare newly completed action events against narration to catch the prior already-open/false-return class of contradiction.
- [ ] Review withholding, speaker knowledge, player-assertion handling, beliefs, social failures, resource outcomes, casualty text, and ending intent against authoritative results. Preserve 100% safety/new semantic gates and existing interpretation thresholds.
- [ ] Allow at most two evidence-driven prompt/content revisions after the initial campaign. Rerun affected cases and full qualifying gates; never lower thresholds or perform unlimited tuning.
- [ ] If a dialogue class still leaks or contradicts, use its authored reply fallback and reevaluate the resulting shipped behavior. Otherwise retain an explicit unresolved blocker rather than claim qualification.
- [ ] Keep sanitized durable evidence and reproducible commands, not raw personal transcripts or credentials. Run focused tests and full verification for implementation fixes; document remaining prose limitations separately.
- [ ] This ticket is complete only when the intended shipped behavior qualifies. A recorded unresolved failure is useful evidence but does not satisfy the downstream gate.

### Blocked by

- Proposal 11.
- Proposal 12.

## 14 — Validate the adventure with unfamiliar players

### What to build

Prepare and conduct the two-person live playtest, using actual player observations to validate the 30–60 minute adventure and make focused pacing or clarity fixes.

### Acceptance criteria

- [ ] Prepare concise startup instructions and a feedback protocol. Human participants are required; agent simulation or scripted sessions cannot substitute. Arrange participant input through the operator, without contacting others without authorization.
- [ ] Two people unfamiliar with the implementation play ordinary-language live sessions using documentation/help but no developer coaching. Cover both resolutions across sessions or a directed follow-up if natural choices coincide.
- [ ] Record actual first-play duration, completion, confusing narration, hint needs, perceived agency, and each player's explanation of their choice and consequences.
- [ ] Both complete without intervention, understand a failed-check alternative, distinguish mechanics from narration, and describe a game they would willingly continue. Aim for 30–60 minutes and report deviations honestly.
- [ ] Apply focused evidence-backed content/presentation fixes within the approved content budget; no artificial timers, repeated checks, or extra combat to inflate duration. Reverify affected behavior and seek follow-up evidence when changes affect acceptance.
- [ ] Preserve a sanitized human acceptance record and outstanding gaps. If participants or qualifying results are unavailable, leave the acceptance gate open; do not fabricate completion.

### Blocked by

- Proposal 13.

## 15 — Default to the chapel adventure and verify the clean-checkout handoff

### What to build

Make the accepted chapel adventure the normal startup experience and deliver reproducible installation, gameplay, replay, and acceptance instructions from tracked project inputs.

### Acceptance criteria

- [ ] Switch no-selector startup to chapel in offline/AI modes only after the prior quality and human gates pass. Explicit signet selection remains usable; historical replay selects original content independently of the new default.
- [ ] Update startup/help/manual examples and signet regression instructions, documenting model/seed/adventure/trace/replay options, local controls, provider recovery, scope, and trace spoiler/privacy limitations.
- [ ] From a clean checkout, install locked dependencies, run the canonical seven zero-warning gates, build, and start both adventures using only tracked inputs. Verify supported runtime/package prerequisites and record actual versions.
- [ ] Provide tested seeds and copyable command/scripted inputs for both resolutions, social fallback and evidence return, potion/defeat, casualty route, provider recovery, and model-free replay. No generated local content or private trace is needed to play.
- [ ] Verify historical format-1/2 fixtures and new format-3 journeys, action outcomes, failures, and tampering cases. Live default startup is separately smoke-tested with credentials kept out of evidence.
- [ ] Record automated results, concrete manual steps/expected results, live/human evidence, and important untested or deferred behavior. Completion requires the combined mechanics, compatibility, live-semantic, and unfamiliar-player gates.
- [ ] If publishing is subsequently authorized, state the pushed branch and claim normal-clone availability only after verifying the remote default branch contains the change. This issue does not itself authorize unrelated publication or history rewriting.

### Blocked by

- Proposal 14.

## Coverage and dependency review

Approved slices map as follows: A → 1–2; B → 3; C → 4–5; D → 6–7; E → 8–10; F → 11–14; G → 15. Prefactoring is first. Every new capability includes its own trace and terminal verification; ticket 12 completes shared evaluation/scenario coverage instead of postponing all testing until the end.

After 3, dialogue (4–5) and combat (6–7) can progress independently. Rescue (8) joins dialogue and the guardian, without waiting for potion work. Both terminal polish (11) and evaluation coverage (12) require the completed quest plus potion, but neither unnecessarily blocks the other. Live qualification joins them. Human acceptance then gates the final default/handoff change.

The publication step must inline the relevant shared constraints into individual issue bodies so each ticket can be executed from a fresh context without depending on this local, untracked proposal. Each issue will use What to build, Acceptance criteria, and Blocked by sections, with no stale implementation file paths or code snippets.

## Published GitHub issues

| Proposal | Issue | Blocked by |
| --- | --- | --- |
| 1 | [#24 — Preserve signet gameplay through explicit adventure selection](https://github.com/barnabyg/dungeonOne/issues/24) | None |
| 2 | [#25 — Explore the chapel adventure and replay the journey](https://github.com/barnabyg/dungeonOne/issues/25) | #24 |
| 3 | [#26 — Discover physical leads and retain them in a journal](https://github.com/barnabyg/dungeonOne/issues/26) | #25 |
| 4 | [#27 — Talk to Mara through a speaker-scoped dialogue boundary](https://github.com/barnabyg/dungeonOne/issues/27) | #26 |
| 5 | [#28 — Investigate Oren with bounded social checks](https://github.com/barnabyg/dungeonOne/issues/28) | #27 |
| 6 | [#29 — Fight the skeleton guardian in the crypt](https://github.com/barnabyg/dungeonOne/issues/29) | #26 |
| 7 | [#30 — Find and drink a healing potion during combat](https://github.com/barnabyg/dungeonOne/issues/30) | #29 |
| 8 | [#31 — Recover the ledger and rescue Tavi](https://github.com/barnabyg/dungeonOne/issues/31) | #28, #29 |
| 9 | [#32 — Resolve the disappearance with two explicit endings](https://github.com/barnabyg/dungeonOne/issues/32) | #31 |
| 10 | [#33 — Complete the quest despite NPC casualties](https://github.com/barnabyg/dungeonOne/issues/33) | #32 |
| 11 | [#34 — Make a complete chapel session readable and recoverable](https://github.com/barnabyg/dungeonOne/issues/34) | #30, #33 |
| 12 | [#35 — Evaluate multi-scene knowledge and consequence contracts](https://github.com/barnabyg/dungeonOne/issues/35) | #30, #33 |
| 13 | [#36 — Qualify live chapel dialogue with a bounded campaign](https://github.com/barnabyg/dungeonOne/issues/36) | #34, #35 |
| 14 | [#37 — Validate the adventure with unfamiliar players](https://github.com/barnabyg/dungeonOne/issues/37) | #36 |
| 15 | [#38 — Default to the chapel adventure and verify the clean-checkout handoff](https://github.com/barnabyg/dungeonOne/issues/38) | #37 |

