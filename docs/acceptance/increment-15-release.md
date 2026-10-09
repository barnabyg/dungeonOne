# Increment 15: encounter openings and the Rogue — release and player handoff

Issue #311, 9 October 2026, branch `feat/311-stealth-release`. Increment 15
makes classes data (#300) and changes how a fight can open:

- **Sneaking.** The character can sneak into a fight room and ambush (#301),
  or slip past the fight (#302).
- **Lurking.** Lurking monsters can surprise the character (#303).
- **Reactions.** A reaction-eligible encounter rolls a reaction before it
  fights (#304). Its bands can offer a parley, a toll or trade (#305).
- **The Rogue.** A new class with levels 1–5 (#306–#308) and thieves' tools
  for locks and traps (#309).
- **Two-class gate.** Every shipped module qualifies for both classes (#310).

This ticket releases _The Counting-House on Mallow Quay_, which uses all of
these, and hands the increment to players. The
[rules document](../character-rules.md) lists every rule, abstraction and
house rule.

The evidence comes in three kinds, kept apart below:

- **automated:** tests and scripts anyone can rerun;
- **implementer:** what the implementer ran and saw;
- **owner:** the manual scenarios for the project owner, with space for
  results.

## What changed in this ticket

- **The Counting-House on Mallow Quay**
  (`adventures/5e/mallow-counting-house.json`): levels 3–4, declared Hard.
  The owner approved the premise, room map, monsters, reaction design, lock
  and trap design and treasure placement in the #311 implementation session,
  before the content was written. A goblin gang under Snikk holds a burned
  guild counting-house. The guild's strongroom is still locked, and the key
  went up to the records loft with the gang's bugbear. The module has six
  rooms, and you enter and leave by the quay steps:
  - **Quay Steps** (start and exit): a mooring bollard hides a Potion of
    Healing; a potion is not loot, so there is nothing here to carry out.
  - **Toll Arch** (required path): **Snikk the Toll-Taker** (a Goblin Boss)
    reacts to the character.
    - _Unfriendly_ or _uncertain_: attack, parley or a 5 gp toll.
    - _Indifferent_: pass, trade (dagger, shortbow, arrows) or attack.
    - _Friendly_: pass or trade.
    - _Hostile_: he fights at once.

    The parley is Persuasion (DC 13), Deception (DC 14) or Intimidation
    (DC 15):
    - failing by 5 or more starts the fight with the character surprised;
    - a failure or a success moves the band one step;
    - succeeding by 5 or more lets the character pass.

    Ending the encounter peacefully earns 125 XP; the fight earns 200.

  - **Counting Hall** (required path): the **Soot Goblin** (a Goblin Warrior)
    lurks among the ledger presses. Sneaking past it earns 25 XP, and the
    character can sneak up on it again later. The smashed till holds the
    first loot, 60 sp.
  - **Clerks' Gallery**: up a stair with a **scything blade**:
    - finding it: a search, DC 13;
    - disarming it: Dexterity DC 13 with thieves' tools, or DC 15
      bare-handed;
    - springing it: a Dexterity save, DC 13, against 2d4 slashing.

    The tally-master's desk hides a bloodstone (Investigation DC 13, no
    retry).

  - **Records Loft**: **the Clerk-Eater** (a Bugbear Warrior) lurks here,
    and the character can sneak up on it again. It carries the strongroom
    key.
  - **Strongroom**: behind an iron door that opens three ways:
    - its key;
    - a pick: Dexterity DC 15 with thieves' tools, tried once;
    - a break: Athletics DC 17. Each further try costs 1d4 bludgeoning.

    The coffer holds two garnets, a chain of office and 150 gp.
- **XP and treasure.** Leaving with loot earns 400 XP. The treasure is
  507 gp of the 600 gp budget. The carried loot was rolled with
  `npm.cmd run loot -- adventures/5e/mallow-counting-house.json --seed 311`.
  Snikk's rolled loot was removed: on him, it made the arch the first loot,
  and the gate can't yet tell that a fled carrier's loot is gone (#324).
- **The live release harness** can now play a Rogue: fights take the Light
  extra attack, and a sneak counts as done once the character is in the
  room. The engine journeys behind the content tests take the extra attack
  too.
- **A fixed test Rogue.** `src/test-rogue-5e.ts` defines Vex, a level-3 Thief
  with 20 gp, alone in a library
  (`docs/acceptance/inputs/increment-15/level-3-vex.json`).

## Automated evidence

- `npm.cmd run verify` passes with zero warnings: formatting, lint, types,
  static analysis, tests, audit, secret scan and package checks (see
  _Implementer evidence_). CI reruns it on the PR's final commit.
- **Balance gate.** _The Counting-House on Mallow Quay_ qualifies as Hard
  for both classes (200 seeds, weakest kit at level 3):

  | Class   | Cautious (judged) | Every check fails | Stealth-first | Peaceful reactions |
  | ------- | ----------------- | ----------------- | ------------- | ------------------ |
  | Fighter | 81.5%             | 81.0%             | 82.5%         | 85.5%              |
  | Rogue   | 94.0%             | 92.5%             | 92.5%         | 96.0%              |

  Hard needs 75%, and Medium's 88% is 6.5 points away for the Fighter.
  Stealth-first and peaceful reactions are reported but not judged. No
  ordinary enemy dies to one attack more than 30% of the time.

  The gate doesn't judge Sneak Attack. If it did, a level-4 Rogue that Hides
  or uses Steady Aim first would kill the Soot Goblin in one attack 86% of
  the time. Every other shipped module still qualifies for both classes.

- **Content, checks and journeys** (`tests/mallow-counting-house.test.mjs`):
  - the map, fights, reaction, treasure and gate figures;
  - Snikk's toll, parley and trade, with scripted dice;
  - the pick, the break and its paid retry;
  - the trap's find and disarm, and the desk;
  - journeys to each ending, including a Rogue who slips past, ambushes and
    unlocks;
  - the scripted release run and the live script's dry run.
- **The handoff journeys** (`tests/issue-311-browser.test.mjs`): scenarios
  1–3 below, each driven in a real browser on its seed and checked against
  the library file on disk. They assert the seeded numbers the scenarios
  quote, so a change that moves them fails the test.
- **Both classes complete every shipped module.**
  `tests/shipped-modules.test.mjs` qualifies all fourteen modules for the
  Fighter and the Rogue (#310).
- **Increment 15 behavior**, each tested browser → API → storage:

  | Behavior                                     | Test                                                       |
  | -------------------------------------------- | ---------------------------------------------------------- |
  | Sneak in and ambush                          | `issue-301-browser.test.mjs`, `issue-311-browser.test.mjs` |
  | Sneak past a fight                           | `issue-302-browser.test.mjs`, `issue-311-browser.test.mjs` |
  | Lurking monsters surprise the character      | `issue-303-browser.test.mjs`, `issue-311-browser.test.mjs` |
  | Reaction rolls                               | `issue-304-browser.test.mjs`, `issue-311-browser.test.mjs` |
  | Parley, toll and trade                       | `issue-305-browser.test.mjs`, `issue-311-browser.test.mjs` |
  | Creating a Rogue                             | `issue-306-browser.test.mjs`, `issue-311-browser.test.mjs` |
  | Hide, Steady Aim and the Thief               | `issue-307-browser.test.mjs`                               |
  | Rogue levels 4–5                             | `issue-308-browser.test.mjs`                               |
  | Thieves' tools: a picked lock, a broken door | `issue-309-browser.test.mjs`, `issue-311-browser.test.mjs` |
  | The Counting-House on Mallow Quay            | `issue-311-browser.test.mjs`                               |

  Classes as data (#300) and the two-class gate (#310) have engine tests
  only, because neither changes what the browser shows.

## Implementer evidence

**Verify.** On Windows 11 with Node.js 24.13.0, `npm.cmd run verify` passed
in the #311 worktree on the branch's final commit, ending "Verification
passed with zero warnings." It was not rerun from a clean clone; CI on the
PR runs it from a fresh checkout.

**Bounded live AI run.** The owner approved a live run in the #311 session
with a cap of 80 provider calls on `gpt-5.6-luna` (the default), the same
cap as #241 and #291. The live harness gained a route for this module
(`COUNTING_HOUSE_ROUTE`). The run starts from the handoff's level-3 Vex on
seed 8, the seed of scenario 2. Command:

```powershell
node scripts/qualify-release-live.mjs --live --adventure mallow-counting-house --max-calls 80 --seed 8 --output docs/acceptance/evidence/increment-15-live-release-run.json
```

The full report is in
[`evidence/increment-15-live-release-run.json`](evidence/increment-15-live-release-run.json).
It holds every message, the DM's tool calls, the engine's cards and the
replies, but no credentials or prompts. Result:

| Measure                        | Result                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Ending                         | _Out with the guild's gold_, 1,475 XP, level 3 (two garnets, the chain of office, 156 gp found; purse 171 gp)                              |
| Turns / typed to the AI DM     | 25 / 24 (Leave has only a button, by design)                                                                                               |
| Typed steps the DM carried out | 24 of 24. One step (the desk) was also pressed by its button: see below.                                                                   |
| New increment 15 tools         | `react` with a parley approach (Persuasion) and with the toll, `sneak` twice, `ambush`, `light_attack`, `pick_lock` — each called as typed |
| Tools the DM called            | `take` 6, `move` 6, `examine` 4, `react` 2, `sneak` 2, `ambush`, `attack`, `light_attack` and `pick_lock` 1 each                           |
| Steps skipped                  | None. Five rooms were visited; the Clerk-Eater was left alone by design.                                                                   |
| Provider calls                 | 24 of at most 80                                                                                                                           |
| Tokens                         | 114,014 input, 641 output                                                                                                                  |
| Replies claiming an outcome    | 0 flagged on uncommitted turns                                                                                                             |
| Prompt version                 | `5e-dm-v20`                                                                                                                                |

The DM examined the tally-master's desk as typed, and its Investigation
check failed. A failed check makes no discovery, and the harness counts an
examine as done only once a discovery shows. So it pressed **Examine** again
as a fallback. The check is remembered, so nothing was rerolled.

The run's dice match the scripted release run in
`tests/mallow-counting-house.test.mjs`. That test plays the same route on
seed 8 with a DM that only narrates, so every step falls back to its
button.

**Balance note.** The gate judges the cautious route: Snikk, always
fought; the hall; the till; and out. With two goblins in the hall, the
level-3 Fighter survived 49%. Levels 2–3 and a level 4–5 version with
heavier monsters ran 1–70%, so Hard at levels 3–4 is what the owner
approved. Clearing the whole house is deadlier: the Clerk-Eater beats most
level-3 Fighters who fight it head-on.

## Owner scenarios

Prerequisites: Node.js 24.x, npm 11.6.4, a desktop browser, and from the
project directory:

```powershell
npm.cmd ci
npm.cmd run build
```

Each scenario has its own library under `.scratch\release-311\`, copied
from `docs\acceptance\inputs\` where it needs one. To retry, move that
scenario's folder aside and start again from its first step.

The dice are seeded, so the results below hold only if you take **exactly**
the listed actions, in order. These roll nothing: moving between rooms
(except into a fight), examining a feature without a check, taking,
reloading and restarting.

**In every fight, take your turn by this rule**, one button at a time, until
"The fight is over.":

1. Press the first enabled **Attack** button. For Vex this includes the
   extra attack with the dagger after the shortsword.
2. Otherwise press **End turn**.

Never heal, Hide, use Steady Aim or use Action Surge in a fight: the numbers
assume you don't.

Launch without a key so the typing box is off. If a key is set in your shell,
clear it first:

```powershell
$env:OPENAI_API_KEY = ""
```

To restart mid-way: wait until the last reply is complete and the buttons are
enabled, press Ctrl+C in PowerShell, then rerun the exact same command.

### 1. Create a Rogue

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-311\create
npm.cmd run browser -- --seed 0 --characters .\.scratch\release-311\create\characters.json
```

1. **Create a character.** The Fighter is selected first. Choose **Rogue**.
   Expect four skills chosen, with Expertise in Perception and Stealth, and
   no Fighting Style. The kits are the shortsword and leather kit and the
   shortsword, dagger and leather kit, each with thieves' tools; the default
   is "Leather armour, Shortsword, Dagger, Thieves' tools (47 gp)".
2. Name it Vex and **Save**. The sheet shows:
   - "Level 1 Rogue", HP 11/11, AC 15;
   - Str 8, Dex 18, Con 16, Int 11, Wis 13, Cha 12;
   - Stealth +8 (Expertise), Perception +5 (Expertise);
   - "Tools: Thieves' tools." and the Sneak Attack feature.
3. Restart (Ctrl+C, same command). Vex is still in the list.

### 2. A parley, a toll, sneaking past and ambushing, and a picked lock

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-311\rogue
Copy-Item .\docs\acceptance\inputs\increment-15\level-3-vex.json .\.scratch\release-311\rogue\characters.json
npm.cmd run browser -- --seed 8 --characters .\.scratch\release-311\rogue\characters.json
```

Vex is a level-3 Rogue (Thief) with 900 XP and 20 gp.

1. Open Vex's sheet. Expect _The Counting-House on Mallow Quay_ tagged
   Levels 3–4 and Hard. **Start** it.
2. **Examine** Mooring Bollard: "Goblin toll at the arch. Mind the gallery
   stair." **Take** Potion of Healing.
3. **Go** Toll Arch. Expect "Reaction roll: 2d6 (3 + 1) − 1 Charisma = 3:
   unfriendly." and buttons for Attack, three parleys (Persuasion DC 13,
   Deception DC 14, Intimidation DC 15) and the 5 gp toll.
4. Press the **Persuasion** parley. Expect "Persuasion check: d20 16 − 1 +
   2 proficiency = 17 against DC 13. Success." and "Snikk the Toll-Taker is
   now uncertain (was unfriendly)." The parley buttons are gone: one parley
   per encounter.
5. Press **Pay the toll**. Expect "You pay the toll of 5 gp." and "the
   encounter ends peacefully. Purse: 15 gp."
6. **Sneak** into the Counting Hall. Expect:
   - "Stealth check: d20 17 + 4 + 4 proficiency (Expertise) = 25 against DC 9. Success.";
   - the goblin's own Stealth "d20 3 + 6 = 9 against your passive
     Perception 15 … you spot it".

   The bar offers **Ambush** and the ways out.

7. **Go** Clerks' Gallery to slip past. Expect:
   - "You slip out of the Counting Hall unseen, past Soot Goblin.";
   - then the scything blade: "Dexterity saving throw: d20 15 + 4 + 2
     proficiency = 21 against DC 13. Success." and "halved to 2; you have
     19/21 HP".
8. **Examine** Tally-Master's Desk. Expect "Investigation check: d20 4 − 1
   = 3 against DC 13. Failure." and empty drawers. Leave the loft's ladder
   alone: the Clerk-Eater waits up there.
9. **Sneak** into the Counting Hall again. Expect "d20 19 + 4 + 4
   proficiency (Expertise) = 27 against DC 9. Success." Press **Ambush**.
   Expect "Soot Goblin is surprised and rolls initiative with
   disadvantage." and "Initiative: Vex 20 + 4 = 24".
10. Fight by the rule. The shortsword hits for 8, and the goblin is vexed.
    The dagger's extra attack is at advantage and adds Sneak Attack, and
    the goblin is defeated.
11. **Examine** Smashed Till and **Take** Till Silver (6 gp).
12. **Pick** the Strongroom Door. Expect "Dexterity check with thieves'
    tools: d20 13 + 4 + 2 proficiency = 19 against DC 15. Success." and
    "You pick the Strongroom Door's lock."
13. **Go** Strongroom, **Examine** Iron Coffer, and **Take** the Garnet,
    Second Garnet, Chain of Office and Bag of Guild Gold.
14. **Go** Counting Hall, **Go** Toll Arch, **Go** Quay Steps, **Leave the
    adventure** and **Leave now**.
15. Expect **Out with the guild's gold**, _Escaped with loot_:
    - +50 XP for the goblin;
    - +125 XP for parting peacefully with Snikk;
    - +400 XP for the ending.

    The sheet shows 1,475 XP, level 3, 171 gp and the three treasures.

### 3. A lurking goblin and a forced lock

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-311\fighter
Copy-Item .\docs\acceptance\inputs\increment-13\level-3-ada.json .\.scratch\release-311\fighter\characters.json
npm.cmd run browser -- --seed 6 --characters .\.scratch\release-311\fighter\characters.json
```

Ada is a level-3 Fighter with no thieves' tools and no gold.

1. **Start** _The Counting-House on Mallow Quay_. **Examine** Mooring
   Bollard and **Take** Potion of Healing.
2. **Go** Toll Arch. Expect "Reaction roll: 2d6 (6 + 4) − 1 Charisma = 9:
   indifferent." Snikk offers passage, trade or a fight. The toll button
   isn't there: an indifferent Snikk asks none.
3. Press **Attack** to fight him anyway. Expect "Initiative: Snikk the
   Toll-Taker 20 + 2 = 22; Ada 17 + 2 = 19." Fight by the rule. Ada wins at
   11/28.
4. **Go** Counting Hall. Expect:
   - "Soot Goblin's Stealth check: d20 9 + 6 = 15 against your passive
     Perception 12 … you are surprised and roll initiative with
     disadvantage.";
   - "Initiative: Soot Goblin 14 + 2 = 16; Ada (surprised, d20s 7 and 1,
     kept) 1 + 2 = 3."

   Fight by the rule. Ada wins at 8/28.

5. **Examine** Smashed Till and **Take** Till Silver. The Strongroom Door
   offers **Break** but no Pick: Ada carries no thieves' tools.
6. Press **Break**. Expect "Athletics check, at advantage (Remarkable
   Athlete): d20 2 and 6, keeping 6; 6 + 3 + 2 proficiency = 11 against DC 17. Failure." and "The Strongroom Door holds."
7. Press the Break button marked as another try. Expect "Another try at the
   Strongroom Door (costs 1d4 bludgeoning damage).", "you have 4/28 HP", "d20
   19 and 8, keeping 19; 19 + 3 + 2 proficiency = 24 against DC 17.
   Success." and "You break the Strongroom Door open."
8. **Go** Strongroom, **Examine** Iron Coffer, and **Take** all four items.
   **Go** Counting Hall, **Go** Toll Arch, **Go** Quay Steps, **Leave the
   adventure** and **Leave now**.
9. Expect **Out with the guild's gold**:
   - +200 XP for Snikk;
   - +50 XP for the goblin;
   - +400 XP for the ending.

   Ada keeps the three treasures.

### 4. The AI DM, a reaction and sneaking (needs `OPENAI_API_KEY`)

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-311\ai
Copy-Item .\docs\acceptance\inputs\increment-15\level-3-vex.json .\.scratch\release-311\ai\characters.json
$env:OPENAI_API_KEY = "<your key>"
npm.cmd run browser -- --seed 8 --characters .\.scratch\release-311\ai\characters.json
```

Start _The Counting-House on Mallow Quay_ with Vex. Type one at a time, and
wait for each reply:

- "Climb up to the arch." Expect the engine's reaction roll (unfriendly, as
  in scenario 2) and the DM narrating Snikk's demand. The DM must not choose
  for you.
- "Can you knock the toll down to two gold?" No tool lowers a toll, so
  expect the DM to say it isn't offered, without rolling anything.
- "I tell him the guild sent me to collect his ledger." This is a lie, so
  expect a **Deception** parley card (DC 14) and the engine's band. Asking
  to parley again is refused rather than rerolled.
- If Snikk still blocks the way, "Pay him." Expect the toll card. Then
  "Sneak into the counting hall." Expect a Stealth card, and the DM never
  declares surprise itself.

### Owner results

Record each scenario's outcome, and any wording or behavior that surprised
you, separately from the evidence above.

| Scenario                                    | Date | Result | Notes |
| ------------------------------------------- | ---- | ------ | ----- |
| 1. Create a Rogue                           |      |        |       |
| 2. Parley, toll, sneak, ambush, picked lock |      |        |       |
| 3. Lurking goblin and a forced lock         |      |        |       |
| 4. The AI DM, a reaction and sneaking       |      |        |       |

## Limits

- The live run is a single sample on one seed. AI interpretation varies
  between runs; `npm.cmd run eval:dm` measures it across cases.
- Unfamiliar-player testing has not been done.
- The scenarios start from prepared libraries rather than one character
  played from level 1. The career simulation (`npm.cmd run career`) plays
  that path in the engine.
- Slipping past the hall's goblin to the gallery springs the scything blade
  unless it was found earlier. An unseen character can't search, and the
  strongroom's door can't be opened unseen. The chalk on the bollard warns
  of the stair.
- Some XP lines read "the Snikk the Toll-Taker" ("Parted peacefully with
  the Snikk the Toll-Taker"). #323 tracks the fix.
- Loot carried by an opponent that flees leaves the gate's cautious run
  stranded. The module avoids this by putting the first loot in the till;
  #324 tracks the gate fix.
- The release seeds are fragile. A change to the Goblin Boss, Goblin
  Warrior or Bugbear Warrior, to the Rogue's or Fighter's fights, or to the
  dice order will move them. The handoff tests fail when they do.
- Formats are throwaway until the owner declares a stable release (ADR
  0005): library 15, session 34, trace 28, adventure module 27, bestiary 9.
  The input libraries are in library format 15. When that changes,
  regenerate them from `rogueLibrary` in `src/test-rogue-5e.ts` and
  `libraryAt` in `src/test-fighter-5e.ts`; their tests say so.
