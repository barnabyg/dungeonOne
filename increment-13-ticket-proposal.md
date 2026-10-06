# Increment 13 ticket proposal

Status: approved by the project owner and published as GitHub issues #231–#241 on 6 October 2026. Every issue has the `ready-for-agent` label and native blocking links. Source: the [D&D 5e expansion plan](dnd-expansion-implementation-plan.md), section 6, with the owner decisions in its section 10.

The published issues are the source of truth for each ticket's scope and acceptance criteria. This document is the publication record.

## Breakdown changes before publication

The plan's six slices were reworked into eleven vertical slices, each playable or checkable end to end:

- **Bestiary first.** Every module authors its monsters inline today. Moving the nine shipped stat blocks into a shared bestiary is gameplay-neutral, so it lands first as its own ticket (#231) and gives later tickets one place to add traits, resistances, morale and treasure types.
- **Conditions arrive with their monsters.** A conditions engine on its own is a layer with no visible effect. 13.1 and 13.2 are split by monster instead: poison, prone and Pack Tactics (#232), undead resistances and Undead Fortitude (#233), the Ghoul's paralysis (#234), then the remaining classic monsters with Multiattack, Nimble Escape and Rampage (#235). Each upgrades a monster the shipped modules already use.
- **Three conditions dropped.** Frightened, restrained and unconscious have no monster that needs them without positions, and unconscious can't arise while 0 HP is instant defeat.
- **Encounter estimator split out.** 13.2's ad-hoc harness criterion becomes its own author tool (#236).
- **Surrender split from fleeing.** Morale and fleeing (#237) are the core; surrender into a talkable creature (#238) builds on them.
- **Treasure value before monster loot.** 13.4 (#239) gives treasure a value and a per-level budget; 13.5 (#240) rolls monster loot from treasure types against it.

## Owner decisions

Settled on 6 October 2026 (plan section 10):

- **Fled monsters (open decision 4):** no XP, and their loot leaves with them.
- **+1 gear (open decision 5):** waits for magic in increment 16.
- **Conditions:** only poisoned, prone and paralysed in this increment.
- **Monster names and types:** need not match SRD 5.2 exactly. Stat blocks come from SRD 5.2 where one exists, and are original house stat blocks otherwise; never copied from a non-SRD book.

## Shared implementation contract

Every published issue repeats this contract:

- **Throwaway formats:** one format version per file type, including the new bestiary; older files refused with a clear message, never deleted or migrated.
- **Engine authority** over dice, saves, conditions, morale, prices and outcomes, with a rejection path for each new tool.
- **Found or given:** treasure, gear and coin are found, given or traded, never simply awarded.
- **Adventure rollback:** surviving completion keeps what the character holds at the end; defeat or abandonment restores the start.
- **Balance gate:** a shipped module that a ticket's monster changes push out of its difficulty is adapted or re-declared in that ticket.
- **No positions**, **common-tier starting gear** and **SRD 5.2 or original stat blocks**.
- **Testing:** commit per ticket, browser → API → storage for critical journeys, `npm.cmd run verify` with zero warnings before pushing.

## Publication index

| Issue                                                     | Plan slice  | Title                                                                                        | Blocked by             |
| --------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- | ---------------------- |
| [#231](https://github.com/barnabyg/dungeonOne/issues/231) | 13.2 (prep) | Move the shipped monsters into a shared bestiary                                             | None                   |
| [#232](https://github.com/barnabyg/dungeonOne/issues/232) | 13.1, 13.2  | Monsters poison and knock prone                                                              | #231                   |
| [#233](https://github.com/barnabyg/dungeonOne/issues/233) | 13.2        | Undead resist damage and refuse to fall                                                      | #231                   |
| [#234](https://github.com/barnabyg/dungeonOne/issues/234) | 13.1, 13.2  | Ghouls paralyse                                                                              | #232                   |
| [#235](https://github.com/barnabyg/dungeonOne/issues/235) | 13.2        | Fill out the bestiary with the remaining classic monsters                                    | #232, #233             |
| [#236](https://github.com/barnabyg/dungeonOne/issues/236) | 13.2        | Estimate an encounter's danger from bestiary IDs                                             | #231                   |
| [#237](https://github.com/barnabyg/dungeonOne/issues/237) | 13.3        | Monsters check morale and flee                                                               | #231                   |
| [#238](https://github.com/barnabyg/dungeonOne/issues/238) | 13.3        | Surrendered monsters become talkable                                                         | #237                   |
| [#239](https://github.com/barnabyg/dungeonOne/issues/239) | 13.4        | Give treasure a value and a budget per level                                                 | None                   |
| [#240](https://github.com/barnabyg/dungeonOne/issues/240) | 13.5        | Leave monster loot on remains from treasure types                                            | #231, #239             |
| [#241](https://github.com/barnabyg/dungeonOne/issues/241) | 13.6        | Release adventures with bestiary encounters and level-scaled treasure, and write the handoff | #234, #235, #238, #240 |

#231 and #239 can start immediately and in parallel. After #231, #232, #233, #236 and #237 can run in parallel.

One ticket pauses for the owner:

- #241: the owner approves the premise, room map, monster choice and treasure placement before content is written.
