# Test fixtures

Engine, runtime, browser and harness tests play the adventure modules here,
never the shipped modules in `adventures/5e/` (#251), so content can be
rebalanced or pruned without touching engine tests. Only the content tests
listed in `tests/fixture-separation.test.mjs` read a shipped module, and that
test fails if any other test or fixture does. The fixtures use the built-in
bestiary (`bestiary.mjs`), which holds SRD stat blocks rather than content.

## Adventure modules (issue 251)

`modules.mjs` loads and validates these modules. Each began as a copy of a
module's content at the time of #251, under its own id and title, and is now
owned by the tests: change it only for a test's sake.

| Fixture                | Export           | Mechanic                                                                                                         |
| ---------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `lone-goblin.json`     | `loneGoblin`     | A one-room fight: one Goblin Warrior, level 1, hard. Victory and defeat endings.                                 |
| `goblin-band.json`     | `goblinBand`     | A group fight: a Goblin Minion and a Goblin Warrior, level 2, medium.                                            |
| `goblin-trio.json`     | `goblinTrio`     | A group fight with numbered opponents of one kind, for multi-target and ordinal targeting.                       |
| `rat-tunnels.json`     | `ratTunnels`     | Exploration: passages, examined features, a hidden potion, a Giant Rat fight that leaves the adventure going.    |
| (built from the above) | `ratlessTunnels` | The tunnels without the rat, as _The Quiet Tunnels_: exploring rooms with one fight, in the den.                 |
| `lintel-barrow.json`   | `lintelBarrow`   | An exit with loot behind a fight: a lintel to examine, a torc under the bier, a goblin carrying a pouch of coin. |
| `sealed-crypt.json`    | `sealedCrypt`    | Doors, a trap and talk, level 2: a stuck door, a locked door and its key, a dart trap, a creature with a check.  |
| `goblin-burrow.json`   | `goblinBurrow`   | A level-up journey, levels 2–3: tunnel guards, then a goblin boss and its hoard on the way out.                  |

`moduleFile(name)` returns a fresh copy of a fixture's JSON to change and
validate, and `fightRoomFile(id, title, opponents)` builds a one-room fight
against any opponents in the lone goblin's room (`fightRoom` validates it),
for tests of one monster's rules (riders, paralysis, Multiattack, damage
defences). `FIXTURE_MODULES`
lists every module above, for property checks that play each one.

`renamed-skeletons.mjs` is two bestiary Skeletons under the module's own
names (#231) and a one-room fight against them, for the tests that check a
renamed monster keeps its module name.

The barrow variants below are built on `lintelBarrow`: `armoury-barrow.mjs`
hides gear behind the lintel for the equipment tests (#209), and
`market-barrow.mjs` puts a pedlar at the mouth for the trading tests (#210).

## Counter runtime

`counter-runtime.mjs` is a minimal `AdventureRuntime` with no game rules: a
counter that a d6 advances and that wins at three. The DM turn loop, OpenAI
adapter and runtime contract tests use it to exercise shared infrastructure
without depending on the 5e runtime.

## Pre-5e library

`pre-5e-library.mjs` is a character library in the pre-5e game's format
(version 1). The 5e library and launcher tests check that it is refused by name
and left byte-identical.

## Difficulty gate fixtures (issue 135)

`gate-goblin-pair.json` and `gate-minion-yard.json` are 5e adventure modules
for `tests/balance-5e.test.mjs`, built from the SRD 5.2 goblin stat blocks.
_The Goblin Pair_ (two Goblin Warriors, level 3 since the leather starting
kits of #207) is too deadly for medium and passes as hard. _The Minion Yard_ (two Goblin Minions in turn, level 1) is
safe enough for medium, but a strong level-1 Fighter usually kills each
minion with one attack, so it fails as too easy at every difficulty.

## Browser launch

`default-launch.mjs` runs the built browser launcher as a player would,
through `quiet-launcher.mjs`, which stops it opening a desktop browser window.
`session-layout.mjs` launches the browser and builds the fighters the 5e
journeys use to check that the newest history entry and the action buttons
are on screen together (#154).

## Bestiary (issue 231)

`bestiary.mjs` loads the built-in bestiary and binds the adventure validator to
it as `validateModule`, for tests that validate a module's JSON, or a changed
copy of it, directly. The two gate fixtures, `goblin-trio.json` and
`rat-tunnels.json` author their stat blocks inline, so they also cover one-off
inline opponents; the other fixtures name bestiary monsters.

## Encounter estimate (issue 236)

`estimate-wolf-pair.json` is _The Wolf Pair_: one room whose fight is two
bestiary Wolves, renamed, for levels 2–3. `tests/estimate-5e.test.mjs` checks
that `npm run estimate -- --levels 2-3 wolf:2` gives the same numbers as the
gate and the harness measure on it.

## Fleeing goblins (issue 237)

`fleeing-goblins.mjs` is the lintel barrow with three numbered Goblin
Minions in the burial hall, each carrying its own pouch of coin. `fleeingSeed()`
finds the first browser seed on which Ada, attacking the first goblin offered,
wins the fight with one goblin fled; the morale runtime and browser tests play
it to check that the fled goblin leaves no body or coin and gives half its XP.

## Surrendering goblins (issue 238)

`surrendering-goblins.mjs` is the lintel barrow with three numbered Goblin
Minions in the burial hall that surrender instead of fleeing, each carrying a
stolen ring. Each goblin's surrender has a Mercy topic that gives its ring, a
topic that only tells, and 10 XP for sparing it. `surrenderSeed()` finds the
first browser seed on which Ada, attacking the first goblin offered, wins the
fight with a goblin surrendered; the surrender runtime and browser tests talk
to it, take its ring and escape.

## Treasure value (issue 239)

`gem-market.mjs` is the market barrow (`market-barrow.mjs`) with a Blue Opal,
a 50 gp gem, under the stone bier, found once the goblin's fight is won and
sold to the pedlar at the mouth for its full value. An ogre's den off the
mouth is a fight a level-1 Fighter loses, for the journey that trades and
then falls. `armoury-barrow.mjs` is now for levels 1–3, since its longsword,
greatsword and chain mail are uncommon.
