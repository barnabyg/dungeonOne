# Increment 11 ticket proposal

Status: approved by the project owner and published as GitHub issues #125–#140 on 4 October 2026. Every issue has the `ready-for-agent` label and native blocking links. Source: the [D&D 5e expansion plan](dnd-expansion-implementation-plan.md), section 4, with the owner decisions in its section 10.

The published issues are the source of truth for each ticket's scope and acceptance criteria. This document is the publication record.

## Breakdown change before publication

The first draft had thirteen layered slices: a combat engine, then a runtime, then AI DM tools, with the browser only arriving near the end. Before publication it was reworked into sixteen vertical slices, each of which can be played end to end in the browser under the temporary `--5e` flag:

- one fight against one opponent comes first;
- group fights, Fighter features and exploration follow it independently;
- checks, doors, traps and talk, then treasure, XP and endings, build on exploration;
- the balance harness and difficulty gate qualify the complete feature set;
- then the dungeon is written, the browser switches over, the CLI test routes are rebuilt and the old game is removed.

## Shared implementation contract

Every published issue repeats this contract:

- **Fresh 5e start:** SRD 5.2, with all pre-5e gameplay removed by the end of the increment.
- **Throwaway formats:** one format version per file type; older files refused with a clear message, never deleted or migrated, until the owner declares a stable release.
- **Transition flag:** `--5e` until #137, so `main` stays playable.
- **Engine authority** over dice, targets, HP, saves, outcomes, treasure and XP.
- **No positions:** positional rules omitted or abstracted; ranged weapons deferred.
- **Early levels are dangerous:** common-tier starting gear, and no likely one-hit kills of ordinary enemies.
- **Licensing:** SRD 5.2 only.
- **Testing:** commit per ticket, browser → API → storage for critical journeys, `npm.cmd run verify` with zero warnings before pushing.

## Publication index

| Issue                                                     | Plan slice       | Title                                                                       | Blocked by             |
| --------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------- | ---------------------- |
| [#125](https://github.com/barnabyg/dungeonOne/issues/125) | 11.1             | Record the fresh 5e start in ADR 0005 and the docs                          | None                   |
| [#126](https://github.com/barnabyg/dungeonOne/issues/126) | 11.2             | Decouple shared infrastructure from the old runtimes                        | None                   |
| [#127](https://github.com/barnabyg/dungeonOne/issues/127) | 11.3             | Roll and save a 5e Fighter with 4d6-drop-lowest                             | #125, #126             |
| [#128](https://github.com/barnabyg/dungeonOne/issues/128) | 11.4, 11.5, 11.6 | Fight one opponent in a one-room 5e adventure module                        | #127                   |
| [#129](https://github.com/barnabyg/dungeonOne/issues/129) | 11.4, 11.10      | Fight several opponents at once                                             | #128                   |
| [#130](https://github.com/barnabyg/dungeonOne/issues/130) | 11.4             | Use Fighter features in combat                                              | #128                   |
| [#131](https://github.com/barnabyg/dungeonOne/issues/131) | 11.5, 11.6       | Explore rooms, examine features and use items                               | #128                   |
| [#132](https://github.com/barnabyg/dungeonOne/issues/132) | 11.5, 11.6       | Make checks, face doors and traps, and talk                                 | #131                   |
| [#133](https://github.com/barnabyg/dungeonOne/issues/133) | 11.5             | Earn treasure and XP, escape and level up                                   | #131                   |
| [#134](https://github.com/barnabyg/dungeonOne/issues/134) | 11.7             | Qualify an adventure module across seeds, play styles and rolled characters | #129, #130, #132, #133 |
| [#135](https://github.com/barnabyg/dungeonOne/issues/135) | 11.8             | Gate adventure modules on their declared difficulty                         | #134                   |
| [#136](https://github.com/barnabyg/dungeonOne/issues/136) | 11.9             | Write the abandoned-dungeon adventure module                                | #135                   |
| [#137](https://github.com/barnabyg/dungeonOne/issues/137) | 11.10            | Make 5e the browser's only mode                                             | #136                   |
| [#138](https://github.com/barnabyg/dungeonOne/issues/138) | 11.11            | Rebuild the CLI test routes on the dungeon                                  | #136                   |
| [#139](https://github.com/barnabyg/dungeonOne/issues/139) | 11.12            | Remove the pre-5e game                                                      | #137, #138             |
| [#140](https://github.com/barnabyg/dungeonOne/issues/140) | 11.13            | Qualify the 5e release and write the player handoff                         | #139                   |

#125 and #126 can start immediately and in parallel. After #128, #129, #130 and #131 can run in parallel. After #136, #137 and #138 can run in parallel.

Three tickets pause for the owner:

- #125: the owner reviews the ADR and documentation before #127 merges.
- #135: starts by settling the "too easy" measure with the owner.
- #136: the owner approves the premise, room map and encounter list before content is written.
