# Increment 7 ticket proposal

Source: the Increment 7 implementation plan and current repository state. This is a review draft for the `to-tickets` quiz. No GitHub issues have been created.

## Publication index

| # | Title | Blocked by | Demonstrable result |
| --- | --- | --- | --- |
| 1 | Play an alternate route through the raider adventure | None | An authored small adventure supports the expected route, refusing help, leaving town, and a viable missed-deadline route before new judgment mechanics. |
| 2 | Barricade a visible passage and find it changed after resume | 1 | A command or AI request becomes one validated, saved physical action that changes a route and its public scene. |
| 3 | Wait several days while the raider plan advances | 2 | A bounded day wait crosses ordered thresholds once, moves the world, and preserves a late route through save/resume. |
| 4 | Distract a guard with a checked improvised action | 2, 3 | A fixed check creates a time-limited distraction, with visible success/failure and a playable fallback. |
| 5 | Deceive an ally in an opposed check | 4 | A two-sided roll changes only the knowledge and response of an actor who was involved, with a clear failure result. |
| 6 | Offer a carried item as a bribe | 2 | An unusual but plausible item use spends one resource and changes an NPC response without duplicating or consuming unrelated items. |
| 7 | Follow a witness after a witnessed departure | 3 | The player can follow along an open adjacent route, or learn why the trail was lost, without teleportation. |
| 8 | Interpret varied unexpected requests without inventing outcomes | 4, 5, 6, 7 | AI and command play classify ambiguous, impossible, and supported requests consistently and report authoritative results. |
| 9 | Qualify the complete two-session flexible adventure | 8 | The new adventure passes route, replay, verification, live-model, and unfamiliar-player evidence gates. |

The dependency edges above are intended to be the minimum technical gates. Ticket 6 can proceed alongside tickets 3–5 after ticket 2; ticket 7 can proceed alongside checks and bribery after ticket 3. Shared runtime edits should be serialized or isolated in branch-backed worktrees and integrated with full verification, per repository guidance.

## 1 — Play an alternate route through the raider adventure

### What to build

An authored, versioned small adventure gives the player a clear problem and a choice to help, refuse, or leave town. A late route still reaches a truthful ending. This fixture establishes the guard, witness, item, obstruction, and raider-plan clock that later improvised actions will affect. Freeze a judgment matrix for the weird-behavior examples against the actual scene and a route witness for each intended ending. Record the command grammar, day-cost policy, and diagnostic mixed-mode trace decision before the new action contract is implemented.

### Acceptance criteria

- [ ] A fresh command-mode player can complete an expected route and a distinct refusal/leave or late route using current supported mechanics; no required clue depends on a successful social roll or one NPC remaining alive.
- [ ] The scenario and judgment matrix name visible targets/resources, intended legal/impossible action categories, expected time cost, and truthful continuation for attack the quest giver, refuse, leave town, burn the quest location, deceive, wait, and unusual item use.
- [ ] Each route has a seeded executable witness and a public scene/journal/ending review; the scenario remains completable after a failed social attempt and an unavailable NPC or item.
- [ ] Existing schema-5 adventures and their save/trace replay behavior remain unchanged; a baseline result is recorded for comparison.

### Blocked by

None (can start immediately).

## 2 — Barricade a visible passage and find it changed after resume

### What to build

The player attempts to barricade a passage using a visible suitable object. Command mode and AI mode submit the same bounded proposal; the engine validates it and applies the route change. After leaving and resuming, the scene and legal exits still reflect the barricade. This first vertical slice establishes the new content/rules tuple, typed proposal, finite capability/profile/effect validation, presentation, durable event, and deterministic replay path without opening unrestricted model-authored state changes.

### Acceptance criteria

- [ ] The player can issue a documented command or natural-language barricade request, see an authoritative result, then leave and revisit a scene whose connection availability matches the persisted condition.
- [ ] An unseen target, unsuitable object, ambiguity, active combat, terminal state, or stale AI proposal causes a specific non-mutating rejection or clarification with no time or RNG cost.
- [ ] The AI can select only currently offered target/resource/profile IDs; it cannot set a DC, mutate arbitrary fields, or invent a route. One player turn permits at most one mutation attempt.
- [ ] One committed action produces a stable domain event and settled save. A split-session command and scripted-AI journey match uninterrupted state and RNG and replay diagnostically under the new tuple; old adventures/saves/traces still read under their pinned tuples.

