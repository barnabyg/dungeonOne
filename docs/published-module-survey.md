# Published module survey

A comparison of four free published adventures with Dungeon One's shipped modules, to calibrate how large, dense and open our modules should be. It is a design note, not a decision: the recommendations at the end are proposals for issues.

Surveyed 2026-10-12.

## Sources

No openly licensed 5e adventure turned up. Free 5e modules on itch.io rarely state a licence, and SRD 5.2 has no adventure in it. Basic Fantasy RPG's adventures are all free PDFs, but its site sits behind a bot check that automated downloads can't pass. All four modules below are old-school (B/X, Labyrinth Lord or Swords & Wizardry style). Their structure carries over to 5e; their numbers do not.

| Module                          | Author   | Licence                                               | Where                                                                                                     |
| ------------------------------- | -------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Tomb of the Serpent Kings, v4.0 | Skerples | CC BY-NC-SA (stated in the PDF)                       | [Coins and Scrolls](https://coinsandscrolls.blogspot.com/2017/06/osr-tomb-of-serpent-kings-megapost.html) |
| The Red Demon in the Vile Fens  | Gus L.   | CC BY-NC-SA (the archive page; not stated in the PDF) | [All Dead Generations](https://alldeadgenerations.blogspot.com/p/pdf-adventure-archives.html)             |
| Obelisk of Forgotten Memories   | Gus L.   | as above                                              | as above                                                                                                  |
| Along the Road of Tombs         | Gus L.   | as above                                              | as above                                                                                                  |

The NC terms mean none of their text, monsters or maps can go into Dungeon One. This note takes only structure and technique from them.

## Size

| Module                    | Levels            | Length                  | Keyed areas                   | Typical entry |
| ------------------------- | ----------------- | ----------------------- | ----------------------------- | ------------- |
| Tomb of the Serpent Kings | 1 (ends at 2–3)   | 24 pages, ~11,000 words | 52 on 3 levels                | 40–200 words  |
| Red Demon                 | 3–4               | 12 pages, ~5,600 words  | 9                             | 150–400 words |
| Obelisk                   | 1–3               | 53 pages, ~26,000 words | 10 areas, ~26 rooms, 2 levels | 150–400 words |
| Road of Tombs             | ~5–8 (not stated) | 41 pages, ~25,000 words | ~38 in 5 sections             | 150–400 words |

Dungeon One's 15 shipped modules have 2 to 10 rooms (Abandoned Delve is the largest). A room's description and features run 16–76 words, median 29. That count leaves out encounters and checks, which are stored apart from rooms, and our descriptions are player-facing, while published entries are written for the GM. Even so, one published room usually holds more distinct things to find than one of ours.

Serpent Kings expects 12–24 hours at the table and one first session for its 7-room first level. Our modules are sized for one sitting, which is closer to that first level than to a whole published module.

## Structure

- **Several ways in.** Every module has at least two entrances. Obelisk's graveyard hub has four routes underground. Each of Road of Tombs' five sections has its own entrance at ground level. Red Demon has three ways into the tank.
- **Loops and secret shortcuts.** Serpent Kings is built as a teaching curve. Level 1 is a straight corridor, level 2 is a corridor with side rooms, and level 3 has "two horizontal and three vertical paths" plus a secret way back up and a tunnel to the surface. Road of Tombs joins its sections with secret doors and a flooded tunnel. Our modules are mostly trees: only Abandoned Delve, Hollow Chantry and Wolfstone Hillfort have as many passages as rooms.
- **A blank to extend.** Serpent Kings leaves a treasure room and a chasm for the GM to fill.

## Contents of a room

None of the four uses read-aloud text. A typical entry gives, in order:

1. sensory detail and what the room once was;
2. the occupants, with stats in the entry or a short pointer to an appendix;
3. how they fight or behave;
4. treasure, with gp values;
5. secrets and traps, each with how it is found and how it is avoided.

Serpent Kings adds a map key with dimensions, smells and contents for every room, and tags each room with the lesson it teaches. Obelisk writes each room twice: as it is normally, and after the cult is alerted.

## Encounter mix

Fights are a minority of rooms in every module.

| Module              | Fights | Traps and hazards | Puzzles and secrets | Talk and trade                  | Empty or atmosphere |
| ------------------- | ------ | ----------------- | ------------------- | ------------------------------- | ------------------- |
| Serpent Kings (52)  | ~10    | ~12               | ~10                 | 3                               | ~8                  |
| Obelisk (~26)       | ~9     | ~7                | ~3                  | ~6                              | ~4                  |
| Road of Tombs (~38) | ~14    | ~6                | ~7                  | many (12 named inn staff alone) | ~6                  |

Counts are approximate: many rooms are more than one kind. Wandering monsters are common: Serpent Kings uses one d8 table on level 3 only (three of its eight results are omens, not monsters), Obelisk has separate day and night tables, and Road of Tombs has one per area. Road of Tombs caps one of its tables: a pack that is destroyed doesn't return.

## Techniques worth borrowing

- **Teach a pattern, then vary it.** In Serpent Kings, hollow statues hold gold and poison, so the second coffin rewards caution; statues hide secret doors throughout; the first level's hammer trap returns later, swinging the other way over a chasm. This is data, not judgement, so it suits a computer-run game.
- **Monsters with states and wants.** Serpent Kings' basilisk is hungry, digesting, curious or happy, can be fed and tamed, and is worth more alive than dead. Its key is under the basilisk's collar. Obelisk's fleas turn hostile only if graves are looted.
- **Scripted tactics.** Road of Tombs' hound-master shatters the lamp in round 1, releases the hounds in round 2, flees, and backstabs a caster later. The inn escalates through misdirection, drugged drink, a staged attack and a night ambush. Both are small state machines.
- **A shared defender pool.** Obelisk's cult is one pool of acolytes, zombies and skeletons. They fall back toward a final room, spike doors and set traps over time, and other factions move into rooms the party has cleared.
- **Alert states.** Rooms change when the defenders know the party is there.
- **A weakness kept somewhere else.** Road of Tombs' cult captain rises again until her heart, hidden in another room, is found. Serpent Kings' black pudding regenerates unless burned.
- **Treasure that must be found.** It is under bones, in muck, in statues, behind a trap, or too heavy to carry. Little sits in plain view.
- **Information you discover.** Murals, records, journals, a ghost who knows the floor plan, and rumour tables marked true or false.

## What doesn't carry over

- Open-ended bargaining, "up to the GM" force allocation and reaction-roll moods need hard rules before an engine can run them.
- Treasure that matters only to a human referee: wagon-loads, goods that need an expert to value, contraband.
- Wildly uneven danger. Serpent Kings' first level has a hammer that kills outright, and Road of Tombs puts a titan you can't fight beside zero-level children. Our balance gate rejects that, and should.
- Science-fantasy setting material (guns, orbital gods) and grotesque content (Road of Tombs' cannibal cult).

## Proposals

Ranked by value for cost. Each would be its own issue.

1. **Denser rooms, not more of them.** Aim for 2–4 things to search or examine per room (hidden loot, a clue, a hazard), plus a sensory line, before adding rooms or fights.
2. **Repeated trap and secret patterns within a module.** Introduce one safely, then vary it. The data model already has features and checks.
3. **Alert state for defenders.** Make one module's rooms change after an alarm (reinforced, trapped, emptied). This builds on the existing reaction and morale rules.
4. **More than one route and a secret loop in new modules.** This costs gate time, because the gate has to judge more than one route.
5. **A longer, multi-level module.** A Serpent Kings-sized piece (around 30 rooms on 2–3 levels) would test whether rests, wandering monsters and the treasure budget hold up over a long delve.
