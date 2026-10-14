# Increment 17: a longer dungeon — release and player handoff

Issue #414, 14 October 2026, branch `feat/414-release-handoff`. The owner
dropped the Companions increment on 12 October 2026: the game stays
single-player, and this increment replaces it. It gives one character a
deeper dungeon, closer to the published modules the
[survey](../published-module-survey.md) read. Increment 17 adds:

- **Regions and long modules.** Rooms are grouped into regions, and moves
  are counted in each (#395). A long module counts rests per region and gets
  a larger treasure and XP budget (#404).
- **Fleeing.** A character can flee a fight through an open exit. Each
  standing foe gets one attack first, unless a Rogue has taken Disengage.
  The fight waits in its room (#396).
- **Flags.** Facts that only ever turn on. They open and close passages
  (#397), move encounters or make them appear or vanish (#398), and change
  features and topics (#399).
- **Using an item on a feature.** A carried item can be used on a feature,
  such as a key in a carving or a crank in a gear (#400).
- **Alarms.** Noise sets an alarm flag, and the dungeon answers it (#401).
- **Using the room in a fight.** A feature can be used against a foe, such
  as a statue toppled or a counterweight dropped (#402).
- **Wandering encounter tables.** Each region has a table of omens and
  wandering fights, rolled as the character moves, rests or raises the
  alarm (#403).
- **The Known rooms panel.** It shows the rooms the character has been in
  and those it has seen, by region, with what it learned in each (#405).
  The AI DM's scene remembers them too (#406).
- **A gate for long modules.** The gate judges each declared route (#407)
  and sweeps each region's optional rooms (#408). A release run can follow a
  route the harness generates (#409). The gate stays within its time budget
  (#410).
- **The release module.** _The Coldwater Weirgate_ was designed with the
  owner (#411), written (#412), and given AI DM evaluation cases (#413).

This ticket hands the increment to players. The
[rules document](../character-rules.md) lists every rule, abstraction and
house rule.

The evidence comes in three kinds, kept apart below:

- **automated:** tests and scripts anyone can rerun;
- **implementer:** what the implementer ran and saw;
- **owner:** the manual scenarios for the project owner, with space for
  results.

## The release module

_The Coldwater Weirgate_ (`adventures/5e/coldwater-weirgate.json`) is a
long module for level 3, declared Medium. It shipped in #412 and the AI DM
cases in #413; this ticket changes neither.

- **Twenty rooms in two regions:** the Keep above and the Culverts below.
  Each region has a rest site, an exit and a wandering table.
- **Two ways down to Grisk**, a Goblin Boss in the gear hall:
  - the keeper's stair, behind a locked grate and a bell-wire deadfall;
  - the drained culvert, opened by using the keeper's crank on the drain
    gear (the puzzle).
- **Off the routes:**
  - kobolds who will bargain;
  - Old Sullage, an ogre who can be lured away with salt pork or flushed
    out with the lock paddles;
  - a silted tunnel that loops to a drowned vault.
- **The alarm.** The weir bell rouses the Keep. It moves the sleeping
  bandits into the Keeper's Loft and stops Tikka talking.

## Automated evidence

- `npm.cmd run verify` passes with zero warnings: formatting, lint, types,
  static analysis, tests, audit, secret scan and package checks (see
  _Implementer evidence_). CI reruns it on the PR's final commit.
- **Balance gate.** _The Coldwater Weirgate_ qualifies as Medium for all
  four classes. Each figure is the weakest character's survival over 200
  seeds; the always-fail figure is in brackets.

  | Class   | Keeper's stair (fewest fights) | Drained culvert | Keep sweep | Culverts sweep |
  | ------- | ------------------------------ | --------------- | ---------- | -------------- |
  | Fighter | 94.5% (96.5%)                  | 95.0%           | 96.0%      | 94.5%          |
  | Rogue   | 99.0% (98.5%)                  | 99.0%           | 95.5%      | 99.0%          |
  | Cleric  | 93.5% (91.0%)                  | 96.5%           | 88.0%      | 93.5%          |
  | Wizard  | 94.0% (90.5%)                  | 98.5%           | 91.0%      | 94.0%          |
  - **Thresholds.** Each route must clear Medium's 85%, and each region's
    sweep Hard's 75% (D8). The Wizard's 90.5% when every check fails is
    5.5 points over Medium.
  - **Too easy.** The three kobolds are over the one-hit-kill cap: 3 of the
    module's 15 ordinary foes, under the half that fails a module.
  - **Budget.** The fights offer 1,275 XP, wandering ones included, and the
    ending 500. The treasure is 867 gp of the 900 gp long-module budget
    (D6), counting five potions. The Wand of Magic Missiles is outside the
    budget.

  `tests/shipped-modules.test.mjs` pins these figures, and the Weirgate is
  the gate-time canary.

- **Content, routes and journeys** (`tests/coldwater-weirgate.test.mjs`):
  - the map and its regions, the fights, both ways down, and the treasure;
  - a Fighter's journey down the stair;
  - the crank draining the culvert;
  - the salt pork luring the ogre;
  - a failed grate break moving the sleepers;
  - the kobold truce;
  - the generated release run on seed 2.
- **The AI DM** (`tests/issue-413.test.mjs`): the thirteen `--suite
weirgate` cases are well formed and play on their seeds. Live, the suite
  passed 39 of 39 at prompt v42 (#413). Prompt v43 (#425) changed movement
  only; the Weirgate suite was not rerun live after it.
- **The handoff journeys** (`tests/issue-414-browser.test.mjs`): scenarios
  1 and 2 below. Each runs in a real browser on its seed and is checked
  against the library file on disk and against an engine journey with the
  same clicks. The tests assert the lines, the Known rooms panel and the HP
  at the end of each fight that the scenarios quote, so a change that moves
  them fails.
- **Increment 17 behavior**, each tested browser → API → storage:

  | Behavior                   | Test                                                       |
  | -------------------------- | ---------------------------------------------------------- |
  | Regions and moves          | `issue-395-browser.test.mjs`                               |
  | Fleeing, Disengage         | `issue-396-browser.test.mjs`, `issue-414-browser.test.mjs` |
  | Flags opening passages     | `issue-397-browser.test.mjs`                               |
  | Using an item on a feature | `issue-400-browser.test.mjs`, `issue-414-browser.test.mjs` |
  | Alarms                     | `issue-401-browser.test.mjs`, `issue-414-browser.test.mjs` |
  | Using the room in a fight  | `issue-402-browser.test.mjs`, `issue-414-browser.test.mjs` |
  | Wandering encounter tables | `issue-403-browser.test.mjs`, `issue-414-browser.test.mjs` |
  | Known rooms panel          | `issue-405-browser.test.mjs`, `issue-414-browser.test.mjs` |

  Flags that move encounters or change features (#398, #399), long modules
  (#404), the AI DM's memory (#406) and the gate tickets (#407–#410) have
  engine and evaluation tests. They change nothing the browser shows
  beyond the rows above.

## Implementer evidence

**Seeds.** The implementer searched seeds 0–599 for each scenario's route,
with the fight rule below, in the engine. Scenario 1 needs the grate's break
to fail by 5 or more and Ada to win both fights; seeds 4, 46, 95, 129, 167
and 168 do, and 129 leaves her the most HP. Scenario 2 needs the Lockjaw
patrol to wander in and Vex to win; 26 seeds do, and 152 leaves her
unhurt.

**Verify.** On Windows 11 with Node.js 24.13.0, `npm.cmd run verify` passed
in the #414 worktree on the branch's final commit, ending "Verification
passed with zero warnings." It was not rerun from a clean clone; CI on the
PR runs it from a fresh checkout.

**Live AI run.** None was made for this release. A live run needs the
owner's approval and a key. Scenario 3 below is the AI DM check.

## Owner scenarios

Prerequisites: Node.js 24.x, npm 11.6.4, a desktop browser, and from the
project directory:

```powershell
npm.cmd ci
npm.cmd run build
```

Each scenario has its own library under `.scratch\release-414\`, copied
from `docs\acceptance\inputs\`. To retry, move that scenario's folder aside
and start again from its first step.

The dice are seeded, so the results below hold only if you take **exactly**
the listed actions, in order. These roll nothing: examining a feature
without a check, taking, choosing a room in **Known rooms**, reloading and
restarting. Moving between rooms can roll: it may spring a trap, start a
fight, or roll the region's wandering table.

**In every fight, take your turn by this rule**, one button at a time, until
"The fight is over.":

1. Ada, in the Gear Hall only: if **Use Counterweight Chain against Grisk
   with Athletics** is enabled in the **Use the room** row, press it.
2. Vex, in the Lock Chamber only: press **Disengage**, then, in the
   **Flee** row, **Pump Room**.
3. Otherwise press the first enabled button in the **Attack** row. For Vex
   that is her shortsword, then her dagger's extra attack.
4. Otherwise press **End turn**.

Never drink a potion, use Second Wind or Action Surge, Hide or use Steady
Aim in a fight.

Launch without a key so the typing box is off. If a key is set in your shell,
clear it first:

```powershell
$env:OPENAI_API_KEY = ""
```

To restart mid-way: wait until the last reply is complete and the buttons are
enabled, press Ctrl+C in PowerShell, then rerun the exact same command.

### 1. The weir bell, the known rooms and the counterweight (Fighter)

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-414\fighter | Out-Null; Copy-Item .\docs\acceptance\inputs\increment-13\level-3-ada.json .\.scratch\release-414\fighter\characters.json; npm.cmd run browser -- --seed 129 --characters .\.scratch\release-414\fighter\characters.json
```

Ada is a level-3 Fighter (28 HP, AC 14) with a mace and no thieves' tools.

1. Open Ada's sheet. Expect _The Coldwater Weirgate_ tagged Level 3 and
   Medium. **Start** it.
2. **Go** Toll Hall. Expect "Sergeant Larrow sees you. Reaction roll: 2d6
   (2 + 4) − 1 Charisma = 5: unfriendly." Press **Attack** among her
   answers, and fight by the rule. Ada wins at 28/28.
3. **Examine** Sergeant Larrow's body and **Take** the Grate Key.
   **Examine** Toll Chest and **Take** the Potion of Healing and the Day's
   Takings.
4. **Go** Stair Head and press **Break** on the Iron Grate. Expect:
   - "Athletics check, at advantage (Remarkable Athlete): d20 3 and 4,
     keeping 4; 4 + 3 + 2 proficiency = 9 against DC 15. Failure by 5 or
     more.";
   - "The alarm is raised by breaking down the Iron Grate (failure by 5 or
     more). The weir bell is clanging; boots drum on the wall-walk above.";
   - the alarm's words in red under the room's description.
5. Press **Unlock** on the Iron Grate. Expect "You unlock the Iron Grate
   with the Grate Key."
6. **Go** Stair Foot. The deadfall springs: expect "The Bell-Wire Deadfall
   deals 1 + 1 = 2 bludgeoning; you have 26/28 HP." Then the alarm's
   wandering roll: "The alarm carries through the dark: d100 21, over 15:
   nothing stirs."
7. **Examine** Dead Goblin and **Take** the Potion of Healing. **Go** Pump
   Room. The alarm's words still show.
8. Look at **Known rooms**. Expect:
   - The Keep: Towpath Gate, Toll Hall, Barge Yard (seen), Stair Head;
   - The Culverts: Stair Foot, Pump Room (you are here), Outfall (seen),
     Wheel Pit (seen), Lock Chamber (seen), Gear Hall (seen).
9. Choose **Toll Hall**. Expect its record, with Ada still in the Pump
   Room:
   - "Fight with Sergeant Larrow: won.";
   - the toll chest's discovery;
   - "Sergeant Larrow's body: Grate Key and Sergeant Larrow's Coins".
10. **Go** Gear Hall. Grisk acts first and hits (18/28). Press **Use
    Counterweight Chain against Grisk with Athletics**. Expect:
    - "Athletics check, at advantage (Remarkable Athlete): d20 20 and 20,
      keeping 20; 20 + 3 + 2 proficiency = 25 against DC 13. Success by 5
      or more.";
    - "The Counterweight Chain hits Grisk. Damage 5 + 4 + 0 = 9
      bludgeoning; Grisk has 12/21 HP.";
    - Grisk knocked prone.

    The chain is used once an adventure. Fight on by the rule; Ada wins at
    18/28.

11. Expect **The sluices open**: +25 XP for Larrow, +200 for Grisk and +500
    for the ending, and 20 gp found.

### 2. The crank, a wandering patrol and a flight from the ogre (Rogue)

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-414\rogue | Out-Null; Copy-Item .\docs\acceptance\inputs\increment-15\level-3-vex.json .\.scratch\release-414\rogue\characters.json; npm.cmd run browser -- --seed 152 --characters .\.scratch\release-414\rogue\characters.json
```

Vex is a level-3 Rogue (21 HP, AC 15) with a shortsword, a dagger and
thieves' tools.

1. **Start** _The Coldwater Weirgate_. **Go** Barge Yard, then
   Lock-Keeper's Office. **Examine** Chart Cupboard and **Take** the
   Windlass Crank.
2. **Go** Barge Yard, then Sluice-House. That is Vex's fourth move in the
   Keep, so the Keep's table rolls. Expect "You listen as you go: d100 2, 15
   or less: the Patrolling Bandit and the Patrol Bandit come upon you."
   Fight by the rule. Vex wins at 21/21.
3. In the Drain Gear's row, press **Use Windlass Crank**. Expect "The crank
   fits the socket. …" and "The way to the Drain Mouth is open."
4. **Go** Drain Mouth, Outfall, then Pump Room.
5. **Go** Lock Chamber. Old Sullage wakes, acts first and misses. In the
   **Flee** row, expect "Draws an attack from Old Sullage". Press
   **Disengage**: the row now says "Draws no attacks". Press **Pump Room**
   in the Flee row. Expect:
   - "You flee, disengaged: no foe gets an attack on you as you go.";
   - "You get away from the Lock Chamber into the Pump Room, leaving the
     Old Sullage behind. The fight is unresolved: …".
6. **Go** Gear Hall and fight Grisk by the rule. Vex wins at 21/21.
7. Expect **The sluices open**: +50 XP for the patrol, +200 for Grisk and
   +500 for the ending. Nothing is credited for the ogre she fled.

### 3. The AI DM: fleeing, the crank and what you know (needs `OPENAI_API_KEY`)

```powershell
$env:OPENAI_API_KEY = "<your key>"
New-Item -ItemType Directory -Force .\.scratch\release-414\ai | Out-Null; Copy-Item .\docs\acceptance\inputs\increment-13\level-3-ada.json .\.scratch\release-414\ai\characters.json; npm.cmd run browser -- --seed 0 --characters .\.scratch\release-414\ai\characters.json
```

Start _The Coldwater Weirgate_ with Ada. Type one at a time, and wait for
each reply. The dice depend on what the DM calls, so the rolls vary. If a
wandering fight comes, fight it with the buttons.

- "Go to the barge yard, then the kennel larder." Brindle the wolf fights.
  On your turn: "Run back to the barge yard!" Expect a flee card on which
  Brindle gets an attack first. The DM must not let Ada go untouched.
- "Go to the keeper's office and search the chart cupboard." Then "Take the
  crank."
- "Go to the sluice-house and use the crank on the gear." Expect the
  engine's use card and "The way to the Drain Mouth is open."
- "Jam my mace in the gear instead." Expect the DM to call no tool: the
  mace isn't a use the gear offers.
- "Which rooms have I been to, and what did I find in the office?" Expect
  an answer from the known rooms, without moving Ada.
- "Climb down into the culvert." Expect a move to the Drain Mouth.

### Owner results

Record each scenario's outcome, and any wording or behavior that surprised
you, separately from the evidence above.

| Scenario                                        | Date | Result | Notes |
| ----------------------------------------------- | ---- | ------ | ----- |
| 1. The weir bell, known rooms and counterweight |      |        |       |
| 2. The crank, a patrol and a flight             |      |        |       |
| 3. The AI DM: fleeing, the crank and memory     |      |        |       |

## Limits

- **Names with an article.** Fight lines put "the" before a named foe: "You
  attack the Sergeant Larrow.", "leaving the Old Sullage behind". This was
  recorded in #412 and is not fixed here. #323 fixed only the ending's XP
  lines.
- **The judged styles don't flee or use the room.** As the shared contract
  sets, the gate's judged runs are a lower bound: fleeing and fight actions
  are reported styles only. The lure, the kobold truce and the silt tunnel
  are tested by journeys, not judged.
- **Scenario 1 breaks a grate it has the key to.** It does so to raise the
  alarm on a fixed seed. A player would more often raise it by a long fight
  in the Keep (past round 3) or by ringing the bell.
- **The gate's CPU budget.** The 16 modules took 173.9 of the 240 reference
  seconds when #412 merged; the Weirgate alone takes about 77. The check has
  flaked on CI near its cap before: rerun a failed job before hunting a
  regression.
- **One sample.** No live AI run was made. AI interpretation varies between
  runs; `npm.cmd run eval:dm -- --suite weirgate` measures it across cases.
  Unfamiliar-player testing has not been done.
- **Prepared libraries.** The scenarios start from prepared libraries
  rather than characters played up from level 1. The career simulation
  (`npm.cmd run career`) plays that path in the engine, and reaches level 5
  for every class through the shipped modules.
- **Fragile seeds.** A change to the Bandit, Wolf, Ogre or Goblin Boss, to
  the Fighter's or Rogue's fights, to the wandering tables or to the dice
  order will move the release seeds. The handoff tests fail when they do.
- **Throwaway formats** until the owner declares a stable release (ADR
  0005): library 26, session 62, trace 56, adventure module 42, bestiary
  10, prompt `5e-dm-v43`. The input libraries are in library format 26.
  When that changes, regenerate Ada's from `levelThreeLibrary` in
  `src/test-fighter-5e.ts` and Vex's from `rogueLibrary` in
  `src/test-rogue-5e.ts`; their tests say so.