### Blocked by

1 — Play an alternate route through the raider adventure.

## 3 — Wait several days while the raider plan advances

### What to build

The player can wait a bounded number of **days** and see the raider plan advance through every intermediate threshold. Public warnings and scheduled NPC movement appear when the player can observe them. The player can resume after a wait and still finish the late route. Old schema-5 abstract time units retain their existing behavior.

### Acceptance criteria

- [ ] A copyable `wait days N` command and equivalent offered AI action advance the stated number of days within a fixed bound; the output shows start/end day and each crossed threshold once.
- [ ] Off-screen NPC or plan changes are stored canonically and surfaced only through a plausible scene, witness, or discovery. A late but completable route has different truthful consequences from the on-time route.
- [ ] Reads, invalid or ambiguous waits, provider retry, resume startup, and replay advance no time; combat and terminal-state waits are unavailable. Crossing multiple thresholds in one wait applies ordered one-time effects.
- [ ] Saving immediately before or after a threshold and resuming yields the same state, events, and next random draw as an uninterrupted journey; schema-5 waits and historical replay remain unchanged.

### Blocked by

2 — Barricade a visible passage and find it changed after resume (establishes the new content/runtime tuple).

## 4 — Distract a guard with a checked improvised action

### What to build

The player creates a distraction using a visible, suitable feature and tries to slip past a guard. A fixed authored difficulty resolves a check; success creates a temporary situation that changes the guard or route, while failure costs only the time/resource declared by the profile. Either outcome has an understandable next move.

### Acceptance criteria

- [ ] Command and AI phrasings reach the same profile and deterministic d20 result; mechanics show die, modifier, total, DC, success/failure, time cost, and visible consequence.
- [ ] A successful distraction changes the relevant legal route or NPC response and expires at a declared day/threshold; revisit before and after expiry agrees with state and history.
- [ ] A failed attempt cannot be rerolled by paraphrasing and leaves a viable alternate route. Dead/absent guards, hidden or unsuitable props, and active combat are rejected before a draw.
- [ ] A failed or successful check survives save/resume and provider failure after commit exactly once. Older social checks keep their existing one-attempt semantics.

### Blocked by

2 — Barricade a visible passage and find it changed after resume; 3 — Wait several days while the raider plan advances.

## 5 — Deceive an ally in an opposed check

### What to build

The player tries to mislead a visible ally about the witness or route. The engine resolves one opposed player/NPC check using authored modifiers. The ally's later reply reflects only what that ally observed or accepted; other NPCs do not mysteriously learn the lie. Failure is explicit and the adventure continues.

### Acceptance criteria

- [ ] The mechanics show both d20s, modifiers, totals, and the tie rule (defender wins); fixed seeds produce the same outcome after resume.
- [ ] Success and failure yield different legal ally responses. The false claim is treated as that actor's belief, never as a discovered world fact or a change to the witness's actual fate.
- [ ] A hidden, dead, or absent ally; an unoffered tactic; and a repeated one-attempt challenge are rejected without an extra draw or time advance.
- [ ] Scripted-AI and command journeys, including provider failure after commit, produce one event set and replay under the new runtime tuple.

### Blocked by

4 — Distract a guard with a checked improvised action.

## 6 — Offer a carried item as a bribe

### What to build

The player offers a carried item that was originally useful for another purpose to a visible guard or ally. The validated profile says whether the offer is accepted, consumed, or refused. Acceptance changes a bounded relationship or access condition; refusal never causes an unexplained disappearance of the item.

### Acceptance criteria

- [ ] Command and AI play both accept an eligible visible NPC plus carried item and show exactly what was spent and what response changed.
- [ ] The item leaves inventory at most once after an accepted offer; a refused offer follows its authored cost policy. Neither route silently uses the item's ordinary healing effect.
- [ ] An item already consumed, left in another room, or not eligible for the profile cannot be offered; an absent/dead NPC cannot accept it. Invalid attempts leave state, time, and RNG intact.
- [ ] Scene, inventory, relationship/history, save/resume, and ending agree about the exchange; older adventures' item and healing behavior remains unchanged.

