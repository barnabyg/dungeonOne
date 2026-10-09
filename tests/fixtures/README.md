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

| Fixture                 | Export            | Mechanic                                                                                                                                                                        |
| ----------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lone-goblin.json`      | `loneGoblin`      | A one-room fight: one Goblin Warrior, level 1, hard. Victory and defeat endings.                                                                                                |
| `goblin-band.json`      | `goblinBand`      | A group fight: a Goblin Minion and a Goblin Warrior, level 2, medium.                                                                                                           |
| `goblin-trio.json`      | `goblinTrio`      | A group fight with numbered opponents of one kind, for multi-target and ordinal targeting.                                                                                      |
| `rat-tunnels.json`      | `ratTunnels`      | Exploration: passages, examined features, a hidden potion, a Giant Rat fight that leaves the adventure going.                                                                   |
| (built from the above)  | `ratlessTunnels`  | The tunnels without the rat, as _The Quiet Tunnels_: exploring rooms with one fight, in the den.                                                                                |
| (built from the above)  | `ratRun`          | Sneaking past (#302): the tunnels as _The Rat Run_, the rat 20 bypass XP, the den an exit with no fight.                                                                        |
| (built from the above)  | `lurkingTunnels`  | Lurking monsters (#303): the tunnels as _The Lurking Tunnels_, the rat lying in wait with Stealth +4 on the required path.                                                      |
| (built from the above)  | `waryTunnels`     | Reaction rolls (#304): the Rat Run as _The Wary Tunnels_, the rat reaction-eligible with every band's options and 15 peaceful XP.                                               |
| (built from the above)  | `banditToll`      | Parley, tolls and trade (#305): the Rat Run as _The Bandit's Toll_, a reacting Bandit who parleys, takes a 5 sp toll or trades; 25 peaceful XP.                                 |
| `lintel-barrow.json`    | `lintelBarrow`    | An exit with loot behind a fight: a lintel to examine, a torc under the bier, a goblin carrying a pouch of coin.                                                                |
| `sealed-crypt.json`     | `sealedCrypt`     | Doors, a trap and talk, level 2: a stuck door, a locked door and its key (pick with thieves' tools, #309), a dart trap (thieves' tools or bare hands), a creature with a check. |
| `goblin-burrow.json`    | `goblinBurrow`    | A level-up journey, levels 2–3: tunnel guards, then a goblin boss and its hoard on the way out.                                                                                 |
| `obstacle-yard.json`    | `obstacleYard`    | Approaches (#283): a wall (Athletics or Acrobatics) and a guard (Persuasion or Intimidation), each opening a hidden way.                                                        |
| `rope-cove.json`        | `ropeCove`        | Retries and circumstances (#284): a cliff the rope gives advantage and a retry, a door retried for damage, a trap for a spike, a topic and a burrow.                            |
| `shifting-ossuary.json` | `shiftingOssuary` | Routes (#282): a skull wall's success opens a hidden passage; a rotten door's failed force closes its passage.                                                                  |
| `graded-cellar.json`    | `gradedCellar`    | Graded checks (#281): a rubble heap's bands (damage, words, a ring revealed, a discovery), a topic and a door's.                                                                |
| `toll-yard.json`        | `tollYard`        | Loot behind talk (#297): a keeper's topic opens a hidden way to a strongroom's purse; a rat cellar holds a few coins.                                                           |
| `picklock-cellar.json`  | (invalid)         | Thieves' tools (#309): the goal behind a lock only thieves' tools open, which the validator refuses; tests change it to valid variants.                                         |

`moduleFile(name)` returns a fresh copy of a fixture's JSON to change and
validate, and `fightRoomFile(id, title, opponents)` builds a one-room fight
against any opponents in the lone goblin's room (`fightRoom` validates it),
for tests of one monster's rules (riders, paralysis, Multiattack, damage
defences). `withStatBlocks(adventure, change)` copies a validated module with
`change` made to each opponent's stat block, and `withoutRiders` is the change
that strips every attack's riders, for the gate tests that compare a monster
with and without them (#232, #234). `FIXTURE_MODULES`
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

## Scripted dice

`engine-dice.mjs` holds the dice engine tests script: `dice(...pairs)`
returns queued `[sides, value]` pairs in order and fails on a die of other
sides; `uncheckedDice(...values)` returns queued values whatever the die.
Both fail when the queue runs out, record each roll in `drawn` as
`{ sides, value }` and count what is left with `remaining()`.

`morale-encounter.mjs` is the encounter-engine fight of the morale (#237) and
surrender (#238) tests: `ada`, who wins initiative and has Action Surge;
`goblin(id, extra)`, 1 HP and morale DC 8; `saves(wisdom)`, their saving
throw bonuses; `initiative(count)` and `KILL` (a hit that drops a goblin) as
dice pairs; `begin(combatants, ...rest)` starts the fight on those dice and
`attack(state, random, targetId)` is an attack by Ada the engine must accept.

## Fighter choices

`charismatic-fighter.mjs` holds `BEA`, Ada's dice with Charisma 16 (+3), and
`beaLibrary()`, a library holding only her, for the reaction-roll tests
(#304): a friendly band is out of Ada's reach.

`fighter-choices.mjs` holds `IN_ORDER`, each roll placed on the ability in
table order, and `IN_ORDER_CHOICES`, the creation screen's default choices
(`FIGHTER_DEFAULT_CHOICES`) with that placement, which the library and
session tests create Ada with.

## Seeded playthroughs (issues 156 and 269)

`playthroughs.mjs` holds the #156 fighter, `ada` (Con 14, 12 HP), and
`veteran()`, Ada at level 2 with Action Surge; `twin`, Ada with two daggers
for the light weapons' extra attack (#269); `engineAction(view)`, the
engine action each kind of projected action stands for, as the browser
server makes it from a click; and `playthroughStates()`, every state of
seeded random playthroughs of every fixture module, the gem market, the
archers' barrow (with `twin` and Wren) and the sealed crypt again with
`twin`. The bar-projection tests (#132, #156, #182, #183) share them, so a
new kind of action is mapped once; #182 checks the mapping against the
action each projection dry-ran, and that the playthroughs show every kind in
the runtime's `ACTION_KINDS` and refuse each kind the bar can show refused.

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

## Check policies (issue 285)

`modules.mjs` also builds three variants for `tests/issue-285.test.mjs`, which
are not in `FIXTURE_MODULES`. `collapsingOssuary` (_The Collapsing Ossuary_)
is the shifting ossuary with its side crypt open and an urn shelf whose
Athletics check (DC 5) closes the way back on a failure by 5 or more: no
Fighter fails it by 5, but always-fail does, so the gate rejects it as
stranded, naming the check. `fallingArch` (_The Falling Arch_) adds a cracked
arch at the gate whose Athletics check (DC 5) deals 4d6 on a failure by 5 or
more, and makes the rat a boss: it qualifies as hard on seeded checks and is
far too deadly when every check fails. `coalStore` (_The Coal Store_) is the
graded cellar with its rubble heap and ring in a room that is no exit, so a
run whose heap check fails must leave without the ring.

## Browser launch

`default-launch.mjs` runs the built browser launcher as a player would,
through `quiet-launcher.mjs`, which stops it opening a desktop browser window.
`session-layout.mjs` launches the browser (`launch`: Edge on Windows, else
Playwright's Chromium; every browser test uses it) and checks that the newest
history entry and the action buttons are on screen together (#154): `act`
runs a click and checks that, and `explore(page, action, target)` and
`fightOn` are `act` on an action's button and on a fight turn. Its
`firstFighter(seed)` is the Fighter a browser on that seed creates first,
with the page's default choices (`FIGHTER_DEFAULT_CHOICES`) and placement
(`defaultPlacement`); browser tests that search for a seed by simulating
Ada use it, so they simulate the Ada the page makes.
`assertNoSideScroll(page, message, { wideFont })` asserts the page does not
scroll sideways; with `wideFont`, after `widenFont(page)` sets every element
to Verdana, as wide as CI's Linux fallback font. `narratingDm()` is a
scripted AI DM that answers every message with the same narration.

`browser-journey.mjs` holds the steps most browser tests take before the
part they check: `openCreation`, `saveFighter` (Ada by default),
`createFighter` (both), `startAdventure` (by module id, waiting for the
first history entry) and `createAndStart` (open the page, create Ada,
start). Tests that check one of these steps closely, such as creation's
busy states, keep their own clicks.

It also holds the clicks for tests that don't check the layout:
`settled(page, run)` runs `run` and waits for a new history entry that is not
pending; `actionButton(page, action, target)` is an action's button (the
only one when `target` is left out) and `clickAction` clicks it, settled;
`fightTurn` attacks the first target offered, or ends the turn once the
action is spent, and `fight` takes turns until the fight is over. `text`
is an element's text with blank lines collapsed.

`save-files.mjs` reads what the browser server saves: `readAda(libraryPath)`,
the library's first character, and `sessionFile(directory)`, the one saved
session in the directory's `characters-adventures` folder.

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

## Seed search

`seed-search.mjs` is for tests that find a browser seed by simulating Ada's
clicks on the runtime. `attackOrEndTurn(runtime, state, random)` is one fight
click as the browser tests make it (attack the first target offered, else
end the turn), throwing if the runtime refuses it; `fightThrough` plays them
until the fight ends, with the events on the way; `recordingRandom(source,
drawn)` records each roll in the newest list in `drawn`, so a test can
group the dice by action.

## Module journeys (issue 275)

`module-journey.mjs` is for content tests that play a shipped module along a
fixed route. `journey(adventure, sheet, seed, route)` plays the route's steps
(`["move", "bothy"]`, `["examine", …]`, `["take", …]`, `["leave", …]`) and
fights each fight as the handoffs do: Second Wind or a potion at half HP or
less, else attack the first target, else end the turn. `firstJourney(…,
wanted)` searches seeds from 0 for the first journey whose end state `wanted`
accepts, passing over a seed whose route the runtime refuses partway (a foe
that fled leaves no body), so a content test pins no seed that a dice-order
change would move.
With `{ browser: true }`, the seed is the browser server's: the dice are its
first session's (`sessionSeed(seed, 1)`) and each fight is fought as
`fight` in `browser-journey.mjs` clicks it, attacking and never healing, so a
browser test can search for the seed its clicks need.
`xpOf(runtime, state)` lists the ending's XP awards.

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

## Monster loot (issue 240)

A bestiary monster's treasure type limits what it may carry, so fixtures whose
opponents carry loot for another mechanic's sake use inline copies of a
bestiary stat block, made with `inlineMonster(monsterId, opponent)` from
`bestiary.mjs`: they fight the same but have no treasure type. The lintel
barrow's goblin (its 2 gp 5 sp pouch), the fleeing and surrendering goblins
(their silver and rings) and the #198 crypt's warden (its gold ring) are
inline for that reason. The goblin burrow's guard potion lies under the guard
tunnel's bone pile, as a Goblin Warrior carries no potion.

`rolled-barrow.mjs` is the lintel barrow with its goblin as the bestiary's
Goblin Warrior, carrying only the loot `rollModuleLoot` rolled for it with
seed 240 (`ROLL_SEED`): the browser test defeats it and finds exactly that.

## Ranged weapons (issue 230)

`archery-barrow.mjs` is the lintel barrow as _The Archers' Barrow_: a bowyer
at the mouth sells the shortbow, the light crossbow and bundles of arrows and
bolts, ten minutes a trade, and a quiver of 20 arrows lies behind the lintel.
`archer(arrows, bolts)` is Wren, Ada's scores with leather, a shortbow, a
stowed mace and that many arrows and bolts; the ranged-weapon runtime, library
and browser tests play her there and against the lone goblin.

## Character library

`library.mjs` holds the harness the library and session tests share.
`withLibrary(run)` creates a library in a temporary directory holding one
fresh Ada (the test fighter's choices, the mace kit) and calls
`run(library, sheet, revision, directory)`, removing the directory afterwards.
`winBarrowSeed(module, sheet, number, before)` finds the browser seed whose
`number`th session of a lintel barrow wins the burial hall's fight, after
`before` (actions at the mouth that roll no dice), and `barrowFightStep` is
that fight's next action: attack, or end the turn.
`playSession(library, module, actions)` starts a lintel barrow for the
library's character and plays `actions`, each accepted; `WIN_THE_BURIAL_HALL`
among them moves into the hall and wins its fight, on the seed
`winBarrowSeed` finds.

## CPU budgets

`cpu-reference.mjs` holds a fixed, engine-free CPU workload. A timing budget
measured with `referenceCpuSeconds(work)` is scaled by how long that workload
takes in the same process, timed before and after `work`, against its
`REFERENCE_SECONDS` on the machine the budget was set on. CI runners differ in
speed by nearly 2× between runs of one commit, so plain CPU seconds judge the
runner rather than the code. `shipped-modules.test.mjs` uses it for the
default qualification's 150-second budget (45 for the Fighter alone until #310).

Browser and server tests that start the browser server on fixture modules
pass `qualifies: () => true`: the fixtures are engine material, and since
#310 several of them (the lone goblin, the goblin band, the lintel barrow)
are too deadly for the Rogue to pass the gate. The gate is tested in
`balance-5e.test.mjs` and on the shipped modules.
