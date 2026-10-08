# Increment 15 ticket proposal

Status: approved by the project owner and published as GitHub issues #300–#311 on 8 October 2026. Every issue has the `ready-for-agent` label and native blocking links. Source: the [D&D 5e expansion plan](dnd-expansion-implementation-plan.md), section 8, with the owner decisions in its section 10.

The published issues are the source of truth for each ticket's scope and acceptance criteria. This document is the publication record.

## Breakdown changes before publication

The plan's five slices were reworked into twelve vertical slices:

- **Class data first.** The Fighter is hard-coded and `Fighter*` names reach 14 source files, so 15.3 lands as a gameplay-neutral prefactor (#300) with golden tests.
- **15.1 split by direction.** Sneaking in and ambushing (#301), sneaking past (#302), then monsters lurking for the character (#303). Stealth and passive Perception arrive with #301.
- **15.2 split.** The reaction roll with attack and let-pass options (#304), then parley, tolls and trade (#305).
- **15.4 split by level.** Level 1 with Expertise and Sneak Attack (#306), levels 2–3 with Cunning Action, Steady Aim and the Thief (#307), levels 4–5 with the ASI, Cunning Strike and Uncanny Dodge (#308).
- **15.5 split.** Thieves' tools for locks and traps (#309), qualifying every shipped module for both classes (#310), then the release module and handoff (#311).
- **Missing skills added where first used.** Stealth (#301), Deception (#305), Investigation and Sleight of Hand (#306).

## Owner decisions

Settled on 8 October 2026 (plan section 10):

- **Picking locks needs thieves' tools.** Without them, force or break the door or find the key.
- **Steady Aim is kept as written**, although "haven't moved" always holds without positions.
- **Hide is abstracted** as a bonus-action Stealth check against the best passive Perception, giving advantage on the next attack.
- **Sneak Attack's ally clause is omitted** until companions.
- **Reaction eligibility is an explicit module flag**, off by default; mindless opponents are never eligible.
- **#297 blocks #310.** The gate's talk-only gap is fixed before the two-class qualification.
- **Sneaking past gives no XP by default**; an encounter may author an award.

## Shared implementation contract

Every published issue repeats the increment 14 contract, extended with surprise and reaction bands under engine authority, remembered Stealth and reaction rolls, Dash/Disengage/Withdraw and the ally clause under no positions, and reaction rolls documented as a house rule.

## Publication index

| Issue                                                     | Plan slice | Title                                                                          | Blocked by             |
| --------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ | ---------------------- |
| [#300](https://github.com/barnabyg/dungeonOne/issues/300) | 15.3       | Define the Fighter as class data                                               | None                   |
| [#301](https://github.com/barnabyg/dungeonOne/issues/301) | 15.1       | Sneak into an encounter room and ambush                                        | None                   |
| [#302](https://github.com/barnabyg/dungeonOne/issues/302) | 15.1       | Sneak past an encounter                                                        | #301                   |
| [#303](https://github.com/barnabyg/dungeonOne/issues/303) | 15.1       | Lurking monsters surprise the character                                        | #301                   |
| [#304](https://github.com/barnabyg/dungeonOne/issues/304) | 15.2       | Roll reactions when a fight would start                                        | #301                   |
| [#305](https://github.com/barnabyg/dungeonOne/issues/305) | 15.2       | Parley, tolls and trade from a reaction                                        | #304                   |
| [#306](https://github.com/barnabyg/dungeonOne/issues/306) | 15.4       | Create a level-1 Rogue                                                         | #300, #301             |
| [#307](https://github.com/barnabyg/dungeonOne/issues/307) | 15.4       | Rogue levels 2–3: Cunning Action, Steady Aim and the Thief                     | #306                   |
| [#308](https://github.com/barnabyg/dungeonOne/issues/308) | 15.4       | Rogue levels 4–5: ASI, Cunning Strike and Uncanny Dodge                        | #307                   |
| [#309](https://github.com/barnabyg/dungeonOne/issues/309) | 15.5       | Thieves' tools for locks and traps                                             | #306                   |
| [#310](https://github.com/barnabyg/dungeonOne/issues/310) | 15.4, 15.5 | Qualify the shipped modules for both classes                                   | #297, #308, #309       |
| [#311](https://github.com/barnabyg/dungeonOne/issues/311) | 15.5       | Release a stealth, reaction and lock module and write the increment 15 handoff | #302, #303, #305, #310 |

#300, #301 and #297 can start immediately and in parallel. After #301, #302, #303 and #304 can run in parallel; after #306, #307 and #309 can.

Two tickets pause for the owner:

- #306: the owner approves the Rogue starting kits.
- #310 and #311: the owner approves each module adaptation, and the release module's design before content is written.
