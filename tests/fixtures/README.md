# Test fixtures

## Counter runtime

`counter-runtime.mjs` is a minimal `AdventureRuntime` with no game rules: a
counter that a d6 advances and that wins at three. The DM turn loop, OpenAI
adapter and runtime contract tests use it to exercise shared infrastructure
without depending on the 5e runtime.

## Difficulty gate fixtures (issue 135)

`gate-goblin-pair.json` and `gate-minion-yard.json` are 5e adventure modules
for `tests/balance-5e.test.mjs`, built from the SRD 5.2 goblin stat blocks.
_The Goblin Pair_ (two Goblin Warriors, level 2) is too deadly for medium and
passes as hard. _The Minion Yard_ (two Goblin Minions in turn, level 1) is
safe enough for medium, but a strong level-1 Fighter usually kills each
minion with one attack, so it fails as too easy at every difficulty.

`three-goblins.json` is _The Goblins in the Storeroom_ as it was before #135
(two numbered Goblin Minions and a Goblin Warrior, level 1). The shipped module
no longer qualifies with three goblins, so `tests/runtime-5e.test.mjs` keeps
its multi-target and ordinal targeting tests on this copy.

## Browser launch

`default-launch.mjs` runs the built browser launcher as a player would,
through `quiet-launcher.mjs`, which stops it opening a desktop browser window.
`session-layout.mjs` launches the browser and builds the fighters the 5e
journeys use to check that the newest history entry and the action buttons
are on screen together (#154).
