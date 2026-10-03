# Increment 8 ticket proposal

Scope clarification, 2 October 2026: the character library, independently saved sheets, character/adventure selection, Fighter levels 1–3, and level recommendations are new [increment 10](increment-10-implementation-plan.md) scope. This publication record preserves the original breakdown; current GitHub issue bodies govern implementation. Do not add these mechanics to the existing start/continue or qualification tickets implicitly.

Direction update, 3 October 2026: the project owner confirmed that the character library is the primary browser mode ([ADR 0004](docs/adr/0004-qualify-the-full-adventure-in-character-mode.md)). The remaining increment 8 tickets #93–#95 were revised to target it explicitly: Hollow Beacon v12 played by a saved character, continuation by rerunning the same launcher command, and abandon/rest/start in place of single-slot New game. The single save slot described here remains only as `--legacy` compatibility for released Hollow Beacon v4–v11 saves. The rest of this document is the historical record.

Source: the Increment 8 implementation plan, current repository contracts, and the project owner's confirmation that Increment 7 is complete. The project owner approved this `to-tickets` breakdown. It was published as GitHub issues #81–#95 with the `ready-for-agent` label and 24 native blocking links. The story title and exact mechanics remain decisions to validate in the first playable slice.

## Publication index

| # | GitHub issue | Title | Blocked by | Demonstrable result |
| --- | --- | --- | --- | --- |
| 1 | [#81](https://github.com/barnabyg/dungeonOne/issues/81) | Play the opening of the first full adventure | None | A new authored adventure offers a clear problem, two leads, a choice, and a saved return visit. |
| 2 | [#82](https://github.com/barnabyg/dungeonOne/issues/82) | Travel by two routes while the deadline advances | 1 | Route-specific day costs produce an observable on-time and late path. |
| 3 | [#83](https://github.com/barnabyg/dungeonOne/issues/83) | Find a useful conversation from a person’s name | 1 | Command and AI players can discover and pursue an opening dialogue lead without syntax guessing. |
| 4 | [#84](https://github.com/barnabyg/dungeonOne/issues/84) | Investigate the beacon through the watch route | 2, 3 | Watch-side evidence independently explains part of the altered signal. |
| 5 | [#85](https://github.com/barnabyg/dungeonOne/issues/85) | Investigate the beacon through the refugee route | 2, 3 | Refugee-side evidence offers a different clue order and an independent route to the central inference. |
| 6 | [#86](https://github.com/barnabyg/dungeonOne/issues/86) | Change an ally’s trust without changing the facts | 4, 5 | A claim, failed check, or later proof changes only the involved NPC’s response. |
| 7 | [#87](https://github.com/barnabyg/dungeonOne/issues/87) | Survive the first threat with a meaningful combat choice | 2 | A new combat option makes the opening fight more than repeated attacks. |
| 8 | [#88](https://github.com/barnabyg/dungeonOne/issues/88) | Recover and bypass an optional second threat | 2, 7 | A bounded recovery opportunity and an avoidable encounter support a longer journey. |
| 9 | [#89](https://github.com/barnabyg/dungeonOne/issues/89) | Carry and use a non-healing quest item | 4 | A physical signal component has one authoritative use and persists through save/resume. |
| 10 | [#90](https://github.com/barnabyg/dungeonOne/issues/90) | Confront the saboteur with proof or force | 6, 8, 9 | Evidence or alliance changes the final encounter; combat remains a viable distinct route. |
| 11 | [#91](https://github.com/barnabyg/dungeonOne/issues/91) | Finish with three truthful outcomes | 2, 10 | On-time, late, and risky decisions produce different endings grounded in state. |
| 12 | [#92](https://github.com/barnabyg/dungeonOne/issues/92) | Read the journey through scene, journal, and character views | 3, 7 | Long-session status, conversation, and mechanics are scannable and consistent. |
| 13 | [#93](https://github.com/barnabyg/dungeonOne/issues/93) | Start and continue the adventure through local slots | 1 | A player selects the adventure, starts safely, and resumes by a named slot. |
| 14 | [#94](https://github.com/barnabyg/dungeonOne/issues/94) | Complete the adventure with a live AI Dungeon Master | 11, 12, 13 | A full live journey respects visible facts, one-action authority, and save continuation. |
| 15 | [#95](https://github.com/barnabyg/dungeonOne/issues/95) | Qualify the first proper game with external players | 14 | Blind players finish and report whether they would choose another adventure; clean-checkout evidence supports release. |

These are the minimum technical blockers, not a suggested one-agent-at-a-time order. Content and runtime work in tickets 4–10 touches shared definitions, so concurrent writers need branch-backed worktrees and one integration worktree under `AGENTS.md`. Every implementation ticket should have a focused player-boundary check and a separate commit. Full verification is the integration and pre-push gate.

## 1 — Play the opening of the first full adventure

### What to build

Create a new, versioned authored adventure using the working **Hollow Beacon** premise: the valley beacon is dark, a caravan approaches, the watch wants a signal, refugees fear a compromised signal, and the keeper is missing. Start with a short, playable opening rather than authoring the whole map. The player sees the stakes, can talk or inspect, follows either of two leads, makes one small consequential choice, and sees its effect after leaving and resuming. Validate the premise with a reviewer unfamiliar with the implementation; the exact story name may change here.

### Acceptance criteria

- [ ] A fresh command-mode player understands the immediate problem and can follow two distinct visible leads without reading source data or receiving story hints. A refusal or departure produces a truthful response rather than silently completing the quest.
- [ ] The opening has a small location graph, timeline, NPC/fact map, and provisional ending truth table. Each planned location and encounter has a player decision or discovery purpose; feedback on the hook and choices is recorded before expanding content.
- [ ] One accepted action changes a later public scene or NPC response, and that change survives a process restart. A seeded CLI route and scripted-AI route demonstrate the same canonical state and replay under the new content identity.
- [ ] Existing adventures, save formats, traces, and runtime tuples retain their behavior. The new content has its own ID/version; no released digest is edited in place.

### Blocked by

None (can start immediately).

## 2 — Travel by two routes while the deadline advances

### What to build

The player can take a shorter route toward the beacon or a slower alternative while a clearly named day clock advances. Major journeys spend the day cost shown to the player; local investigation and combat rounds do not consume whole days. Crossing the deadline changes which route or warning is available, but a late player still has a viable outcome.

### Acceptance criteria

- [ ] The two routes have distinct visible travel costs and lead to different observations or tradeoffs. An on-time and a late seeded command journey remain playable, with the relevant threshold event applied exactly once.
- [ ] The engine validates route costs and ordered threshold effects. Reads, invalid moves, clarification, resume startup, and replay do not advance time or RNG; off-screen events become known only through plausible public evidence.
- [ ] A save before and after the deadline resumes to the same world, next draw, and route availability as an uninterrupted run. Command and scripted-AI travel use the same rules.
- [ ] New time semantics use a new rules/engine tuple. Previously released schema-9 action costs and all older saves and traces keep their original meanings.

### Blocked by

1 — Play the opening of the first full adventure.

## 3 — Find a useful conversation from a person’s name

### What to build

The opening NPCs become easy to speak to. A command player can type a visible person's name and discover currently legal subjects and copyable follow-up commands; an AI player can ask the same questions naturally. A person with nothing relevant to say responds truthfully. This addresses the documented command-conversation friction before the cast grows.

### Acceptance criteria

- [ ] `talk <visible person>` and a failed short talk request show current topics without advancing the clock, drawing a die, or recording a false conversation. The suggested complete command works when entered verbatim.
- [ ] A real opening exchange records only that speaker's authorized facts and a useful lead. Revisited dialogue reflects the player's earlier choice and does not expose hidden knowledge or another NPC's belief.
- [ ] AI and command paths reach the same bounded conversation. A provider failure after a committed exchange leaves the authoritative reply and saved state available.
- [ ] An unfamiliar reviewer can find and use one opening conversation without being coached on the full `talk person topic approach` syntax; feedback is captured and obvious wording problems corrected.

### Blocked by

1 — Play the opening of the first full adventure.

## 4 — Investigate the beacon through the watch route

### What to build

The watch-side path leads through places and people with distinct reasons to visit. The player can discover physical evidence of the altered signal, question a watch NPC, and arrive at a provisional inference even after a failed social check or an unavailable witness. Revisited watch locations reflect the evidence and the clock.

### Acceptance criteria

- [ ] A seeded command and scripted-AI route follow watch clues in at least two orders and reach the same authoritative discovery with source attribution in the journal.
- [ ] A physical fallback carries the essential fact if the watch conversation fails or the NPC is absent/dead. A failed check is remembered; paraphrasing cannot reroll it.
- [ ] Scene descriptions and available actions change after the relevant discovery and deadline. The watch NPC reports only facts they could know, and no lead claims the keeper or caravan has been saved prematurely.
- [ ] Save/resume and replay preserve discoveries, challenge result, NPC state, clock, and the subsequent legal path.

### Blocked by

2 — Travel by two routes while the deadline advances; 3 — Find a useful conversation from a person’s name.

## 5 — Investigate the beacon through the refugee route

### What to build

The refugee-side path offers a different set of locations, testimony, and physical evidence. It can be explored before or after the watch route and independently reveals why the familiar signal may be dangerous. The player can help, mistrust, or leave the group without collapsing the main investigation.

### Acceptance criteria

- [ ] A seeded command and scripted-AI route reach the central inference through refugee evidence without requiring the watch route's social success or a single NPC's survival.
- [ ] The journal separates observed signal evidence from refugee testimony and contested claims. Revisiting the group after a choice or clock threshold changes only justified public replies and scene details.
- [ ] A refusal, failed interaction, or unavailable refugee contact leaves a visible alternate physical lead and a route to continue.
- [ ] Routes in either clue order, including a process restart between them, produce consistent state, narration, and replay.

### Blocked by

2 — Travel by two routes while the deadline advances; 3 — Find a useful conversation from a person’s name.

## 6 — Change an ally’s trust without changing the facts

### What to build

The player can make a consequential claim to the watch captain or a refugee ally. Acceptance, refusal, and later correction affect that specific ally's trust and response; the underlying beacon, keeper, caravan, and other NPCs do not change because someone believed a claim. Physical evidence permits recovery from a mistaken or failed social approach.

### Acceptance criteria

- [ ] One authored claim and a later evidence-backed correction have distinct, inspectable effects on the involved ally's relationship and dialogue. Other actors do not acquire the claim without a witnessed report or authored discovery.
- [ ] Fixed or opposed checks, if used, show their engine-owned dice and result; a failed attempt cannot be rerolled through wording. Failure has an explicit next lead and remains playable.
- [ ] AI tools offer only visible targets and current claims. Ambiguous, hidden, stale, dead-actor, and compound requests do not mutate facts, time, or RNG and do not produce false-success prose.
- [ ] A split-session route verifies the ally's belief, later correction, journal classification, state/RNG equality, and replay.

### Blocked by

4 — Investigate the beacon through the watch route; 5 — Investigate the beacon through the refugee route.

## 7 — Survive the first threat with a meaningful combat choice

### What to build

The first threat introduces one rules-owned choice beyond repeating `attack`, selected from the encounter design: for example, a defensive stance or a visible environmental interaction. The option changes the current fight in a small, legible way and has an explicit turn cost. The scene shows why combat occurred and what can be learned or done afterward.

### Acceptance criteria

- [ ] The player can win or lose a seeded opening encounter and see clear initiative, action cost, dice, damage, HP, and turn ownership. The new choice changes an observable outcome or risk in that fight.
- [ ] Command and scripted-AI play offer the same legal combat choices. Invalid, repeated, hidden-target, or out-of-turn requests do not draw a die or change state.
- [ ] The fight and its aftermath survive a process restart in the middle of combat, with no duplicate enemy turn or draw; trace replay matches uninterrupted play.
- [ ] The new combat rule is confined to a new tuple. Older attacks, healing, and historical combat saves/traces retain their behavior.

### Blocked by

2 — Travel by two routes while the deadline advances (establishes the new tuple and chapter geography).

## 8 — Recover and bypass an optional second threat

### What to build

The player reaches a midgame threat that can be fought or avoided through a known route, clue, or ally. A bounded recovery opportunity makes the first fight's damage matter without turning later fights into an arbitrary attrition trap. The player understands the tradeoff before committing.

### Acceptance criteria

- [ ] A command and scripted-AI player can fight the second encounter or avoid it through a discoverable legal alternative; both paths provide the necessary onward lead.
- [ ] Recovery has a declared limit, location/prerequisite, time cost if any, and exact HP/resource effect. It cannot be repeated by resume, paraphrase, or a provider retry.
- [ ] Across several recorded seeds, at least one fight route and one avoidance route reach the next act without a forced death or hidden required clue. The encounter's defeat and retreat/surrender policy is explicit.
- [ ] Save/resume after the first fight, during the optional encounter, and after recovery preserves HP, resource use, clock, encounter state, and replay.

### Blocked by

2 — Travel by two routes while the deadline advances; 7 — Survive the first threat with a meaningful combat choice.

## 9 — Carry and use a non-healing quest item

### What to build

A physical signal component or similarly concrete quest item can be found, carried, inspected, and used at an authorized beacon interaction. It is distinct from healing supplies and its ownership affects a later choice. An attempted use in the wrong place explains why it fails without consuming the item.

### Acceptance criteria

- [ ] The item appears at one canonical location, transfers to inventory once, has a useful description, and can be spent or placed only through a validated action with a visible consequence.
- [ ] Command and AI play agree on legal target, cost, and resulting beacon state. Hidden, missing, already spent, wrong-target, combat, and terminal uses reject before mutation or RNG.
- [ ] The item is neither duplicated nor silently healed with. Inventory, scene, journal, ending prerequisites, save/resume, and trace replay agree on its location and use.
- [ ] Existing healing items and old adventures preserve their released semantics; the new item capability is bounded to the new content/rules tuple.

### Blocked by

4 — Investigate the beacon through the watch route.

## 10 — Confront the saboteur with proof or force

### What to build

The finale's confrontation reflects what the player learned and whom they persuaded. With sufficient proof or an ally, the player can avert a fight; without it, a distinct third combat encounter remains possible. Neither path may fabricate rescue, repair, or an NPC's knowledge. The world remains playable after a failed check or a nonessential death.

### Acceptance criteria

- [ ] The evidence/alliance path and combat path both reach the final decision point. They produce visibly different NPC responses, risk, casualties, or resources rather than an identical hidden flag.
- [ ] The combat encounter uses the existing bounded action vocabulary and has a clear defeat/escape policy. Several documented seeds demonstrate a viable route; essential evidence is not locked behind winning a random roll.
- [ ] Absent or dead actors, spent items, failed checks, late arrival, and an avoided optional encounter lead to truthful, validated branches with no impossible NPC speech.
- [ ] Command and scripted-AI routes, including a process restart, show the correct confrontation and replay with state, clock, HP, items, and knowledge intact.

### Blocked by

6 — Change an ally’s trust without changing the facts; 8 — Recover and bypass an optional second threat; 9 — Carry and use a non-healing quest item.

## 11 — Finish with three truthful outcomes

### What to build

The player chooses how to warn the pass: a verified safe signal, a slower human warning, or an urgent risky signal. The result accounts for arrival time, evidence, the keeper, caravan, refugees, raiders, casualties, and prior commitments. At least one honest late outcome remains reachable. The ending closes mutation while leaving read-only reflection available.

### Acceptance criteria

- [ ] Three distinct ending choices have public stakes before commitment and conditional, state-grounded consequences afterward. They cannot claim a signal was repaired, a person saved, or a threat defeated without the corresponding event.
- [ ] Named seeded routes cover on-time, late, failed social, lost item, casualty, avoided fight, and each choice. Every supported failure has a route to a truthful ending, unless the player expressly chooses a terminal departure.
- [ ] The ending is atomic and persists through save/resume. A second ending, later attack, or route change rejects without mutation; scene, journal, inventory, status, and AI reflection remain consistent.
- [ ] New route witnesses and compatibility suites pass. Exact state/RNG and linked replay match uninterrupted command and scripted-AI journeys.

### Blocked by

2 — Travel by two routes while the deadline advances; 10 — Confront the saboteur with proof or force.

## 12 — Read the journey through scene, journal, and character views

### What to build

During a long session, the player can quickly tell where they are, who is speaking, which facts are observed or disputed, what changed, how much time remains, and which combat or inventory resources are available. Narration and authoritative mechanics use visibly different presentation. The UI helps without reducing the adventure to an exhaustive list of prescribed choices.

### Acceptance criteria

- [ ] Startup, `look`, conversation, `journal`, character/status, inventory, and combat output have a consistent, scannable layout. Current HP, defense, attack, conditions, time, open leads, item ownership, and last relevant consequence are readable at the right point.
- [ ] A wrong or ambiguous command gives a specific reason and a copyable legal next action without spending time, dice, or items. A post-commit narration failure shows authoritative fallback; retry cannot reroll or reverse the commit.
- [ ] A seeded multi-scene command and scripted-AI journey, including a return visit and resume, shows no stale lead, dead speaker, false world fact, or conflict between mechanics and prose.
- [ ] An unfamiliar opening reviewer can identify the current goal and a usable next action without reading code. Revise any presentation problem observed before the full player test.

### Blocked by

3 — Find a useful conversation from a person’s name; 7 — Survive the first threat with a meaningful combat choice.

## 13 — Start and continue the adventure through local slots

### What to build

A player can list the built-in adventures, start the new game in a named local slot, see the seed, close the process after a committed prompt, and continue that same slot later. They cannot accidentally overwrite an occupied slot or mistake a completed slot for an active one. Existing explicit file/save/resume flags remain usable.

### Acceptance criteria

- [ ] A copyable start/list/continue flow names the adventure and slot, reports whether a slot is active or complete, and refuses accidental replacement without changing its save. Slot names are validated and confined to a safe local directory.
- [ ] The slot save contains the same verified state and replay contract as an explicit `--save` path; a restart after combat or a clock threshold resumes exactly once. Invalid or tampered slots report a clear error without corrupting other slots.
- [ ] Command mode starts without network or credentials. A player can resume the same save in AI mode or return to command mode after provider failure without losing committed progress.
- [ ] Historical CLI flags, old saves, default adventure selection, and replay keep working. Changing the default to the new adventure is reserved for final release qualification.

### Blocked by

1 — Play the opening of the first full adventure.

## 14 — Complete the adventure with a live AI Dungeon Master

### What to build

The live model guides a complete saved journey through the new adventure, including an investigation, consequence, fight or avoidance, and ending. It interprets ordinary language but selects only currently offered tools and reports engine-owned results. A long conversation and process restart must not turn prior narration into canon or reveal hidden facts.

### Acceptance criteria

- [ ] Scripted-AI full routes and at least one reviewed live full journey cover varied phrasing, dialogue, one check, combat/avoidance, item use, an ending, save/resume, and a provider failure before or after a mutation. No turn commits more than one mutation.
- [ ] Long history stays bounded and speaker-scoped; current scene and state override old claims. Hidden actors, ambiguous endings, compound requests, and impossible actions do not produce unauthorized state changes or false success claims.
- [ ] The review records exact model, content, rules, engine, prompt/tool versions, sanitized requests and outcomes, latency/cost, clarification loops, and each correction. Scripted results and isolated model turns are reported separately from full live play.
- [ ] After an AI failure, authoritative fallback and a copyable command let the player continue from the same save. Same-mode linked traces replay; any mixed-mode diagnostic limitation is explicit unless this ticket resolves and tests it.

### Blocked by

11 — Finish with three truthful outcomes; 12 — Read the journey through scene, journal, and character views; 13 — Start and continue the adventure through local slots.

## 15 — Qualify the first proper game with external players

### What to build

Prepare a blind player handoff and evaluate whether the finished adventure is understandable, enjoyable, and roughly 2–4 hours when played voluntarily. Use observed confusion and contradictions to make specific fixes, then rerun affected routes. Do not equate automated completion with enjoyment. The project owner supplies access to external players; the implementation agent prepares the sessions and records their anonymized evidence.

### Acceptance criteria

- [ ] At least three unfamiliar external players span command and live AI mode without seeing the JSON, route witnesses, or favored choices. Record actual duration, content/model/seed, save/resume, exact confusing inputs/responses, hint use, paths, ending, contradictions, and whether each would choose another adventure.
- [ ] Provisional gate: no authoritative contradiction or unfinishable supported branch in tested play; at least two finish without story coaching; completed runs plausibly fit 2–4 hours without padded travel; at least two independently say they would choose another. Negative evidence produces fixes and a fresh affected-path review, not a pass by assertion.
- [ ] Named automated journeys cover all endings, on-time/late, failed check, casualty, item loss, combat avoidance, multiple seeds, and mid-combat/threshold resume. Canonical seven-gate verification passes with zero warnings.
- [ ] A clean checkout installs, verifies, builds, starts, saves, resumes, finishes, and replays using tracked inputs and artifacts from that run. The handoff gives exact PowerShell start/resume commands, in-game actions with expected responses, prerequisites, and known limits. Only after these gates is a default-adventure switch considered.

### Blocked by

14 — Complete the adventure with a live AI Dungeon Master.
