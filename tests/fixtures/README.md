# Test fixtures

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

`three-goblins.json` is _The Goblins in the Storeroom_ as it was before #135
(two numbered Goblin Minions and a Goblin Warrior, level 1). The shipped module
no longer qualifies with three goblins, so `tests/runtime-5e.test.mjs` keeps
its multi-target and ordinal targeting tests on this copy.

`smugglers-with-rat.json` is _The Smugglers' Cellar_ as it was before #207,
with its Giant Rat fight. The shipped module lost the rat so that it still
qualifies with the leather starting kits; the exploration, action-bar and
balance tests keep their fight-that-leaves-the-adventure-going cases on this
copy.

## Browser launch

`default-launch.mjs` runs the built browser launcher as a player would,
through `quiet-launcher.mjs`, which stops it opening a desktop browser window.
`session-layout.mjs` launches the browser and builds the fighters the 5e
journeys use to check that the newest history entry and the action buttons
are on screen together (#154).

## Bestiary (issue 231)

`bestiary.mjs` loads the built-in bestiary and binds the adventure validator to
it as `validateModule`, for tests that validate a shipped module's JSON, or a
changed copy of it, directly. The other module fixtures author their stat
blocks inline, so they also cover one-off inline opponents.

## Encounter estimate (issue 236)

`estimate-wolf-pair.json` is _The Wolf Pair_: one room whose fight is two
bestiary Wolves, renamed, for levels 2–3. `tests/estimate-5e.test.mjs` checks
that `npm run estimate -- --levels 2-3 wolf:2` gives the same numbers as the
gate and the harness measure on it.

## Fleeing goblins (issue 237)

`fleeing-goblins.mjs` is _The Robbers' Barrow_ with three numbered Goblin
Minions in the burial hall, each carrying its own pouch of coin. `fleeingSeed()`
finds the first browser seed on which Ada, attacking the first goblin offered,
wins the fight with one goblin fled; the morale runtime and browser tests play
it to check that the fled goblin leaves no body or coin and gives half its XP.

## Surrendering goblins (issue 238)

`surrendering-goblins.mjs` is _The Robbers' Barrow_ with three numbered Goblin
Minions in the burial hall that surrender instead of fleeing, each carrying a
stolen ring. Each goblin's surrender has a Mercy topic that gives its ring, a
topic that only tells, and 10 XP for sparing it. `surrenderSeed()` finds the
first browser seed on which Ada, attacking the first goblin offered, wins the
fight with a goblin surrendered; the surrender runtime and browser tests talk
to it, take its ring and escape.
