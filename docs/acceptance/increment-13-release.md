# Increment 13: monsters and treasure release and player handoff

Issue #241, 7 October 2026, branch `feat/release-adventures-241`. Increment 13
adds conditions (#232, #234), damage types and defences (#233), the classic
monsters of the bestiary (#235), an encounter estimate (#236), morale and
fleeing (#237), surrender (#238), treasure value and level budgets (#239) and
monster loot from treasure types (#240). This ticket releases _The Silvervein
Mine_, a module that uses them together, and hands the increment to players.
The [rules document](../character-rules.md) lists every rule and abstraction.

The evidence comes in three kinds, kept apart below: **automated** (tests and
scripts anyone can rerun), **implementer** (what the implementer ran and saw),
and **owner** (the manual scenarios for the project owner, with space for
results).

## What changed in this ticket

- **The Silvervein Mine** (`adventures/5e/silvervein-mine.json`), levels 2–3,
  declared Hard. The owner approved the premise, room map, monsters and
  treasure placement in the #241 implementation session, before the content
  was written. It has six rooms in an old silver mine, and you get out by the
  mine mouth, where it starts and where there is nothing to take:
  - **Sorting Shed** (the required path): a Kobold Lookout and a Kobold
    Tunneller. When the first falls, the other checks morale (DC 8) and may
    break: the lookout flees, taking its coins, while the tunneller surrenders
    and, asked about "the iron door", gives up the iron key it carries. A fled
    monster that fought gives half its XP (the #237 owner decision, which
    refined this issue's "no XP"). The ore bin holds the
    first loot: a Potion of Healing and 40 sp.
  - **Main Gallery**: a notice board, and three ways on.
  - **Flooded Drift**: the drowned miners, a Zombie and a Skeleton (undead),
    and a 25 gp silver locket.
  - **Webbed Winze**: a Giant Spider (poison), a 100 gp sapphire and a
    potion.
  - **Overseer's Office**, behind an iron door (the key, pick Dexterity DC 15
    or break Athletics DC 17): a Bugbear Warrior overseer and the miners'
    60 gp payroll.
- **Loot from treasure types.** The kobolds' and the bugbear's loot was rolled
  with `npm.cmd run loot -- adventures/5e/silvervein-mine.json --seed 241`.
  The kobolds carry 9 cp and 8 cp; the bugbear carries 12 sp and a 10 gp
  rough gem. The module holds 300 gp 3 sp 7 cp of its 450 gp budget.
- **Owner decision during the ticket.** As first approved, two Giant Rats
  guarded the main gallery. Each dies to one attack 49.7% of the time, so they
  put 5 of the 8 ordinary enemies over the Hard one-hit-kill cap, and the gate
  refused the module as too easy. The owner dropped the rats rather than swap
  them for another monster.
- **Release-run harness.** `scripts/qualify-release-live.mjs` takes
  `--adventure silvervein-mine`. Its run starts from a saved level-3 Ada
  (`levelThreeLibrary` in `src/test-fighter-5e.ts`), because the mine is for
  levels 2–3.

**Since #252** (module audit, 7 October 2026): _The Silvervein Mine_ is
declared Medium, as its weakest character survives 92.5% at level 2; its
content and release seeds are unchanged. The browser now tags it Medium.

## Automated evidence

- `npm.cmd run verify` passes with zero warnings: formatting, lint, types,
  static analysis, tests, audit, secret scan and package checks, on a clean
  clone (see _Implementer evidence_). CI reruns it on the PR's final commit.
- **Balance gate.** _The Silvervein Mine_ qualifies as Hard. On its required
  path the weakest character playing cautiously survives 92.5% of 200 runs
  with its weakest kit, at level 2 (Hard needs 75%). Three of six ordinary
  enemies (both kobolds and the Skeleton) die to one attack more than 30% of
  the time, and no more than half may. Its 862 XP keeps a character within the
  level-4 limit. Every other shipped module still qualifies.
  `npm.cmd run balance` prints the full report.
- **Scripted-DM journeys** (`tests/issue-241.test.mjs`), each turn one AI DM
  tool call the engine must offer and accept:
  - _Out with the silver_: a level-3 Ada clears all six rooms; the tunneller
    surrenders and gives up the key.
  - _Out with the silver_ the other way: the tunneller is cut down first and
    leaves the key on its body, and the lookout flees with its coins, for half
    its XP.
  - _Out empty-handed_: turning back at the mine mouth.
  - _Lost in the mine_: a level-2 Ada who walks straight into the webs.
- **Release run** (same file): the mine played through the browser server, its
  API and its library file from the saved level-3 Ada, with a DM that only
  narrates, so every step falls back to its button. It visits all six rooms,
  wins all four fights and walks out with 1762 XP and 65 gp 2 sp 9 cp.
- **The handoff journey** (`tests/issue-241-browser.test.mjs`): scenarios 1–3
  below, driven in a real browser on seed 26, and checked against the library
  file on disk. It asserts the seeded numbers the scenarios quote, so a change
  that moves them fails the test.
- **Increment 13 behavior**, each tested browser → API → storage:

  | Behavior                                            | Test                                                       |
  | --------------------------------------------------- | ---------------------------------------------------------- |
  | Poisoned and prone, shown in the fight and on cards | `issue-232-browser.test.mjs`                               |
  | Paralysed by a ghoul: only Wait is offered          | `issue-234-browser.test.mjs`                               |
  | Resistance, vulnerability and Undead Fortitude      | `issue-233-browser.test.mjs`                               |
  | Morale: a monster flees and takes its loot          | `issue-237-browser.test.mjs`                               |
  | Surrender, talking to the surrendered, given items  | `issue-238-browser.test.mjs`, `issue-241-browser.test.mjs` |
  | Treasure values on the sheet and the ending         | `issue-239-browser.test.mjs`                               |
  | Monster loot on the body after a won fight          | `issue-240-browser.test.mjs`                               |

## Implementer evidence

**Clean clone.** On Windows 11, Node.js 24.13.0 and npm 11.6.4, the
implementer ran `git clone` of the branch at `a356b4f` into an empty
directory, then `npm.cmd ci` (0 vulnerabilities), `npm.cmd run build` and
`npm.cmd run verify`. All passed, and verify ended "Verification passed with
zero warnings." An earlier clean clone, at `e273d24`, failed verify: the
fixture-separation test had not yet listed the two new content tests, which
`87067ab` fixed. From the `a356b4f` clone, a browser server on seed 26 with
the balance gate on and no key served the page (HTTP 200). It loaded the
handoff's input library (Ada, level 3) and offered all nine modules, _The
Silvervein Mine_ last. The real launcher, which also opens the desktop
browser, was not run. The scenario 1–3 clicks were run by the browser test
above, not by hand.

**Bounded live AI run.** The budget was stated in the implementer's session
before the run started: at most 80 provider calls on `gpt-5.6-luna` (the
default), one run of the whole mine. The owner approved 80 calls; the run used
the mine's release seed, 26, rather than seed 0, on which this route ends in
defeat. Command:

```powershell
node scripts/qualify-release-live.mjs --live --adventure silvervein-mine --max-calls 80 --seed 26 --output docs/acceptance/evidence/increment-13-live-release-run.json
```

The full report is in
[`evidence/increment-13-live-release-run.json`](evidence/increment-13-live-release-run.json).
It holds every message, the DM's tool calls, the engine's cards and the
replies, but no credentials or prompts. Result:

| Measure                        | Result                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Ending                         | _Out with the silver_, 1762 XP, level 3                                                                                                  |
| Turns / typed to the AI DM     | 69 / 68 (Leave is button-only by design)                                                                                                 |
| Typed steps the DM carried out | 68 of 68; none needed its button                                                                                                         |
| Surrender                      | The tunneller surrendered; the DM asked it all 3 topics through `talk`                                                                   |
| Tools the DM called            | `attack` 19, `end_turn` 12, `move` 10, `take` 10, `examine` 9, `talk` 3, `second_wind` 2, `use_item`, `unlock` and `action_surge` 1 each |
| Steps skipped                  | 0; all 6 rooms visited                                                                                                                   |
| Provider calls                 | 68 of at most 80                                                                                                                         |
| Tokens                         | 177,960 input, 1,817 output                                                                                                              |
| Replies claiming an outcome    | 0 flagged on uncommitted turns                                                                                                           |
| Prompt version                 | `5e-dm-v14`                                                                                                                              |

The run's character is the saved level-3 Ada of scenario 1, and its dice are
the release run's, so the numbers match scenario 2.

**Balance note.** The gate judges the cautious route: the kobolds, the ore bin
and out. Clearing the whole mine is far deadlier. The gate's attack-everything
run survives 0–2% at level 2 and 1–12% at level 3, and a level-3 Ada taking the
scripted route clears it on about 1 seed in 100. The spider is the main
killer: its poison bite takes a third of a level-3 Fighter's hit points. This
matches the _Hard_ rating and the owner's principle that early levels are
dangerous. The handoff and release seeds were chosen because Ada survives
them.

## Owner scenarios

Prerequisites: Node.js 24.x, npm 11.6.4, a desktop browser, and from the
project directory:

```powershell
npm.cmd ci
npm.cmd run build
```

The mine is for levels 2–3, so the scenarios start from a library holding Ada
at level 3 (900 XP), the release runs' character. Scenarios 1–3 share one
library; scenario 4 has its own. Both are under `.scratch\release-241\`. To
retry, move the folder aside and start from the scenario's first step.

The dice are seeded, so the results below hold only if you take **exactly**
the listed actions, in order. Moving between rooms (except into a fight),
examining, taking, talking about a topic without a check, unlocking with the
key, reloading and restarting roll nothing.

**In every fight, take your turn by this rule**, one button at a time, until
"The fight is over.":

1. At half your hit points or fewer (14/28 or less), press **Second Wind** if
   it is enabled, or else **Drink** the Potion of Healing under **You carry**.
2. Otherwise press the first enabled **Attack** button.
3. Otherwise press **Action Surge** if it is enabled.
4. Otherwise press **End turn**.

Unless a scenario says otherwise, launch without a key so the typing box is
off. If a key is set in your shell, clear it first:

```powershell
$env:OPENAI_API_KEY = ""
```

To restart mid-way: wait until the last reply is complete and the buttons are
enabled, press Ctrl+C in PowerShell, then rerun the exact same command.

### 1. A level-3 Fighter, and the mine on offer

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-241\mine
Copy-Item .\docs\acceptance\inputs\increment-13\level-3-ada.json .\.scratch\release-241\mine\characters.json
npm.cmd run browser -- --seed 26 --characters .\.scratch\release-241\mine\characters.json
```

1. The library lists Ada. Open her sheet. Expect "Level 3 Fighter · 900 XP ·
   Leather armour, Mace", HP 28/28, AC 14, and Mace +5 to hit, 1d6 + 3
   bludgeoning, Sap, critical on 19–20.
2. Expect _The Silvervein Mine_ among the adventures, just before _The
   Goblin Warren_ (level 3 since #252), tagged Levels 2–3 and Medium (#252),
   with its objective: "Kobolds have dug into the old Silvervein mine…".

### 2. The Silvervein Mine: surrender, undead, the overseer and the spider

In the same library, **Start** _The Silvervein Mine_. Fight by the rule above.

1. At the Mine Mouth, **Examine** Overturned Ore Cart: it is empty, and
   clawed footprints lead into the mine.
2. **Go** Sorting Shed. Initiative: Kobold Lookout 10, Ada 6, Kobold
   Tunneller 3. The lookout attacks at advantage (Pack Tactics) and scores a
   critical hit: Ada at 21/28.
3. Fight. Your Attack drops the Kobold Lookout (0/5). Expect "Kobold Tunneller
   checks morale as the first of its side falls: a Wisdom saving throw, 1 − 2 =
   -1 against DC 8. Failure: it will surrender on its turn." By the rule, press **Action Surge**, then
   **Attack** the tunneller (4 damage, 1/5 HP), then **End turn**: "Kobold
   Tunneller throws down its arms and surrenders. The fight is over."
4. The Kobold Tunneller is now a creature to talk to. **Talk** about the iron
   door: it offers you the Iron Key. **Take** Iron Key. **Talk** about the
   webs and the overseer, and read its warnings.
5. **Examine** Ore Bin, **Take** the Potion of Healing and the Kobolds'
   Takings, **Examine** Kobold Lookout's body, **Take** its coins. Expect
   "Purse: 4 gp 9 cp".
6. **Go** Main Gallery, **Examine** Notice Board, **Go** Flooded Drift.
   Initiative: Miner's Bones 12, Ada 7, Drowned Miner −1. Fight. Expect a
   critical hit on Miner's Bones, "12 bludgeoning, doubled to 24
   (vulnerable)", and the Drowned Miner's Undead Fortitude: "17 + 3 = 20
   against DC 14. Success: Drowned Miner refuses to fall and has 1/15 HP." It
   gets up once more, then "Failure: Drowned Miner stays down." Ada is still
   at 21/28.
7. **Examine** Burial Niche, **Take** Silver Locket. **Go** Main Gallery,
   **Unlock** Iron Door ("You unlock the Iron Door with the Iron Key."), **Go**
   Overseer's Office. Initiative: Bugbear Overseer 16, Ada 11. Fight. Expect
   the overseer to hit once for 13 (Ada at 8/28), and Ada to use Second Wind
   twice (14/28, then 19/28) before the overseer falls at 0/33.
8. **Examine** the Bugbear Overseer's body and **Take** its coins and its
   rough gem. **Examine** Ledger Desk and Payroll Chest, **Take** Miners'
   Payroll. Expect "Purse: 65 gp 2 sp 9 cp".
9. **Go** Main Gallery, **Go** Webbed Winze. Initiative: Ada 16, Giant Spider 13. Fight. Expect a bite of 9 piercing plus 6 poison (Ada at 4/28), then
   "Ada makes a Constitution saving throw against being poisoned: 7 + 4 = 11
   against DC 11. Success." Ada drinks the potion (7 HP, 11/28) and kills the
   spider.
10. **Examine** Cocooned Prospector, **Take** Uncut Sapphire and the Potion of
    Healing. **Go** Main Gallery, Sorting Shed, Mine Mouth, then **Leave the
    adventure** and **Leave now**.
11. Expect **Out with the silver**, _Escaped with loot_, with Defeated
    Kobold Lookout; spared Kobold Tunneller +62 XP (25 for the lookout,
    half the tunneller's 25 as Ada struck it, and 25 for sparing it), Defeated
    Drowned Miner and Miner's Bones +100 XP, Defeated Bugbear Overseer
    +200 XP, Defeated Giant Spider +200 XP and Out with the silver +300 XP.
    Treasure kept: Silver Locket (25 gp), Bugbear Overseer's Rough Gem (10 gp)
    and Uncut Sapphire (100 gp). "Coin found: 65 gp 2 sp 9 cp. Purse: 65 gp 2
    sp 9 cp." and "Ada has 1762 XP." There is no level up: level 3 is the
    highest.
12. **Back to Ada's sheet**: level 3, 1762 XP, HP 28/28, the three treasures,
    and Purse 65 gp 2 sp 9 cp.

### 3. Getting out empty-handed

Continue in the same library. **Start** _The Silvervein Mine_ again and, at
the Mine Mouth, **Leave the adventure** and **Leave now**. Expect **Out
empty-handed**, _Escaped empty-handed_, and "Nothing new earned". Ada's sheet
is unchanged.

### 4. The AI DM and the surrendered kobold (needs `OPENAI_API_KEY`)

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-241\ai
Copy-Item .\docs\acceptance\inputs\increment-13\level-3-ada.json .\.scratch\release-241\ai\characters.json
$env:OPENAI_API_KEY = "<your key>"
npm.cmd run browser -- --seed 26 --characters .\.scratch\release-241\ai\characters.json
```

Start _The Silvervein Mine_ with Ada. Type "Follow the rails into the mine."
and fight the kobolds by the rule above, with the buttons. Once the fight is
over, type one at a time, waiting for each reply:

- "Ask the kobold about the iron door." Expect the tunneller's words and the
  Iron Key offered, with the engine's card.
- "Make the kobold hand over all its coins." The kobold has no topic for
  that, so expect a reply that changes nothing: no coin moves.
- "Ask the kobold where the best treasure is." Expect the DM to offer only the
  kobold's topics (the webs, the overseer), or a reply that it doesn't know,
  and no roll.

The live run's report shows what to expect when the DM plays the whole mine.

### Owner results

Record each scenario's outcome, and any wording or behavior that surprised
you, separately from the evidence above.

| Scenario                              | Date | Result | Notes |
| ------------------------------------- | ---- | ------ | ----- |
| 1. A level-3 Fighter, the mine listed |      |        |       |
| 2. The mine: surrender to the spider  |      |        |       |
| 3. Getting out empty-handed           |      |        |       |
| 4. The AI DM and the surrendered      |      |        |       |

## Limits

- The live run is a single sample on one seed. AI interpretation varies
  between runs; `npm.cmd run eval:dm` measures it across cases.
- Unfamiliar-player testing has not been done.
- The scenarios start from a prepared level-3 library rather than a character
  levelled up in play. Reaching level 3 in play takes about two adventures
  (for example _The Tinker's Toll_ and then _The Goblin Warren_).
- No owner scenario shows a monster fleeing: on seed 26 the tunneller
  surrenders. A scripted-DM journey covers fleeing, and the #237 handoff test
  shows it in a browser.
- The release seeds are fragile. A change to the kobold, Zombie, Skeleton,
  Giant Spider or Bugbear Warrior, or to the dice order, will move them, as it
  does the Delve's.
- The Hobgoblin Warrior, Gnoll Ravager and Ogre are in the bestiary but in no
  shipped module.
- Formats are throwaway until the owner declares a stable release (ADR 0005):
  library 10, session 22, trace 16, adventure module 18, bestiary 7. The input
  library is in library format 10; when that changes, regenerate it from
  `levelThreeLibrary()` (its test says so).
