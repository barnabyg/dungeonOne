# Increment 14 ticket proposal

Status: approved by the project owner and published as GitHub issues #280–#291 on 8 October 2026. Every issue has the `ready-for-agent` label and native blocking links. Source: the [D&D 5e expansion plan](dnd-expansion-implementation-plan.md), section 7, with the owner decisions in its section 10.

The published issues are the source of truth for each ticket's scope and acceptance criteria. This document is the publication record.

## Breakdown changes before publication

The plan's five slices were reworked into twelve vertical slices, each playable or checkable end to end:

- **One check path first.** Doors, traps and topics each roll, remember and show their checks separately today. Moving them onto one path is gameplay-neutral, so it lands first (#280) and lets later tickets grade every check site at once.
- **14.1 split by capability.** Graded bands with discovery, item and damage effects (#281), routes opened or closed with fail-forward validation (#282), alternative approaches (#283), then retries and circumstantial advantage (#284).
- **14.2 folded in.** The AI DM's tool changes, prompt and scripted-DM cases ship with the mechanic they cover (#281, #283, #284), so each is playable through the DM when it lands.
- **Three effect types dropped.** There is no adventure clock, no NPC attitude, and conditions end with the fight.
- **14.4 split by level.** Level 4 with the ASI and a fourth weapon mastery (#286), then level 5 with Extra Attack (#287). The plan omitted the 2024 Fighter's fourth weapon mastery at level 4. Tactical Shift needs movement, so it is omitted.
- **Monsters for levels 4–5.** The bestiary has only the ogre for levels 4–5, so new monsters get their own ticket (#288).
- **14.5 split.** A level 3–4 module (#289), a career simulation through the shipped modules (#290), then a level 4–5 module with the handoff (#291).

## Owner decisions

Settled on 8 October 2026 (plan section 10):

- **Check effects:** discovery, item, damage and route opened or closed. NPC attitude moves to reaction rolls in increment 15. Conditions given outside a fight wait for in-adventure rests in increment 16. The clock effect is dropped.
- **Graded outcomes everywhere:** doors, traps and topics use the same graded model as feature checks.
- **Level 4 choices are pending:** settling credits the level. The level-up card asks for the ASI and the fourth mastery, and the character can't start another adventure until both are chosen.
- **Content strategy (open decision 6):** hand-author the modules; no 5e generator.

## Shared implementation contract

Every published issue repeats this contract:

- **Throwaway formats:** one format version per file type; older files refused with a clear message, never deleted or migrated.
- **Engine authority** over dice, DCs, bands, effects, saves, prices and outcomes, with a rejection path for each new tool.
- **Remembered checks:** asking again never rerolls; only an authored retry rolls again.
- **Found or given:** a check band can reveal an item, but never simply awards one.
- **Adventure rollback:** surviving completion keeps what the character holds at the end; defeat or abandonment restores the start.
- **Balance gate:** a shipped module that a ticket's changes push out of its difficulty is adapted or re-declared in that ticket.
- **No positions**, so Tactical Shift and other movement rules are omitted and listed in the rules document.
- **SRD 5.2 or derived stat blocks, never exact copies of protected ones.**
- **Testing:** commit per ticket, browser → API → storage for critical journeys, `npm.cmd run verify` with zero warnings before pushing.

## Publication index

| Issue                                                     | Plan slice  | Title                                                         | Blocked by       |
| --------------------------------------------------------- | ----------- | ------------------------------------------------------------- | ---------------- |
| [#280](https://github.com/barnabyg/dungeonOne/issues/280) | 14.1 (prep) | Resolve door, trap and topic checks through one check path    | None             |
| [#281](https://github.com/barnabyg/dungeonOne/issues/281) | 14.1, 14.2  | Give a feature's check graded outcomes                        | #280             |
| [#282](https://github.com/barnabyg/dungeonOne/issues/282) | 14.1        | Checks open or close routes                                   | #281             |
| [#283](https://github.com/barnabyg/dungeonOne/issues/283) | 14.1, 14.2  | Offer alternative approaches to one obstacle                  | #281             |
| [#284](https://github.com/barnabyg/dungeonOne/issues/284) | 14.1, 14.2  | Authored retries and circumstantial advantage                 | #283             |
| [#285](https://github.com/barnabyg/dungeonOne/issues/285) | 14.3        | Qualify modules on always-fail and always-succeed checks      | #282             |
| [#286](https://github.com/barnabyg/dungeonOne/issues/286) | 14.4        | Extend the Fighter to level 4                                 | None             |
| [#287](https://github.com/barnabyg/dungeonOne/issues/287) | 14.4        | Extend the Fighter to level 5                                 | #286             |
| [#288](https://github.com/barnabyg/dungeonOne/issues/288) | 14.5 (prep) | Add bestiary monsters for levels 4–5                          | #287             |
| [#289](https://github.com/barnabyg/dungeonOne/issues/289) | 14.5        | Release a level 3–4 module with graded checks                 | #284, #285, #286 |
| [#290](https://github.com/barnabyg/dungeonOne/issues/290) | 14.5        | Simulate a career through the shipped modules                 | #289             |
| [#291](https://github.com/barnabyg/dungeonOne/issues/291) | 14.5        | Release a level 4–5 module and write the increment 14 handoff | #287, #288, #290 |

#280 and #286 can start immediately and in parallel. After #281, #282 and #283 can run in parallel.

Two tickets pause for the owner:

- #289 and #291: the owner approves the premise, room map, monster choice, check design and treasure placement before content is written.
