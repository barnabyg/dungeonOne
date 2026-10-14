# The four-module set

The plan for #437: cutting the sixteen shipped modules to four of 10–20 rooms, one per level band, that together carry a character from level 1 to level 5. Every ticket from #438 to #448 follows it. It is a proposal until the owner approves it on #437. The decisions that need the owner are collected at the end.

Measured 2026-10-14 on `main` at `db28ea5`.

## The four slots

| Slot      | Module                           | Rooms today → target | Regions    | Long         | Difficulty                         | Treasure budget | Magic item        | XP award (ending) |
| --------- | -------------------------------- | -------------------- | ---------- | ------------ | ---------------------------------- | --------------- | ----------------- | ----------------- |
| Level 1   | new (#439, #440)                 | — → 10–20            | 2          | yes          | Medium                             | 300 gp          | none (level 3+)   | 300 XP            |
| Level 2   | the Abandoned Delve (#441, #442) | 10 → 14–20           | 2          | yes          | Medium                             | 600 gp          | none (level 3+)   | 600 XP            |
| Level 3–4 | the Coldwater Weirgate (#443)    | 20 → 20              | 2 (as now) | yes (as now) | Medium or Hard (one label)         | 1,200 gp        | its wand (as now) | 1,800 XP          |
| Level 4–5 | the Thornwood Lodge (#444, #445) | 6 → 12–16            | 2          | yes          | Hard (as now), Medium if it clears | 1,500 gp        | a +1 weapon (new) | 3,800 XP          |

- **Long modules.** All four are long modules of two regions, each region with a rest site and an exit. That doubles the treasure budget (`LONG_MODULE_BUDGET_FACTOR`), raises the gate's XP ceiling by a level, and makes the gate sweep each region, judged one difficulty lower. #439 already asks this of the level-1 module, and #441 lists regions for the Delve. The Lodge needs it for the budget: today's Lodge (743 gp) and the Hillfort (586 gp) together exceed a normal level-5 module's 750 gp.
- **Room counts.** The Weirgate is at the 20-room ceiling already, so what it takes over from the Counting-House goes into its existing rooms (or replaces a room) rather than adding rooms.
- **Treasure.** Budgets are 150 gp × maximum level, doubled for a long module (`TREASURE_BUDGETS`). The shipped test asks for 75–100% of the budget and two kinds of gem or art object. The Weirgate's budget rises from 900 to 1,200 gp at maximum level 4, so its 867 gp (72%) falls below the floor: #443 adds about 35–330 gp. The Delve is exempt from the floor today (87%). The plan proposes ending that exemption once it is expanded.
- **Magic items.** At most one per module, and only from maximum level 3 (`MAGIC_ITEM_LIMITS`), so the level-1 and level-2 modules hold none. The Weirgate's one is its Wand of Magic Missiles. The Lodge takes the +1 weapon the Hollow Chantry retires with. A 1st-level scroll is common and counts inside the budget, so a module of any level may place one.
- **Reuse.** The Delve keeps its #136 map as its core. The Weirgate keeps its whole map, regions, routes and flags. The Lodge keeps its six rooms and fights, and takes the Hillfort's portcullis (the crowbar lever for Remarkable Athlete), its rope bridge with the Knotted Rope, Wenna's track, and its level-4 fights (dire wolf, brown bear and the Bandit Captain boss; the wolf and bear share the Lodge's stat blocks).

## The XP path

The issue's "about 300, 600, 1,800 and 3,800 XP in turn" are per-module ending awards. Their running totals, 300, 900, 2,700 and 6,500, are SRD 5.2's thresholds for levels 2 to 5 (`LEVEL_XP`). So a character who survives each module with its main ending reaches the next level exactly, and any XP from fights is slack on top.

That precision matters with only four modules. The career plays a module only once the character has reached its minimum level, and skips it otherwise (`src/career-5e.ts`). A career that comes out of one module short of the next level skips every module after it and stalls. So the ending award must carry the whole step on its own. Under the gate's cautious style the weakest character fights little: today it earns 250 of the Delve's 750 XP, about 210–230 above the ending in the Weirgate, and about 200 above the ending in the Lodge.

| Module          | Award (main ending) | Expected XP of a surviving weakest career (award + cautious fights) | Running total | Level after |
| --------------- | ------------------- | ------------------------------------------------------------------- | ------------- | ----------- |
| Level 1 (new)   | 300                 | 300 + 0–100                                                         | ≥ 300         | 2           |
| Delve           | 600 (was 200)       | 600 + ~50                                                           | ≥ 900         | 3           |
| Weirgate        | 1,800 (was 500)     | 1,800 + ~210                                                        | ≥ 2,700       | 4           |
| Thornwood Lodge | 3,800 (was 2,350)   | 3,800 + ~200                                                        | ≥ 6,500       | 5           |

"Main ending" means the ending kind the module is built around: escape-with-loot for the Delve and the Lodge, and victory for the Weirgate. The other endings pay nothing, as they do today in all three kept modules. A career that escapes empty-handed earns no award and stalls. The check only needs some career of each class to reach level 5, so a stalled career doesn't fail it.

**Against today's career simulation** (200 seeds, the weakest character of each class, cautious):

| Class | Reach level 5 today | XP before the Weirgate | XP before the Lodge | Final XP | Falls (most) |
| ------- | ------------------- | ------------------- | -------- | -------------------------------------------------- |
| Fighter | 57.5% | 2,150–2,190 | ~6,000 | ~8,550 | Smugglers' Cellar 36, Robbers' Barrow 17 |
| Rogue | 68.5% | as above | ~6,000 | ~8,550 | Smugglers' Cellar 20, Lodge 16, Delve 10 |
| Cleric | 18.0% | as above | ~6,000 | ~8,450 | Robbers' Barrow 82, Smugglers' Cellar 50 |
| Wizard | 18.5% | as above | ~6,000 | ~8,400 | Smugglers' Cellar 55, Robbers' Barrow 40, Delve 26 |

Today's sixteen modules overshoot: careers reach the Lodge with about 6,000 XP, near level 5 already, and finish around 8,500. On the new path a career enters the Weirgate at level 3 with about 950 XP and the Lodge at level 4 with about 2,950. Each module is then played at the bottom of its level band, which is the level the gate already judges it at.

**The path projected.** The career simulation was run over four scratch copies: the three kept modules with the plan's awards (the Weirgate's levels set to 3–4) and the Robbers' Barrow, its award raised to 300, standing in for the level-1 module. Every career that survived all four reached level 5, so no career stalled:

| Class | Reach level 5 (today) | Falls: level 1 stand-in | Delve | Weirgate | Lodge |
| ------- | --------------------- | ----- | -------- | ----- |
| Fighter | 81.0% (57.5%) | 17 | 5 | 9 | 7 |
| Rogue | 82.5% (68.5%) | 8 | 10 | 1 | 16 |
| Cleric | 43.0% (18.0%) | 82 | 16 | 7 | 9 |
| Wizard | 44.5% (18.5%) | 40 | 40 | 5 | 26 |

Survivors gained 325, 650, about 2,010 and about 4,000 XP on average in the four. Falls still cluster where the casters are weakest: at level 1, and for the Wizard in the Delve. **Target for #439:** the level-1 module's falls should be no worse than the Barrow's (Cleric 82, Wizard 40 of 200), since it replaces the Barrow in the career. #441 and #445 should likewise keep each class's falls in the Delve and the Lodge no higher than above. The figures change as each module is rewritten; each content ticket re-runs the career check.

**The gate's XP ceiling** (`src/balance-5e.ts`). The gate starts a character one XP short of its module's maximum level + 1, adds all the XP the module offers, and refuses the module if that carries the character past maximum level + 1 (+ 2 for a long module). The awards fit:

| Module          | Ceiling on XP the module offers (long) | Offered after the plan                       |
| --------------- | -------------------------------------- | -------------------------------------------- |
| Level 1, max 1  | 2,400                                  | 300 + fights                                 |
| Delve, max 2    | 5,600                                  | 600 + 550 today + new fights                 |
| Weirgate, max 4 | 16,500                                 | 1,800 + 1,275 today                          |
| Lodge, max 5    | 20,000                                 | 3,800 + 1,825 today + ~850 from the Hillfort |

The career check (#440 onwards, every ticket) must pass at every step. While the thirteen still ship, raising an award only makes careers level faster. After #446 the four alone must carry every class.

## Mechanic coverage

Every mechanic the shipped modules exercise, against the four kept slots. ✓ marks a kept module that has it today; **+** marks one the plan assigns it to. "Retiring" lists the modules that have it today. Counted by a script over the validated modules.

| Mechanic                                      | L1 (new) | Delve             | Weirgate | Lodge            | Retiring modules that have it                       | Fixture coverage                                 |
| --------------------------------------------- | -------- | ----------------- | -------- | ---------------- | --------------------------------------------------- | ------------------------------------------------ |
| Merchant and trade                            | +        |                   |          | ✓ **+** Wenna    | Tinker's Toll, Wolfstone Hillfort                   | `marketBarrow`, `gemMarket`, …                   |
| Reaction rolls (let-pass, peaceful XP)        |          |                   | ✓        |                  | Counting-House                                      | `banditToll`, `waryTunnels`                      |
| Parley (including surprise attack)            |          |                   | ✓        |                  | Counting-House                                      | `banditToll`                                     |
| Tolls                                         |          |                   | ✓        |                  | Counting-House                                      | `banditToll`                                     |
| **Reaction trade**                            |          |                   | **+**    |                  | Counting-House only                                 | `banditToll`                                     |
| **Lurking encounters**                        |          |                   | **+**    |                  | Counting-House only                                 | `lurkingTunnels`                                 |
| **Sneaking past (bypass XP, sneak again)**    |          |                   | **+**    |                  | Counting-House only (plain sneaking works anywhere) | `ratRun`; sneak again inline in `issue-302`      |
| **Surrender (and `gives`)**                   | **+**    |                   |          |                  | Silvervein Mine only                                | `surrenderingGoblins`                            |
| Morale and fleeing, fled carriers             |          | ✓                 | ✓        | ✓                | most                                                | `fleeingGoblins`                                 |
| Monster loot (treasure types)                 |          |                   | ✓        | ✓                | most                                                | `lintelBarrow`, `goblinBurrow`                   |
| Key carried by an opponent                    |          |                   | ✓        |                  | Counting-House, Mine                                | —                                                |
| Rest sites                                    | **+**    | **+**             | ✓        | **+**            | Hollow Chantry                                      | `restingTunnels`, `scrollBarrow`                 |
| **Wandering encounter on a rest (only)**      |          | **+**             |          |                  | Hollow Chantry only                                 | `restingTunnels`                                 |
| Region wandering tables (also roll on a rest) |          |                   | ✓        | **+**            | —                                                   | `wanderingTunnels`, `longWorkings`               |
| **Magic items (+1 gear)**                     |          |                   |          | **+**            | Hollow Chantry only                                 | `magicBarrow`                                    |
| **Spell scrolls**                             |          | **+** (1st level) |          |                  | Hollow Chantry only                                 | `scrollBarrow`, `packedBarrow`                   |
| Wands                                         |          |                   | ✓        |                  | —                                                   | `scrollBarrow`                                   |
| Thieves'-tools locks and traps                |          | ✓                 | ✓        | ✓                | Chantry, Counting-House, Mine, Crypt                | `sealedCrypt`, `picklock-cellar`                 |
| Stuck and locked doors, keys                  |          | ✓                 | ✓        | **+** portcullis | Chantry, Counting-House, Mine, Crypt, Hillfort      | `sealedCrypt`                                    |
| Graded checks (by-5 bands)                    | **+**    |                   | ✓        | ✓                | Hillfort                                            | `gradedCellar`, `ropeCove`                       |
| Several approaches to a check                 | **+**    | ✓                 | ✓        | ✓                | Chantry, Counting-House, Crypt, Hillfort            | `obstacleYard`, `sealedCrypt`                    |
| Retries (cost or circumstance)                |          |                   |          | ✓                | Counting-House, Hillfort                            | `ropeCove`                                       |
| Circumstances (holds, discovered, won, flag)  |          |                   | ✓        | ✓ **+** rope     | Hillfort                                            | `ropeCove`                                       |
| Remarkable Athlete's lever                    |          |                   |          | **+**            | Hillfort only                                       | `checks-5e`, `issue-284` tests                   |
| Talk-only passages                            |          |                   | ✓        | ✓                | Hillfort                                            | `tollYard`, `forkedTunnels`, `obstacleYard`      |
| Hidden passages, open/close effects           |          |                   | ✓        | ✓                | Chantry, Hillfort                                   | `snakeDoor`, `shiftingOssuary`                   |
| Flags                                         |          | **+**             | ✓        | **+**            | —                                                   | `forkedTunnels`, `winchTunnels`, `hermitTunnels` |
| Alarms                                        |          | **+**             | ✓        |                  | —                                                   | `alarmTunnels`                                   |
| Items used on features                        |          | **+**             | ✓        | **+**            | —                                                   | `snakeDoor`                                      |
| Fight actions                                 |          | **+**             | ✓        | **+**            | —                                                   | `statueCellar`                                   |
| Routes and region sweeps                      | **+**    | **+**             | ✓        | **+**            | —                                                   | `longWorkings`, `forkedTunnels`                  |
| Undead (Turn Undead targets)                  |          | ✓                 | ✓        |                  | Chapel, Gravedigger's, Chantry, Mine, Crypt         | `skeletonBarracks`, `sealedCrypt`                |
| Victory ending on a fight                     |          |                   | ✓        |                  | Chantry, Smugglers', Crypt                          | many                                             |

Bold rows are the seven mechanics only retiring modules exercise. Each has a test fixture already, so #438 moves tests onto fixtures and invents no new builder. Each is also assigned to a kept module's design, so the shipped set keeps exercising it:

- **The Counting-House's reaction trade, lurking encounters and authored sneaking (bypass XP, sneak again)** go to the Weirgate (#443), with its reaction, parley and toll, as #443 expects.
- **Surrender** goes to the level-1 module (#439). A weak goblin or bandit who yields and hands over a key suits a module of avoidable fights.
- **The wandering encounter on a rest** (the module-wide `wanderingEncounter`) goes to the Delve (#441), at its rest site. The validator allows a module either that or region wandering tables, not both, so the Delve takes no region tables, although #441 lists them. Region tables, which roll on a rest too, stay in the Weirgate and come to the Lodge. The level-1 module takes neither, to keep its fights few.
- **The +1 weapon** goes to the Lodge (#444). It is the only kept module that may take one: the Weirgate's wand is its one magic item.
- **A 1st-level scroll** goes to the Delve (#441), at the shrine. It is common, so a level-2 module may place it inside its budget.
- **Remarkable Athlete's lever** comes into the Lodge with the Hillfort's portcullis (#444).

A merchant at level 1 is optional (marked **+** but not required). The Lodge keeps the only shipped merchant otherwise, and Tinker's Toll's level-1 trade had players upgrading kits early. #439 decides.

After #446 several mechanics live in exactly one shipped module (the flag, alarm, route and fight-action set in the Weirgate; retries in the Lodge). The **+** marks above spread most of them across a second module.

## Test and script inventory

What names a retiring module today, and where it goes. #438 does the moves that don't depend on new content. #446 does the deletions. Title words that match unrelated things ("warden", the Gnoll Ravager, a "Smugglers' Den" room, a "bothy" doc example, the "Wolfstone Reaver" opponent name in `tests/issue-428.test.mjs`) are false positives and stay. #438's check should match module ids and full titles, not single words.

### Deleted with their module in #446

| File                                                                    | Module                              | Notes                                                                                                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `adventures/5e/<id>.json` × 13 and their keys in `gate-verdicts.json`   | all thirteen                        | `npm.cmd run gate:verdicts` rewrites the verdicts                                                                                                            |
| `tests/shepherds-bothy.test.mjs`                                        | Bothy                               |                                                                                                                                                              |
| `tests/drowned-chapel.test.mjs`                                         | Chapel                              |                                                                                                                                                              |
| `tests/gravediggers-lodge.test.mjs`                                     | Gravedigger's                       |                                                                                                                                                              |
| `tests/ravagers-tower.test.mjs`                                         | Tower                               |                                                                                                                                                              |
| `tests/issue-275-browser.test.mjs`                                      | Bothy, Chapel, Gravedigger's, Tower | #275's handoffs                                                                                                                                              |
| `tests/hollow-chantry.test.mjs`                                         | Chantry                             | its scroll, +1 Mace, grille, ward and interrupted rest are covered by `scrollBarrow`, `magicBarrow`, `picklock-cellar`, `forkedTunnels` and `restingTunnels` |
| `tests/mallow-counting-house.test.mjs`                                  | Counting-House                      | `banditToll`, `picklock-cellar`, `lurkingTunnels`, `gradedCellar`                                                                                            |
| `tests/wolfstone-hillfort.test.mjs`, `tests/issue-289-browser.test.mjs` | Hillfort                            | `ropeCove`, `obstacleYard`, `gradedCellar`; the lever moves to the Lodge's tests in #445                                                                     |
| `tests/issue-241-browser.test.mjs`                                      | Mine                                |                                                                                                                                                              |
| `tests/issue-211-browser.test.mjs`                                      | Toll                                | buy, sell and abandon are covered by the market fixtures                                                                                                     |
| Goblin Warren, Robbers' Barrow, Smugglers' Cellar, Warden's Crypt       | —                                   | no test file of their own; only rows in `shipped-modules.test.mjs`                                                                                           |

### Moved or kept in part (#438)

| File                                             | What moves                                                                                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/issue-211.test.mjs`                       | "the live release script refuses an unknown module" moves to `tests/issue-140.test.mjs`; the rest (Toll content, release run) is deleted in #446                                                |
| `tests/issue-241.test.mjs`                       | the check that `levelThreeLibrary()` is a level-3 Ada moves to `tests/issue-409.test.mjs`; surrender and fleeing are on `surrenderingGoblins` and `fleeingGoblins`; the rest is deleted in #446 |
| `tests/issue-291-browser.test.mjs`               | scenarios 1–2 (the Lodge) stay; scenario 3 (a win settling at level 4 with choices owed) moves from the Drowned Chapel to the Weirgate or a fixture                                             |
| `tests/issue-311-browser.test.mjs`               | scenario 1 (a new Rogue, no module) stays; scenarios 2–3 (sneak, ambush, pick in the Counting-House) move to `picklock-cellar` and `lurkingTunnels`                                             |
| `tests/issue-350-browser.test.mjs`               | the +1 weapon, scroll and interrupted long rest move to fixture browser journeys (`magicBarrow`, `scrollBarrow`, `restingTunnels`); Turn Undead to the Weirgate                                 |
| `tests/issue-409-live.test.mjs`                  | the generated-route dry run and "no hand-written route" check move from the Hollow Chantry to the Weirgate                                                                                      |
| `tests/test-tiers.test.mjs`                      | the example module path becomes `adventures/5e/abandoned-delve.json`                                                                                                                            |
| `src/test-fighter-5e.ts`, `src/test-rogue-5e.ts` | comments on `levelThreeLibrary()` and `rogueLibrary()` stop naming the Mine and the Counting-House; the functions stay (issue-409, issue-414-browser and issue-311-browser use them)            |

### Edited as each module changes (#440–#446)

| File                                                                  | Change                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/adventure-5e.ts` (`FIFTH_ADVENTURE_FILES`)                       | the new module is added (#440); the thirteen are removed (#446). This list drives the browser, gate, career, packaging and fixture separation                                                                                                                      |
| `src/release-run-5e.ts`                                               | `TOLL_FULL_ROUTE`, `MINE_FULL_ROUTE` and `COUNTING_HOUSE_ROUTE` are deleted (#446); `DELVE_FULL_ROUTE` changes with the Delve (#442) or gives way to a generated route; `LODGE_ROUTE` likewise (#445)                                                              |
| `scripts/qualify-release-live.mjs`                                    | the Toll (seed 0), Mine (47) and Counting-House (8) runs go (#446); the Delve's seed 1443 is re-found or generated (#442); the Lodge's seed 2 (#445); the new module runs generated (#440)                                                                         |
| `tests/shipped-modules.test.mjs`                                      | the id list (16 → 4) and browser order; `QUOTED_FIGURES` and `TURN_UNDEAD_FIGURES` rows; the 75–100% treasure list (adding the Delve); the carried-loot list; the career test; the gate CPU budget (#447)                                                          |
| `tests/fixtures/content-tests.mjs`                                    | entries for every deleted test removed; the new module's test added                                                                                                                                                                                                |
| `tests/abandoned-delve*.test.mjs`, `issue-137-browser`, `issue-140`   | follow the Delve's expansion (#442)                                                                                                                                                                                                                                |
| `tests/coldwater-weirgate.test.mjs`, `issue-413`, `issue-414-browser` | follow the Weirgate's changes: its treasure pin (86,730 cp of `treasureBudget(3, true)`) becomes level 4's budget (#443)                                                                                                                                           |
| `tests/thornwood-lodge.test.mjs`                                      | follows the Lodge's expansion; its career side-check (a career enters the Lodge with about 4,100 XP) changes with the XP path (#445)                                                                                                                               |
| `README.md`                                                           | the module list (each entry in its module's ticket); the `qualify-release-live` usage (#446)                                                                                                                                                                       |
| `docs/character-rules.md`                                             | treasure examples; the Hollow Chantry notes under magic items and scrolls; the bestiary rationale (the Goblin Boss's single attack and the monsters justified by the Mine, Tower and Hillfort); "sixteen modules"; the gate tables; the career report (#446, #447) |

### Not affected

- **The AI DM evaluation suites.** `delve` (the default) and `weirgate` use kept modules; the rest use fixtures (`approaches`, `reactions`, `parley`, `flags`, `items`, `room`, `alarm`, `wandering`, `memory`). #442 and #443 add cases for new mechanics.
- **Generic scripts.** `balance`, `career`, `estimate`, `loot`, `gate:verdicts`, `eval:dm`, `test-tiers`, `run-tests` and `package-checks` read the shipped list, not ids. The CI workflow, ESLint configs and `package.json` name no module.
- **`tests/fixture-separation.test.mjs`** builds its banned ids and titles from the shipped list. After #446 the retired names become legal in fixtures, a slightly weaker check but no edit.

### Cross-cutting risks

1. **The career check breaks without a level-1 module.** The three level-1 modules all retire, and a career starts at level 1, so #446 cannot land before #440. Its blockers already say so.
2. **The browser's first module.** The list is ordered by level. Until #440 there is no level-1 module among the four, so a new character would be offered nothing at its level.
3. **Release seeds.** Content changes to the Delve and the Lodge break their hand-written routes and seeds, as combat changes have before. The plan prefers generated routes (#409) for all four, so no seed has to be searched for again.
4. **Acceptance inputs** `docs/acceptance/inputs/increment-13/level-3-ada.json` and `increment-15/level-3-vex.json` stay: kept tests use them.

## Decisions for the owner

1. **The XP path** as per-module ending awards of exactly 300, 600, 1,800 and 3,800, paid only on each module's main ending, with fight XP as slack.
2. **All four as long modules of two regions**, the Lodge included (its treasure needs the long budget once the Hillfort joins it).
3. **The seven retiring-only mechanics' homes:** the Counting-House's reaction trade, lurking and sneaking in the Weirgate; surrender at level 1; the wandering encounter on a rest (instead of region tables) and a 1st-level scroll in the Delve; the +1 weapon and Remarkable Athlete's lever in the Lodge.
4. **A merchant at level 1:** optional, for #439 to propose or not.
5. **The Weirgate's treasure** rises to at least 75% of its new 1,200 gp budget (#443). Beyond the issue: **the Delve loses its exemption** from the 75–100% rule once expanded.
6. Beyond the issue: **generated release routes** for all four modules, replacing the Delve's and the Lodge's hand-written ones as each changes (#442 allows either).
7. **Career targets:** each content ticket keeps each class's falls in its module no higher than the projection above.
