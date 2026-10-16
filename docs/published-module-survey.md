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
- **Loops and secret shortcuts.** Serpent Kings is built as a teaching curve. Level 1 is a straight corridor, level 2 is a corridor with side rooms, and level 3 has "two horizontal and three vertical paths" plus a secret way back up and a tunnel to the surface. Road of Tombs joins its sections with secret doors and a flooded tunnel. Our modules were mostly trees when surveyed, with few having as many passages as rooms.
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

## Authoring proposals

These need no engine work. Each would be its own issue.

1. **Denser rooms, not more of them.** Aim for 2–4 things to search or examine per room (hidden loot, a clue, a hazard), plus a sensory line, before adding rooms or fights. The format already allows 12 features per room and 2,000-character descriptions.
2. **Repeated trap and secret patterns within a module.** Introduce one safely, then vary it, using the existing features, checks, hidden passages and passage traps.
3. **More than one route and a secret loop in new modules.** The format allows loops and several exit rooms already. Expect a cost in gate time, and note that the gate judges only one route (see below).

## What the engine would need

Measured against the format, runtime, gate, browser and AI DM as of format 31 (save format 52). Paths are to `src/`. A module of the samples' scale and quality is not mainly blocked by size. It is blocked by what a room can do, what the world remembers between rooms, and what the gate can prove.

### Two basic mismatches

- **One character, not a party.** All four samples assume 4–6 characters: their danger, splitting up, characters helping each other, and treasure per character. Dungeon One has one character until companions arrive (planned for increment 17). A published-scale module either waits for companions or is designed for one hero from the start.
- **The character can't leave a fight.** Entering a room starts its fight, and fleeing is deferred (see Moving in [character-rules.md](character-rules.md)). The samples' central lesson is that you don't have to fight: sneak past the basilisk, outrun the guardian, lure the pudding into a trap. Without fleeing, those rooms are only fights. This is the largest gap in quality, and it has nothing to do with size.

### State and behaviour

These are new systems and the expensive part.

- **World flags and conditional content.** World state is a fixed set of fact lists (`FifthState`, `runtime-5e.ts`), and circumstances only change advantage, disadvantage and retries. Alert states, a lever that opens a door elsewhere, a room that changes after an event, and talk topics unlocked by progress all need flags that switch passages, encounters and topics on and off.
- **Using an item on a feature.** `use_item` covers potions only, and there is no puzzle mechanism. Replacing a missing key-statue or burning a regenerating monster needs one.
- **Monsters that move.** Every encounter is pinned to one room, and fled monsters are gone for good. Factions, reinforcements, retreating defenders and a shared defender pool need encounters that can change rooms.
- **Wandering monsters.** A module has at most one wandering encounter, rolled only when resting. Published modules check by time or noise, from a table.
- **Traps in rooms.** Traps exist only on passages.

### Scale

Mostly limits and rules decisions.

- **The encounter cap.** It is 20 per module (`adventure-5e.ts`). Serpent Kings has about 20 fights plus wanderers. The 50-room cap is at the target size.
- **Budgets.** Treasure, XP, difficulty and rests are all per module and assume one sitting at one level band. A 40-room delve gets the same 750 gp as a 2-room one. Either budget by section and allow levelling mid-module, or ship a large dungeon as chained parts settled in between; the career simulation already models that.
- **Rests per day,** not per adventure, once a delve spans several sittings.
- **One start room.** Several entrances can be faked with an approach room joined to each of them.

### The gate

- **Coverage, not CPU.** The gate plays one deterministic, fight-avoiding route to the objective (`balance-5e.ts`). In a large branching module, most fights would be optional and never judged for deadliness, and other routes are never compared. It needs to judge per route or per region.
- **Proof gets harder.** Every new state feature must also satisfy the validator's reachability rules and be playable by the harness. Flags multiply the states to prove. This is where the real cost of the state work lies.
- **CPU.** A 40-room module would add an estimated 60–150 s, against a 180 s cap of which CI already uses about 155 s. It needs a budget per module or fewer seeds.
- **Release runs** are hand-scripted step lists capped at 400 turns (`release-run-5e.ts`). A large module needs a generated route. (Done in #409: `generateReleaseRun` takes the steps from the harness's cautious run, capped at 40 turns a room.)
- **Talk.** The gate never talks, so content reachable only by talking fails as unreachable. Faction play leans on talk.

### Browser, AI DM and saves

- **Orientation.** There is no map, list of visited rooms or record of discoveries, so a 40-room dungeon would lose players. A list of known rooms and found clues is the minimum.
- **The AI DM sees only the current room** and the last 4 exchanges (`dm-turn.ts`, `session-5e.ts`). It can't recall a conversation or a clue from elsewhere, so it needs a progress summary in its scene.
- **Saves.** Any edit to a module orphans saves made with it, because loading checks the module digest, and every response sends the whole history. Both are tolerable for a short module and painful for a delve played over several sittings.

### Suggested order

Aim first at the quality of Serpent Kings' first level, not its 52 rooms: about 15–20 dense rooms with two routes and a loop.

1. Fleeing a fight.
2. World flags with conditional passages, encounters and topics, and using an item on a feature. These give alert states, levers and key puzzles.
3. A list of known rooms and found clues, in the browser and in the AI DM's scene.
4. Gate judgement per route.
5. Scale: the encounter cap, budgets by section, rests per day, wandering monsters by time.

Whether published-scale modules wait for companions should be decided before anything large is designed.
