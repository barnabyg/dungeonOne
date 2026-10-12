# Increment 17 ticket proposal

Status: **draft for owner review**, 12 October 2026. Nothing is published yet. Sources: the [published module survey](docs/published-module-survey.md) and the [D&D 5e expansion plan](dnd-expansion-implementation-plan.md). Baseline: `main` at `5d0bb47`.

**Playable result:** a single character explores a two-level dungeon of about 20 rooms, closer in depth to the published modules the survey read. The character can run from a fight, set off alarms that change the dungeon, solve a puzzle with something it found, use the room against a monster, meet wandering monsters as it explores, and keep track of where it has been and what it has learned.

## 1. Roadmap change: no companions

The owner expects the game to stay single-player (12 October 2026). The plan's increment 17, Companions, is replaced by this one, and its open decision 7 is closed as "no companions". Increment 18, the shared campaign world, is unchanged.

The plan's section 10 and increment table are updated when this proposal is approved, not before.

## 2. The target module

The module is smaller than the survey's samples but has the same kinds of content. Proposed shape, for approval in T13 before any content is written:

| Aspect     | Target                                                                                                        | Today's largest                    |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Rooms      | 18–24, in two regions (an upper and a lower level), each with its own feel                                    | 10 (the Abandoned Delve)           |
| Fights     | 9–12, most avoidable, at most two on the required path                                                        | 6 (the Hollow Chantry)             |
| Room depth | 2–4 things to examine or search in most rooms, and a sensory line                                             | median 29 words, often one feature |
| Routes     | Two ways into the lower level, a secret loop, and an exit from each level                                     | mostly one route                   |
| Set pieces | One monster best avoided, lured or tricked; one alarm that changes the dungeon; one puzzle; one repeated trap | none                               |
| Talk       | One faction or creature that can be bargained with                                                            | single creatures                   |
| Levels     | One level band (D7)                                                                                           | 1–2 levels                         |

It stays under every format cap except, possibly, the encounter cap of 20 once wandering encounters are counted (T7).

## 3. Making it work for one character

The samples assume a party of four to six. A solo game needs other ways to give the same experience, as single-player games like Skyrim do: avoid more, recover more, and know more.

| A party gives                                  | Single-player replacement                                                                                      | Where                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Enough hit points to survive a bad fight       | Running away, and fights sized for one (at most two foes on the required path, as the gate already forces)     | T2; authoring            |
| Someone to hold the line while another escapes | Fleeing at a cost; Rogue's Disengage                                                                           | T2                       |
| Clever teamwork against a big monster          | Room features usable in a fight (push it into the pit, drop the portcullis, lure it into the trap)             | T6                       |
| A scout, a lookout, a sage                     | Clues and omens written into rooms, wandering-monster omens, a record of what has been learned                 | T7, T9; authoring        |
| Healing from another character                 | Rest sites on each level, more rests in a long module, potions placed before set pieces                        | T8; authoring            |
| A second chance when one character falls       | An exit on each level, so a hurt character can leave and keep what it found; avoidance before every hard fight | authoring; T10 checks it |
| Splitting treasure                             | Nothing: the budget is already per character                                                                   | —                        |

0 HP stays an instant defeat (owner, 4 October). A long module makes that harsher, because defeat rolls back more. The exit on each level is the answer this proposal recommends; D9 asks whether that is enough.

## 4. What exists and what is missing

Checked against `main`:

| Needed                       | Exists today                                                                                                                                      | Missing                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Avoiding a fight             | Sneaking in and slipping past (#302), reaction rolls, parley, tolls (#304, #305), lurking (#303)                                                  | Leaving a fight once it has begun. Leaving with every foe turned already works (D13), so the unresolved-fight state exists. |
| Traps and searchable rooms   | Graded checks with damage bands on features (a statue that breathes poison), passage traps, hidden items, hidden passages, retries, circumstances | Nothing for this module                                                                                                     |
| Things that change the world | Check bands open and close passages; circumstances test items held, discoveries made and fights won                                               | General state: an event elsewhere that adds or moves a fight, unlocks a topic or changes a room                             |
| Puzzles                      | Checks with item circumstances (advantage with the rope)                                                                                          | Using an item on a feature as an action                                                                                     |
| Monsters that react          | Morale, fleeing monsters, surrender                                                                                                               | Defenders that gather, move or wait in ambush after an alarm                                                                |
| Wandering monsters           | One per module, rolled only when resting (#335)                                                                                                   | A table per region, rolled as the character explores                                                                        |
| Rests                        | Two short, one long per adventure, long only at a rest site                                                                                       | Limits sized for a long module                                                                                              |
| Orientation                  | The current room's panel                                                                                                                          | A list of known rooms and what was learned; the AI DM sees only the current room and the last four exchanges                |
| The gate                     | Judges one fight-avoiding route per class (`requiredPath`, `balance-5e.ts`); never talks                                                          | Judging more than one route; playing flags, items on features and fight features                                            |
| Release runs                 | Hand-scripted routes capped at 400 turns (`release-run-5e.ts`)                                                                                    | A route a long module can use                                                                                               |
| Treasure and XP              | One budget per module: 150 gp × maximum level; XP limited to about one level                                                                      | A budget for a long module (D6)                                                                                             |

Left out of increment 17:

- Levelling up mid-adventure: XP is credited only when an adventure ends. The module stays in one level band instead (D7).
- Monsters that hunt the character from room to room. Alarms move defenders between authored places instead (T5).
- Leaving a module and coming back later with its state kept. That belongs to the campaign world (increment 18).
- Saves surviving a module edit. A save still names the module's digest, and editing the module still orphans it.

## 5. Proposed tickets

"Owner pause" marks a ticket that stops for approval before content is written.

Shared contracts apply as in every increment: throwaway formats (each format change bumps its version and refuses older files), engine authority (each new mechanic adds an AI DM tool or parameter, refused when not offered, with evaluation cases), found or given, and adventure rollback.

### T1 — Regions and a count of moves (prefactor)

**What to build.** A room may name its `region` (a short id with a display name declared once in the module), such as the upper tomb and the lower tomb. The session counts the character's moves between rooms. Nothing uses either yet except the room panel, which shows the region's name, and the trace.

**Acceptance criteria**

- [ ] Adventure, session and trace formats bumped; the validator refuses an unknown region and a region no room uses.
- [ ] Shipped modules unchanged in play: same gate verdicts and pinned figures.
- [ ] Rules document updated.

**Blocked by:** none.

### T2 — Run from a fight

**What to build.** On its turn, the character may **flee** through an exit it could otherwise use (open, not closed). Each standing opponent able to act first makes one attack against it (D1), the house rule for opportunity attacks without positions. A Rogue may use Cunning Action's Disengage as a bonus action to flee without those attacks (D1 adds Disengage to Cunning Action). The character arrives in the next room; the fight stays unresolved as a turned-undead exit does today (D13): its fallen stay fallen, its standing foes keep their hit points and are met again on coming back. Foes don't follow (D2). Fleeing to an exit room may end the adventure by escaping, as leaving does now. Browser: a **Flee** control per exit in a fight; AI DM: a `flee` tool.

**Acceptance criteria**

- [ ] Engine tests: attacks on fleeing, Disengage, fleeing into a trap or a shut door refused, a fled fight met again with the same hit points, fleeing to an exit ends the adventure.
- [ ] A browser → API → storage test of fleeing and reloading.
- [ ] AI DM evaluation cases: "I run for the door", fleeing where no way is open.
- [ ] The harness's judged styles never flee (the gate stays a lower bound); a reported `retreat` style flees below its heal threshold and the gate report shows it.
- [ ] Rules document: the Exploring section's "fleeing waits for a later ticket" replaced; house rule recorded.

**Blocked by:** none.

### T3 — World flags and conditional content

**What to build.** A module declares named **flags**. A flag is set, never cleared (D3), by:

- a check band's new `set` effect;
- an encounter's outcome (won, slipped past, ended peacefully, or fled from by the character);
- taking an item;
- first entering a room;
- examining a feature.

Content may depend on flags:

- a passage is open or closed while a flag is set (extending today's open and close effects);
- an encounter is present in a room only while a flag is set or unset, or is placed in one room before a flag and another after it, so defenders can move between authored places;
- a feature has another description while a flag is set;
- a topic is offered only while a flag is set.

Circumstances (#284) gain a `flag` type.

The validator's reachability rules extend to flags: because flags only ever turn on, the set of reachable rooms and flags can be found by repeating until nothing changes, and the existing rules (an essential room reachable without a check, every exit reachable, no close cutting off the only route) are checked over it.

**Acceptance criteria**

- [ ] Engine tests for each trigger and each kind of condition; a reload restores flags from the transitions.
- [ ] Validator tests: a flag nothing sets, a condition on an unknown flag, an essential room reachable only behind a flag only a check sets, and a moving encounter that would block the only route.
- [ ] The harness plays conditional content through the real runtime; the gate verdicts of shipped modules unchanged.
- [ ] The AI DM's scene shows the room as its flags make it; it can't set a flag (no tool takes one).
- [ ] Adventure format bumped; rules document updated.

**Blocked by:** T1.

### T4 — Use an item on a feature

**What to build.** A feature may accept an item: `uses: [{ item, text, effects, consumes }]`, with the band effects (discovery, reveal an item, damage, open, close, set a flag). Browser: **Use … on …** in the feature's row while the character carries an item it accepts; AI DM: a `use_on` tool listing only offered pairs. Wrong item, or none carried, is refused without a roll. Covers the stone snake in the door, oil on the pudding's coffin, bread for the basilisk.

**Acceptance criteria**

- [ ] Engine and validator tests (unknown item, an item that can't be carried, effects as for bands).
- [ ] The harness uses an item on a feature when it carries one the feature accepts, before leaving the room.
- [ ] AI DM evaluation cases: the right item, the wrong item, an item not carried.
- [ ] Adventure format bumped; rules document updated.

**Blocked by:** T3.

### T5 — Alarms

**What to build.** A module may declare an **alarm**: a flag that noise sets. Noise is any of:

- a failed sneak by 5 or more;
- a fight in a region lasting past an authored round;
- a check band marked `noisy`;
- a monster that flees a fight and survives it.

The module authors what the alarm changes with T3's conditions: defenders gathered into a hall, a lurking ambush by a door, a barred gate, a creature that will no longer talk. The room panel says when an alarm has been raised, in the module's words.

**Acceptance criteria**

- [ ] Engine tests for each noise source; the alarm is set once and is remembered.
- [ ] A fixture module where the alarm moves an encounter and closes a passage, played by the harness.
- [ ] The gate's always-fail branch and the seeded runs both meet the alarm; its verdicts name the runs where it was raised.
- [ ] Rules document updated.

**Blocked by:** T3.

### T6 — Use the room in a fight

**What to build.** A feature may offer a **fight action**: on the character's turn, using its action, a check (one to four approaches, such as Athletics to topple the statue or Sleight of Hand to cut the chain) against one opponent, whose bands deal damage, give a condition (prone, paralysed, poisoned), or remove the opponent from the fight (pushed into the chasm: counted as defeated for XP, carrying its loot with it). Each is usable once per fight, or once per adventure (authored). Browser: the action in the Fight section; AI DM: a `use_feature` tool in fights.

**Acceptance criteria**

- [ ] Engine tests for each effect; a removed opponent counts as defeated and its loot is lost (#324's rule).
- [ ] The validator refuses removal against a boss (D4).
- [ ] The harness's judged styles don't use fight actions (lower bound); a reported style does.
- [ ] The gate's one-hit-kill measure ignores fight actions.
- [ ] Rules document updated.

**Blocked by:** T3.

### T7 — Wandering monsters as the character explores

**What to build.** Each region may have a **wandering table** of up to six entries, each an encounter placed in no room or an **omen** (words only, the "distant clink of a chain"). Every authored number of moves within the region (T1), and on each rest and alarm, the engine rolls the table's chance; a fight entry fires at most once, then counts as an omen. The module's single `wanderingEncounter` (#335) becomes a one-entry table rolled only on rests, so existing modules play the same. Wandering encounters count against the encounter cap, which rises from 20 to 30 (D5).

**Acceptance criteria**

- [ ] Engine tests: rolls at the authored interval, an entry fires once, omens repeat, rests and alarms roll.
- [ ] Shipped modules' gate verdicts and pinned figures unchanged.
- [ ] The gate counts wandering fights in survival and their XP in the XP limit, as today.
- [ ] Adventure, session and trace formats bumped; rules document updated.

**Blocked by:** T1.

### T8 — Rests and budgets for a long module

**What to build.** A module may declare itself `long` (D6). A long module:

- allows rests per region rather than per adventure: two short rests and one long rest in each region, the long one only at a rest site;
- gets a treasure budget and XP limit scaled as D6 decides.

The career simulation plays a long module like any other.

**Acceptance criteria**

- [ ] Engine tests for per-region rest limits.
- [ ] Validator: a long module has at least two regions; the scaled budget and its excess are named as today.
- [ ] Career simulation: the weakest career of every class still reaches level 5 with the new module in its place in the order.
- [ ] Rules document updated.

**Blocked by:** T1.

### T9 — Known rooms and what was learned

**What to build.** The browser shows a **Known rooms** panel: every room visited or seen through an exit, grouped by region, with the current room marked, each room's discoveries made, the creatures talked to and what they said, and whether its fight is won, slipped past, fled from or still waiting. Selecting a room shows its record; it doesn't move the character. The AI DM's scene gains a short summary of known rooms, discoveries and flags set (only those the character could know), within a size cap, so it can answer "where was that locked door?"

**Acceptance criteria**

- [ ] Engine projection tests; the panel survives a reload.
- [ ] A Playwright test of the panel in a module with two regions.
- [ ] The AI DM's scene stays under a stated byte cap on the new module; evaluation cases recall a clue from another room and a creature's answer.
- [ ] README and rules document updated.

**Blocked by:** T1. Benefits from T3 and T2 being in.

### T10 — Judge more than one route

**What to build.** The gate judges survival on every **route** a module declares, not only on the fewest-fights route. A route is an entrance-to-objective path given as a list of rooms that must be passed, such as "through the flooded stair" or "through the guard hall". Each must clear the declared difficulty. The cautious style also judges a **region sweep** (every room not marked `avoidable` in each region) at a lower threshold (D8). The gate:

- plays flags, alarms and items on features as a player meets them (the harness takes the action that sets a flag on its route);
- reports the `retreat` and fight-action styles;
- checks that each level's exit is reachable from anywhere in that level.

**Acceptance criteria**

- [ ] A fixture module with two routes of different danger fails when the deadlier one is below its difficulty, naming the route.
- [ ] Shipped modules: each gets its existing required path as its one route; verdicts unchanged.
- [ ] Rules document's Balance gate section updated.

**Blocked by:** T2, T3, T4, T5.

### T11 — Generated release runs

**What to build.** `release-run-5e.ts` builds a release module's route from the harness's run on a fixed seed, instead of a hand-written step list, and the turn cap scales with the module's rooms. The existing hand-written routes stay for the shipped modules.

**Acceptance criteria**

- [ ] A release run of a fixture long module passes with a generated route.
- [ ] Hand-written routes unchanged.

**Blocked by:** T10.

### T12 — Keep the gate within budget with a long module

**What to build.** Measure the gate with the new module's draft, then cut cost before the cap rises (as #347 did): candidates are judging region sweeps on fewer seeds, caching projections across a region, and a per-module CPU budget. Owner chooses a new cap only if this can't hold 180 s.

**Acceptance criteria**

- [ ] Same verdicts and pinned figures with and without the change.
- [ ] Measured before and after, back to back, and recorded in the rules document.

**Blocked by:** T13's draft content.

### T13 — Write the module (owner pause)

**What to build.** Propose the premise, map, regions, fights, flags and alarm, puzzle, set piece, talk, treasure and rests for the owner's approval before writing content. Then write it to the target in section 2, using every mechanic above, with original content: nothing from the surveyed modules beyond structure. Qualify it for all four classes.

**Acceptance criteria**

- [ ] Owner approval of the premise and map recorded on the issue.
- [ ] Gate verdicts recorded for every class; figures pinned; rules document's module entry written.
- [ ] Release-run passes with a generated route.

**Blocked by:** T2–T11 (content can be drafted after T3).

### T14 — Release the module and write the handoff

**What to build.** Increment 17 player handoff in `docs/acceptance/`, with manual test scenarios for fleeing, the alarm, the puzzle, a fight action, wandering monsters and the known-rooms panel.

**Blocked by:** T12, T13.

## 6. Owner decisions

| #   | Decision                      | Recommendation                                                                                                                                                                                                                                                                       |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | The cost of fleeing           | Each standing opponent able to act makes one attack before the character leaves, as SRD 5.2's opportunity attacks would. A Rogue's Cunning Action gains Disengage, which avoids them. Alternative: a Dexterity save against the foes' best attack bonus, failure meaning one attack. |
| D2  | Whether foes follow           | They don't, in this increment. Pursuit needs monster movement, left out above.                                                                                                                                                                                                       |
| D3  | Flags only turn on            | Yes. It keeps the validator's reachability proof simple. A door that opens and shuts again is two flags.                                                                                                                                                                             |
| D4  | Removing a foe with a feature | Allowed against ordinary foes, never a boss, and once per feature. Its XP is credited; its loot is lost.                                                                                                                                                                             |
| D5  | Encounter cap                 | Raise it from 20 to 30, wandering encounters counted.                                                                                                                                                                                                                                |
| D6  | Budget for a long module      | Twice the treasure budget (900 gp at level 3) and an XP limit allowing one more level. Alternative: a budget per region.                                                                                                                                                             |
| D7  | Level band                    | Level 3 only: casters are judged from level 3, a single level keeps gate time down, and levelling mid-adventure is left out.                                                                                                                                                         |
| D8  | How to judge optional rooms   | Declared routes at the module's difficulty; a region sweep at one difficulty lower (a Medium module's sweep must clear Hard). Rooms marked `avoidable` are left out of the sweep, but each must have a way to avoid it (sneaking, a reaction, a second route).                       |
| D9  | Losing a long run at 0 HP     | Keep instant defeat. Every level of a long module must have an exit, so a hurt character can leave with what it found; the gate checks it (T10).                                                                                                                                     |

## 7. Order

T1 and T2 can start at once. Then T3; T4, T5, T6, T7 and T8 in parallel after their blockers; T9 after T1; T10 after T2–T5; T11 and T12 with T13 in progress; T14 last.

```text
T1 ─┬─ T3 ─┬─ T4 ─┐
    │      ├─ T5 ─┼─ T10 ─ T11 ─┐
    │      └─ T6  │             ├─ T13 ─ T12 ─ T14
    ├─ T7         │             │
    ├─ T8         │             │
    └─ T9         │             │
T2 ───────────────┘             │
(T13 drafting starts after T3) ─┘
```