### Blocked by

2 — Barricade a visible passage and find it changed after resume.

## 7 — Follow a witness after a witnessed departure

### What to build

When a witness visibly leaves along an adjacent route, the player can follow before the trail expires. The engine resolves movement on the actual connection graph. If the route is blocked, the witness is dead, or the trail is lost, the player receives a truthful reason and another way to proceed.

### Acceptance criteria

- [ ] A witnessed departure creates a bounded follow opportunity. Following moves through one legal adjacent connection, with the declared day cost and no teleportation or skipped obstruction.
- [ ] Waiting too long, arriving after an off-screen departure, or losing the route makes following unavailable without claiming the witness remained nearby; a late route still completes.
- [ ] Command and AI requests behave consistently; NPC knowledge and player scene expose only witnessed or later learned movement.
- [ ] Follow success/failure and the witness's new location survive a process restart and replay; repeated follow cannot duplicate movement or threshold effects.

### Blocked by

3 — Wait several days while the raider plan advances.

## 8 — Interpret varied unexpected requests without inventing outcomes

### What to build

Players can phrase physical, social, item, and follow actions in varied natural language. The DM chooses an available proposal, asks for a missing target/tactic, or explains a specific impossibility. The terminal always shows engine-owned mechanics and a useful next step, even after provider failure. Command mode remains a complete API-key-free route through the sample.

### Acceptance criteria

- [ ] Varied phrasings for barricade, distraction, deception, bribe, and follow reach the correct offered profile/target without bypassing the one-mutation budget.
- [ ] Compound, hidden-target, ambiguous, impossible, and destructive requests neither mutate an unoffered fact nor claim false success. Where a supported narrower action is plausible, clarify it rather than silently substituting it.
- [ ] Authoritative mechanics, scenes, NPC replies, journal, and bounded/speaker-scoped DM history agree after a long gap and resume; fallback text accurately describes committed checks, costs, and effects.
- [ ] A scripted AI suite and bounded live-model review record exact content/prompt/tool/model identities and separate tool-selection safety from prose quality. Mixed command/AI diagnostic replay is either verified end to end or its limitation is explicit in the handoff, per the first ticket's contract decision.

### Blocked by

4 — Distract a guard with a checked improvised action; 5 — Deceive an ally in an opposed check; 6 — Offer a carried item as a bribe; 7 — Follow a witness after a witnessed departure.

## 9 — Qualify the complete two-session flexible adventure

### What to build

The complete adventure lets an unfamiliar player improvise, experience the resulting world changes, resume, and reach an ending after either success or failure. Record reproducible automated, live-model, and player evidence for the increment exit criterion, and fix any failure that contradicts the stated authority or route contracts.

### Acceptance criteria

- [ ] Frozen weird-behavior cases include attack the quest giver, refuse, leave town, burn the quest location, deceive an ally, wait days, unusual item use, barricade, distraction, bribe, follow, stale/hidden/ambiguous targets, compound requests, combat, and dead/absent actors. Each case has expected category, legal effect/refusal, time cost, and viable continuation.
- [ ] At least 20 previously unseen phrasings yield at least 16 coherent category/target selections, zero unauthorized mutations or false success claims, and a continuation after every supported failure branch; report misses per category.
- [ ] Seeded command and scripted-AI two-session routes cover on-time/late endings, different solutions to an obstacle, failed checks, item spending, multiple clock thresholds, and witness following. State, RNG, save, and linked trace replay match uninterrupted routes.
- [ ] Canonical seven-gate verification passes with zero warnings. A clean checkout installs, builds, starts, saves, resumes, and replays using tracked code plus artifacts created by that run; released adventures/saves/traces retain their contracts.
- [ ] A small live-model review and an unfamiliar-player exercise record actual utterances, outcomes, recovery, contradictions, and limits. The handoff supplies concrete PowerShell startup/resume commands, in-game commands and expected branch results, and clearly distinguishes scripted, live, and human evidence.

### Blocked by

8 — Interpret varied unexpected requests without inventing outcomes.
