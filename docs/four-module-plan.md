# The four-module set

Four long modules, one for each level band, carry a character from level 1 to level 5. The owner approved the plan on #437 (14 October 2026). The modules were built in #440–#445, and from #446 they are the only shipped modules.

## The four modules

| Level | Module                      | Rooms | Difficulty | Treasure budget | Magic item                        | XP award (main ending) |
| ----- | --------------------------- | ----- | ---------- | --------------- | --------------------------------- | ---------------------- |
| 1     | The Bramblecote Cider House | 17    | Medium     | 300 gp          | none (level 3+)                   | 300 XP                 |
| 2     | The Abandoned Delve         | 16    | Hard       | 600 gp          | none (level 3+)                   | 600 XP                 |
| 3–4   | The Coldwater Weirgate      | 20    | Medium     | 1,200 gp        | Wand of Magic Missiles            | 1,800 XP               |
| 4–5   | The Thornwood Lodge         | 16    | Hard       | 1,500 gp        | the King's Hanger (+1 Shortsword) | 3,800 XP               |

- **Long modules.** Each module has two regions, and each region has a rest site and an exit. A long module gets twice the treasure budget (`LONG_MODULE_BUDGET_FACTOR`). The gate's XP ceiling is one level higher, and the gate sweeps each region, judging it one difficulty lower.
- **Treasure.** Each module holds 75–100% of its budget, with at least two kinds of gem or art object (`shipped-modules.test.mjs`).
- **Magic items.** A module holds at most one, and only from maximum level 3 (`MAGIC_ITEM_LIMITS`). A 1st-level scroll is common and counts inside the budget, so the Delve places one.

## The XP path

The ending awards add up to SRD 5.2's thresholds for levels 2 to 5 (300, 900, 2,700 and 6,500; `LEVEL_XP`). A character who survives each module with its main ending therefore reaches the next level exactly, and XP from fights is slack. The award must carry the whole step on its own. A career plays a module only once it reaches the module's minimum level (`src/career-5e.ts`), so a career that leaves one module short of the next level stalls.

"Main ending" means escaping with loot from the Cider House, the Delve and the Lodge, and victory in the Weirgate. The other endings pay nothing. The career check only needs some career of each class to reach level 5, so a stalled career doesn't fail it.

Since #446, 80.5% of the weakest Fighter's careers, 79.5% of the Rogue's, 44% of the Cleric's and 48% of the Wizard's reach level 5, and every career that survives the Lodge does.

**The gate's XP ceiling** (`src/balance-5e.ts`). The gate starts a character one XP short of its module's maximum level + 1, adds all the XP the module offers, and refuses the module if that carries the character past maximum level + 2 (a long module).

| Module               | Ceiling on the XP offered | Offered |
| -------------------- | ------------------------- | ------- |
| Cider House, max 1   | 2,400                     | 537     |
| Delve, max 2         | 5,600                     | 1,275   |
| Weirgate, max 4      | 16,500                    | 3,075   |
| Lodge, max 5         | 20,000                    | 6,750   |

## Mechanic coverage

Which shipped module exercises each mechanic, and the test fixtures that cover it. Several mechanics live in only one module, so a module change that drops one should move it, or keep its fixture.

| Mechanic                                      | Cider House | Delve | Weirgate | Lodge | Fixture coverage                                 |
| --------------------------------------------- | ----------- | ----- | -------- | ----- | ------------------------------------------------ |
| Merchant and trade                            |             |       |          | ✓     | `marketBarrow`, `gemMarket`, …                   |
| Reaction rolls, parley, tolls, reaction trade |             |       | ✓        |       | `banditToll`, `waryTunnels`                      |
| Lurking encounters                            |             |       | ✓        |       | `lurkingTunnels`                                 |
| Sneaking past (bypass XP, sneak again)        |             |       | ✓        |       | `ratRun`; sneak again inline in `issue-302`      |
| Surrender (and `gives`)                       | ✓           |       |          |       | `surrenderingGoblins`                            |
| Morale and fleeing, fled carriers             |             | ✓     | ✓        | ✓     | `fleeingGoblins`                                 |
| Monster loot (treasure types)                 | ✓           | ✓     | ✓        | ✓     | `lintelBarrow`, `goblinBurrow`                   |
| Key carried by an opponent                    | ✓           |       | ✓        |       | —                                                |
| Rest sites                                    | ✓           | ✓     | ✓        | ✓     | `restingTunnels`, `scrollBarrow`                 |
| Wandering encounter on a rest (only)          |             | ✓     |          |       | `restingTunnels`                                 |
| Region wandering tables (also roll on a rest) |             |       | ✓        | ✓     | `wanderingTunnels`, `longWorkings`               |
| Magic items (+1 gear)                         |             |       |          | ✓     | `magicBarrow`                                    |
| Spell scrolls                                 |             | ✓     |          |       | `scrollBarrow`, `packedBarrow`                   |
| Wands                                         |             |       | ✓        |       | `scrollBarrow`                                   |
| Thieves'-tools locks and traps                | ✓           | ✓     | ✓        | ✓     | `sealedCrypt`, `picklock-cellar`                 |
| Stuck and locked doors, keys                  | ✓           | ✓     | ✓        | ✓     | `sealedCrypt`                                    |
| Graded checks (by-5 bands)                    | ✓           | ✓     | ✓        | ✓     | `gradedCellar`, `ropeCove`                       |
| Several approaches to a check                 | ✓           | ✓     | ✓        | ✓     | `obstacleYard`, `sealedCrypt`                    |
| Retries (cost or circumstance)                |             |       |          | ✓     | `ropeCove`                                       |
| Circumstances (holds, discovered, won, flag)  | ✓           | ✓     | ✓        | ✓     | `ropeCove`                                       |
| Remarkable Athlete's lever                    |             |       |          | ✓     | `checks-5e`, `issue-284` tests                   |
| Talk-only passages                            |             |       | ✓        | ✓     | `tollYard`, `forkedTunnels`, `obstacleYard`      |
| Hidden passages, open/close effects           | ✓           | ✓     | ✓        | ✓     | `snakeDoor`, `shiftingOssuary`                   |
| Flags                                         |             | ✓     | ✓        | ✓     | `forkedTunnels`, `winchTunnels`, `hermitTunnels` |
| Alarms                                        |             | ✓     | ✓        |       | `alarmTunnels`                                   |
| Items used on features                        |             | ✓     | ✓        | ✓     | `snakeDoor`                                      |
| Fight actions                                 |             | ✓     | ✓        | ✓     | `statueCellar`                                   |
| Routes and region sweeps                      | ✓           | ✓     | ✓        | ✓     | `longWorkings`, `forkedTunnels`                  |
| Undead (Turn Undead targets)                  |             | ✓     | ✓        |       | `skeletonBarracks`, `sealedCrypt`                |
| Victory ending on a fight                     |             |       | ✓        |       | many                                             |
