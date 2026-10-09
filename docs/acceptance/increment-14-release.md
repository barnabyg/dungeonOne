# Increment 14: graded checks and levels 4–5 release and player handoff

Issue #291, 8 October 2026, branch `feat/level-4-5-module`. Increment 14 puts
every check on one path (#280) and grades it into bands with effects (#281):
checks can open or close routes (#282), offer alternative approaches (#283),
and allow authored retries with advantage from circumstances (#284). The
balance gate also plays every check failing and every check succeeding
(#285). The Fighter reaches level 4, with its owed Ability Score Improvement
and fourth mastery (#286), and level 5, with Extra Attack (#287). The bestiary
gains monsters for levels 4–5 (#288). The increment releases _The Wolfstone
Hillfort_ for levels 3–4 (#289) and simulates a career through the shipped
modules (#290). This ticket releases _The Thornwood Lodge_ for levels 4–5,
applies the light crossbow's Loading, and hands the increment to players. The
[rules document](../character-rules.md) lists every rule and abstraction.

The evidence comes in three kinds, kept apart below: **automated** (tests and
scripts anyone can rerun), **implementer** (what the implementer ran and saw),
and **owner** (the manual scenarios for the project owner, with space for
results).

## What changed in this ticket

- **The Thornwood Lodge** (`adventures/5e/thornwood-lodge.json`), levels 4–5,
  declared Hard. The owner approved the premise, room map, monsters, check
  design and treasure placement in the #291 implementation session, before
  the content was written. Captain Hesk deserted from the war and took the
  old king's hunting lodge. It has six rooms, and you enter and leave by the
  forest gate:
  - **Forest Gate** (start and exit): a woodpile hides a Potion of Healing
    and a Hooded Lantern (a tool), and there is no loot. Brann the
    Charcoal-burner trades shield, chain mail, longsword and greatsword. "The
    poachers' path" takes Persuasion (DC 14) or Intimidation (DC 16), and a
    success opens a hidden way to the hide.
  - **Poachers' Hide** (hidden): a Potion of Healing and Trapper's Tongs (a
    tool). It holds no loot, so the gate's harness, which never talks, misses
    nothing it could carry out (#297).
  - **Kennel Yard** (the required path): Hesk's Hound (a Dire Wolf) and two
    Kennel Mastiffs fight together. The kennel holds the first loot: a gilt
    hunting cup and 30 gp.
  - **Lodge Hall**: the Baiting Bear (a Brown Bear) and two checks:
    - **Trophy Wall:** Perception (DC 15) or History (DC 13). A failure by 5
      or more deals 1d6 piercing, a success reveals a topaz, and a success
      by 5 or more also reveals a potion. Once you hold the Hooded Lantern,
      you may search it again.
    - **Ice-house Hatch:** Athletics (DC 15) or Perception (DC 14). Another
      try costs 1d4 bludgeoning, and a success opens the way to the ice
      house.
  - **Ice House** (hidden): an Owlbear guards a Potion of Healing and a jade.
  - **Captain's Solar**: up a gallery stair with a man-trap. Find it with
    Perception (DC 14) and disarm it with Dexterity (DC 14), at advantage
    with the tongs; it deals 2d6 piercing (Dexterity save DC 13). Captain
    Hesk (a Warrior Veteran, the boss) guards a gold-chased hunting horn and
    30 gp.
- **XP for level 5 (owner decision).** Careers that survive the earlier
  modules end them with about 4,100 XP, and the cautious route through the
  Lodge earns only the kennel yard's 250. The owner first approved a 2,200 XP
  ending. A fled monster gives half its XP, so then only 66 of the 104
  careers that survived reached level 5. The owner raised the ending to
  2,350 XP so every surviving career does.
- **The Mastiff** (SRD 5.2, CR 1/8) joins the bestiary. As with the Wolf, its
  knockdown has a house DC 11 Strength save.
- **Treasure.** 743 gp of the 750 gp budget. Captain Hesk's 8 gp was rolled
  with `npm.cmd run loot -- adventures/5e/thornwood-lodge.json --seed 291`.
- **Loading** (deferred from #287 by owner decision): a shot with a light
  crossbow ends the action's attacks. Extra Attack gives it no second shot,
  and Action Surge gives one more. No shipped module sells or places a
  crossbow.
- **Career check:** `npm.cmd run career` and verify now require level 5.

## Automated evidence

- `npm.cmd run verify` passes with zero warnings: formatting, lint, types,
  static analysis, tests, audit, secret scan and package checks (see
  _Implementer evidence_). CI reruns it on the PR's final commit.
- **Balance gate.** _The Thornwood Lodge_ qualifies as Hard.
  - The weakest character playing cautiously survives 87.0% of 200 runs with
    its weakest kit at level 4. It scores the same when every check fails.
    Hard needs 75%, and Medium's 88% is 1 point away.
  - Two of five ordinary enemies, the Mastiffs, die to one attack more than
    30% of the time; no more than half may.
  - Its 4,200 XP keeps a character within the level-6 limit.
  - Every other shipped module still qualifies. `npm.cmd run balance` prints
    the full report.
- **Career.** With the Lodge, 104 of 200 careers (52%) reach level 5. That
  is every career that survives the Lodge: 15 of the 119 that play it fall
  there. Most other falls are in the level-1 modules, as #290 found.
- **Content and journeys** (`tests/thornwood-lodge.test.mjs`): the map,
  fights, merchant, treasure and gate figures. Every check band and retry is
  played with scripted dice, and there are journeys to each ending.
- **The handoff journeys** (`tests/issue-291-browser.test.mjs`): scenarios
  1–3 below, each driven in a real browser on its seed and checked against
  the library file on disk. They assert the seeded numbers the scenarios
  quote, so a change that moves them fails the test.
- **Increment 14 behavior**, each tested browser → API → storage:

  | Behavior                                                | Test                                                       |
  | ------------------------------------------------------- | ---------------------------------------------------------- |
  | Doors, traps and topics on one check path               | `issue-280-browser.test.mjs`                               |
  | Graded bands and their effects on the card              | `issue-281-browser.test.mjs`                               |
  | A band opens or closes a way                            | `issue-282-browser.test.mjs`                               |
  | One button per approach                                 | `issue-283-browser.test.mjs`, `issue-291-browser.test.mjs` |
  | Retries and advantage from tools                        | `issue-284-browser.test.mjs`, `issue-291-browser.test.mjs` |
  | Level 4: the owed Ability Score Improvement and mastery | `issue-286-browser.test.mjs`, `issue-291-browser.test.mjs` |
  | Level 5: Extra Attack                                   | `issue-287-browser.test.mjs`, `issue-291-browser.test.mjs` |
  | The Wolfstone Hillfort                                  | `issue-289-browser.test.mjs`                               |
  | The Thornwood Lodge                                     | `issue-291-browser.test.mjs`                               |

  The gate's check policies (#285), the bestiary (#288), the career (#290)
  and Loading (`issue-291.test.mjs`) have engine tests only: none changes
  what the browser shows.

## Implementer evidence

**Verify.** On Windows 11 with Node.js 24.13.0, `npm.cmd run verify` passed
in the #291 worktree on the branch's final commit, ending "Verification
passed with zero warnings." It was not rerun from a clean clone; CI on the PR
runs it from a fresh checkout.

**Bounded live AI run.** The owner approved a live run in the #291 session;
the implementer set the budget at 80 provider calls on `gpt-5.6-luna` (the
default), as #241's run had. The live harness gained a Lodge route for it
(`LODGE_ROUTE`): a step can name a check's approach or ask for a retry. It
starts from the handoff's level-4 Ada with 4,100 XP, on seed 2, the seed of
scenario 2. Command:

```powershell
node scripts/qualify-release-live.mjs --live --adventure thornwood-lodge --max-calls 80 --seed 2 --output docs/acceptance/evidence/increment-14-live-release-run.json
```

The full report is in
[`evidence/increment-14-live-release-run.json`](evidence/increment-14-live-release-run.json).
It holds every message, the DM's tool calls, the engine's cards and the
replies, but no credentials or prompts. Result:

| Measure                        | Result                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ending                         | _Out with the spoils_, 6,900 XP, level 5 (Gilt Hunting Cup, Topaz, 30 gp)                                                                            |
| Turns / typed to the AI DM     | 40 / 38 (Leave is button-only by design)                                                                                                             |
| Typed steps the DM carried out | 38 of 38; none needed its button                                                                                                                     |
| Checks with approaches         | The DM passed the approach each time: `talk` Persuasion, `examine` History (trophy wall) and Perception (hatch)                                      |
| Tools the DM called            | `attack` 9, `take` 8, `move` 6, `examine` 5, `second_wind` 3, `talk` 2, `end_turn` 2, `action_surge`, `search` and `disarm` 1 each                   |
| Steps skipped                  | 1: the hatch's retry, not offered because the hatch opened at the first try; 4 rooms visited (the Owlbear and Captain Hesk are left alone by design) |
| Provider calls                 | 38 of at most 80                                                                                                                                     |
| Tokens                         | 125,551 input, 1,151 output                                                                                                                          |
| Replies claiming an outcome    | 0 flagged on uncommitted turns                                                                                                                       |
| Prompt version                 | `5e-dm-v17`                                                                                                                                          |

The run's dice match the scripted release run in
`tests/thornwood-lodge.test.mjs`, which plays the same route on seed 2 with a
DM that only narrates, so every step falls back to its button.

**Balance note.** The gate judges the cautious route: the kennel yard, its
loot and out. A heavier required path failed: the yard's fight with the bear
added survived 67%. Clearing the whole lodge is far deadlier. The gate's
attack-everything run survives 0–13% at level 5, mostly because the Owlbear
meets a character already hurt. This matches the _Hard_ rating and the
Hillfort, where the Reaver plays the same part.

## Owner scenarios

Prerequisites: Node.js 24.x, npm 11.6.4, a desktop browser, and from the
project directory:

```powershell
npm.cmd ci
npm.cmd run build
```

Each scenario has its own library under `.scratch\release-291\`, copied from
`docs\acceptance\inputs\`. To retry, move that scenario's folder aside and
start again from its first step.

The dice are seeded, so the results below hold only if you take **exactly**
the listed actions, in order. These roll nothing: moving between rooms
(except into a fight), examining a feature without a check, taking,
talking about a topic without a check, reloading and restarting.

**In every fight, take your turn by this rule**, one button at a time, until
"The fight is over.":

1. Press the first enabled **Attack** button (at level 5 this includes
   "Second attack on …").
2. Otherwise press **End turn**.

Never heal or use Action Surge in a fight: the numbers assume you don't.

Launch without a key so the typing box is off. If a key is set in your shell,
clear it first:

```powershell
$env:OPENAI_API_KEY = ""
```

To restart mid-way: wait until the last reply is complete and the buttons are
enabled, press Ctrl+C in PowerShell, then rerun the exact same command.

### 1. Level 4 and the owed choices

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-291\level-4
Copy-Item .\docs\acceptance\inputs\issue-286\level-3-ada-2690-xp.json .\.scratch\release-291\level-4\characters.json
npm.cmd run browser -- --seed 0 --characters .\.scratch\release-291\level-4\characters.json
```

1. Open Ada's sheet. Expect "Level 3 Fighter · 2690 XP (level 4 at 2700)".
2. **Start** _The Drowned Chapel_. **Go** Flooded Nave. Expect "Initiative:
   Ada 12 + 2 = 14; Drowned Sexton 11 − 2 = 9." Fight by the rule; Ada wins
   unhurt.
3. **Examine** Sunken Altar, **Take** Silver Reliquary and Moss Agate, **Go**
   Chapel Porch, **Leave the adventure** and **Leave now**.
4. Expect the ending's card "Level up: Ada is now level 4": hit points
   28 → 36, Second Wind uses 2 → 3, and "Choose an Ability Score Improvement
   and a fourth weapon mastery on Ada's sheet before the next adventure."
5. **Back to Ada's sheet.** It leads with the level-up card. The adventure
   list is replaced by a notice that the choice comes first. Restart the
   browser (Ctrl+C, same command): the choice is still owed.
6. Choose +2 Strength and the Longsword mastery, check the listed changes
   (Strength, attack bonus, four masteries), and confirm. The sheet shows the
   Ability Score Improvement and four masteries, and the adventures return.

### 2. The Thornwood Lodge: a check with two approaches, and level 5

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-291\lodge
Copy-Item .\docs\acceptance\inputs\increment-14\level-4-ada-4100-xp.json .\.scratch\release-291\lodge\characters.json
npm.cmd run browser -- --seed 2 --characters .\.scratch\release-291\lodge\characters.json
```

Ada is level 4, with her level-4 choices made and 4,100 XP, about what a
career has after the earlier modules.

1. Open Ada's sheet: "Level 4 Fighter · 4100 XP", HP 36/36. Expect _The
   Thornwood Lodge_ last in the adventure list, tagged Levels 4–5 and Hard.
   **Start** it.
2. **Examine** Woodpile, **Take** Potion of Healing and Hooded Lantern.
3. Brann's topic "the poachers' path" offers two **Talk** buttons, one for
   Persuasion and one for Intimidation. Press **Talk** with Persuasion.
   Expect "Persuasion check: d20 19 − 1 = 18 against DC 14. Success." with
   his reply and "The way to the Poachers' Hide is open." The Intimidation
   button is gone: a check is made once.
4. **Go** Poachers' Hide, **Examine** Poachers' Cache, **Take** Potion of
   Healing and Trapper's Tongs, **Go** Forest Gate.
5. **Go** Kennel Yard. Expect "Initiative: Ada 15 + 2 = 17; Kennel Mastiff 1
   8 + 2 = 10; Kennel Mastiff 2 6 + 2 = 8; Hesk's Hound 3 + 2 = 5." Fight by
   the rule:
   - Both mastiffs stand their ground at their morale checks.
   - A mastiff bites for 7 and the hound for 13; Ada resists being knocked
     prone both times.
   - A critical hit saps the hound, and Ada wins at 16/36.
6. **Examine** Hound's Kennel, **Take** Gilt Hunting Cup and Purse of Gold,
   **Go** Forest Gate, **Leave the adventure** and **Leave now**.
7. Expect **Out with the spoils**, _Escaped with loot_:
   - Defeated Hesk's Hound, Kennel Mastiff 1 and Kennel Mastiff 2: +250 XP.
   - Out with the spoils: +2350 XP.
   - Purse: 30 gp.
   - The card "Level up: Ada is now level 5", naming Extra Attack. Level 5
     asks for no choice.
8. **Back to Ada's sheet**: level 5, 6,700 XP, proficiency +3 and the Extra
   Attack feature.

### 3. Failing a check, a retry, and a found trap

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-291\checks
Copy-Item .\docs\acceptance\inputs\issue-287\level-5-ada.json .\.scratch\release-291\checks\characters.json
npm.cmd run browser -- --seed 1 --characters .\.scratch\release-291\checks\characters.json
```

1. **Start** _The Thornwood Lodge_. **Examine** Woodpile and **Take** only
   the Potion of Healing; leave the lantern there.
2. **Go** Kennel Yard and fight by the rule. Ada makes two attacks each turn
   and wins at 40/44. **Go** Lodge Hall. Expect "Initiative: Baiting Bear
   20 + 1 = 21; Ada 9 + 2 = 11." Fight; Ada wins at 23/44.
3. The Trophy Wall offers **Examine** with Perception and with History.
   Press it with Perception. Expect "Perception check: d20 11 + 0 + 3
   proficiency = 14 against DC 15. Failure." and "Dust and cobwebs…". No
   other try is offered.
4. **Go** Kennel Yard, **Go** Forest Gate, **Take** Hooded Lantern, **Go**
   Kennel Yard, **Go** Lodge Hall. The Trophy Wall now offers another try,
   marked with the Hooded Lantern. Press it. Expect "Another try at the
   Trophy Wall (Hooded Lantern)." and "d20 17 + 0 + 3 proficiency = 20
   against DC 15. Success by 5 or more.", which reveals the Topaz and a
   Potion of Healing.
5. Press **Examine** Ice-house Hatch with Athletics. Expect "at advantage
   (Remarkable Athlete): d20 9 and 16, keeping 16; 16 + 4 + 3 proficiency =
   23 against DC 15. Success." and "The way to the Ice House is open." The
   Ice House is now an exit. Don't go in: an Owlbear waits there.
6. Press **Search**. Expect "d20 18 + 0 + 3 proficiency = 21 against DC 14.
   Success." and the Man-trap on the way to the Captain's Solar. **Disarm**
   it (you don't hold the tongs, so one d20): "d20 19 + 2 = 21 against DC 14.
   Success. You disarm the Man-trap."
7. **Take** Topaz and Potion of Healing, **Go** Kennel Yard, **Go** Forest
   Gate, **Leave the adventure** and **Leave now**. Expect +250 XP for the
   kennel yard, "Defeated Baiting Bear: +200 XP" and "Out with the
   spoils: +2350 XP". The sheet keeps the Topaz. Ada stays level 5, the
   highest.

### 4. The AI DM and approaches (needs `OPENAI_API_KEY`)

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-291\ai
Copy-Item .\docs\acceptance\inputs\issue-287\level-5-ada.json .\.scratch\release-291\ai\characters.json
$env:OPENAI_API_KEY = "<your key>"
npm.cmd run browser -- --seed 1 --characters .\.scratch\release-291\ai\characters.json
```

Start _The Thornwood Lodge_ with Ada. Type one at a time, waiting for each
reply:

- "Ask Brann about the poachers' path." The topic has two approaches, so
  expect the DM to ask which (persuade or intimidate) and roll nothing.
- "Persuade him." Expect a Persuasion check card and the engine's band. A
  failure gives his failure words, and asking again is refused rather than
  rerolled.
- "Ask him what he'd charge for a crossbow." Brann stocks none, so expect the
  DM to list only his stock (shield, chain mail, longsword, greatsword).

### Owner results

Record each scenario's outcome, and any wording or behavior that surprised
you, separately from the evidence above.

| Scenario                             | Date | Result | Notes |
| ------------------------------------ | ---- | ------ | ----- |
| 1. Level 4 and the owed choices      |      |        |       |
| 2. The Lodge: approaches and level 5 |      |        |       |
| 3. Failing a check, a retry, a trap  |      |        |       |
| 4. The AI DM and approaches          |      |        |       |

## Limits

- The live run is a single sample on one seed. AI interpretation varies
  between runs; `npm.cmd run eval:dm` measures it across cases.
- Unfamiliar-player testing has not been done.
- The scenarios start from prepared libraries rather than one character
  played from level 1. The career simulation (`npm.cmd run career`) plays
  that path in the engine.
- The Trophy Wall's retry needs the lantern picked up after a failed try. A
  character who took the lantern at the gate first gets no other try, because
  a circumstance retry is offered only when the circumstance changes (#284).
- The release seeds are fragile. A change to the Dire Wolf, Mastiff, Brown
  Bear or Zombie, or to the dice order, will move them.
- No shipped module sells or places a crossbow, so Loading is covered only by
  engine tests.
- The Hobgoblin Warrior and Ogre are in the bestiary but in no shipped
  module.
- Formats are throwaway until the owner declares a stable release (ADR 0005):
  library 12, session 26, trace 20, adventure module 20, bestiary 7. The
  input libraries are in library format 12. When that changes, regenerate
  them from `libraryAt` in `src/test-fighter-5e.ts`; their tests say so.
