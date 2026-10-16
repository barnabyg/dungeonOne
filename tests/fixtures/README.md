# Test fixtures

Engine, runtime, browser and harness tests play the adventure modules here, never the shipped modules in `adventures/5e/`, so content can be rebalanced or pruned without touching engine tests. Only the content tests listed in `content-tests.mjs` read a shipped module; `tests/fixture-separation.test.mjs` fails if any other test or fixture does. The fixtures are owned by the tests: change one only for a test's sake.

Each fixture file's header comment, and each export's doc comment, says what it holds. Other rules:

- Browser and server tests on fixture modules pass `qualifies: () => true`: fixtures are engine material, and several are too deadly for some classes to pass the gate.
- A fixture whose opponent carries loot for another mechanic's sake uses an inline stat block (`inlineMonster` in `bestiary.mjs`), as a bestiary monster's treasure type limits its loot.
- Several modules built here have a twin in `adventures/eval/`, the AI DM evaluation's copy (the snake door, statue cellar, alarm, wandering and memory tunnels).

## Files

- `modules.mjs`: loads and validates the fixture modules (the `*.json` files not listed below) and builds their variants. `FIXTURE_MODULES` lists those the property checks play.
- `bestiary.mjs`: the validator bound to the built-in bestiary, and `inlineMonster`.
- `content-tests.mjs`: the content tier, the only tests that may read a shipped module.
- `counter-runtime.mjs`: a minimal runtime with no game rules, for shared-infrastructure tests.
- `engine-dice.mjs`: scripted dice for engine tests.
- `morale-encounter.mjs`: encounter-engine fights for the morale and surrender tests.
- `fighter-choices.mjs`: the creation choices most library and session tests create Ada with.
- `charismatic-fighter.mjs`: Bea, a Fighter with Charisma 16, for reaction rolls.
- `fighter-golden-cases.mjs`: every derived number of a Fighter, checked against the digests in `fighter-golden.json`.
- `level-3-casters.mjs` and `level-5-wizard.mjs`: caster characters for the spell and caster tests.
- `library.mjs`: a library holding one fresh Ada, and the barrow fight its tests win.
- `pre-5e-library.mjs`: a pre-5e library that loaders must refuse and leave untouched.
- `playthroughs.mjs`: seeded playthroughs of every fixture module, shared by the bar-projection tests.
- `seed-search.mjs`: helpers for finding a browser seed by simulating Ada's clicks.
- `module-journey.mjs`: engine journeys along a fixed route, for content tests and browser seeds.
- `gate-workers.mjs`: gates shipped modules on worker threads; its timeout is a hang guard, not a performance budget.
- `browser-journey.mjs`, `session-layout.mjs` and `save-files.mjs`: browser launch, common clicks, and readers for what the server saves.
- `default-launch.mjs` and `quiet-launcher.mjs`: run the real launcher without opening a desktop window.
- `renamed-skeletons.mjs`: bestiary Skeletons under a module's own names.
- Lintel barrow variants: `armoury-barrow.mjs`, `market-barrow.mjs`, `gem-market.mjs`, `packed-barrow.mjs`, `magic-barrow.mjs`, `scroll-barrow.mjs`, `archery-barrow.mjs`, `rolled-barrow.mjs`, `fleeing-goblins.mjs` and `surrendering-goblins.mjs`.

## JSON fixtures no JS fixture loads

- `gate-goblin-pair.json` and `gate-minion-yard.json`: gate fixtures for `tests/balance-5e.test.mjs`. The pair is too deadly for medium and passes as hard; the yard fails as too easy at every difficulty.
- `estimate-wolf-pair.json`: two renamed Wolves, for `tests/estimate-5e.test.mjs`, which checks the encounter estimate against the gate and harness.
- `bestiary-lairs.json`: a lair off a crossroads for each of several bestiary monsters (kobolds, hobgoblin, bugbear, gnoll, ogre), for `tests/issue-235.test.mjs`.
- `fox-barrow-sketch.json`: a layout sketch, not a module, for the mapping tool's tests (`tests/issue-456.test.mjs`).
- `libraries/*.json`: character libraries the browser journeys and handoffs start from. The tests check each file against the generator that makes it (`libraryAt`, `levelThreeLibrary`, `levelFourCareerLibrary`, `rogueLibrary`, `levelTwoVex`, `libraryOf`); regenerate it from that when the library format changes.
