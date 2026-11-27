# Authoring a module

Read this first when you design or build an adventure module, whether you are a
person or an agent. It holds the rules that are settled, so each design doesn't
learn them again. The module format and what the validator refuses are in
[rules/modules.md](rules/modules.md), the bestiary in
[rules/bestiary.md](rules/bestiary.md); the balance gate is in
[rules/balance-gate.md](rules/balance-gate.md); the game's terms are in
[`CONTEXT.md`](../CONTEXT.md).

## Design in stages, story first

A module is designed story first, and so is a rework of a shipped one. Each
stage is a short proposal the owner approves before the next begins. Stages 1 to
4 name no cell, DC or coin.

| Stage                 | Propose                                                                                                                           | Done when                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1. Premise            | Three pitches of a paragraph each: who wants what, what happens if the character does nothing, and the one question play answers. | Each pitch can be told without naming a room, and the owner has picked one.                                           |
| 2. Cast and secret    | Three to five actors, each with what it wants, what it knows and what it will do; one secret that changes how the premise reads.  | Every actor can end for the character or against it, depending on play.                                               |
| 3. Beats and choices  | Five to seven beats; two or three choices, each with what it changes in later rooms and in the ending.                            | Two players who choose differently get summaries that read as different adventures.                                   |
| 4. Clue web           | Each revelation with its sources; every feature with its tag (see [Features and words](#features-and-words)).                     | Every revelation has three sources or more, and the best ending needs a costly act that only the clues explain.       |
| 5. Design ticket      | The map and the numbers (see [The design ticket](#the-design-ticket)).                                                            | The layout, estimator and validator pass, and the owner has made the ticket's decisions.                              |
| 6. Build and playtest | The module, in its own ticket.                                                                                                    | Its tests and [the clicker test](#the-clicker-test) pass, and the owner has played it through with a fresh character. |

The objective text is the job as the character is told it. The best ending is
left to be found (see the objective rule under
[Settled authoring rules](#settled-authoring-rules)).

### What the engine can carry

Check every promise in stages 2 to 4 against these before the owner approves it.
The detail is in [rules/flags.md](rules/flags.md),
[rules/checks.md](rules/checks.md) and
[rules/talk-and-stealth.md](rules/talk-and-stealth.md).

- **A flag is how a choice changes the world.** A flag opens or closes a
  passage, places or withdraws an encounter not yet met, offers or withdraws a
  topic or a use, and picks the ending on leaving. The engine sets one from a
  feature examined, an item taken, a room entered, a fight's outcome, a check's
  band or an item used on a feature. A topic sets none, so a bargain is struck
  by using an item on a feature.
- **A mindless opponent obeys and never answers.** A reaction, a parley or a
  toll on an Undead is refused. Give such an actor a behaviour the player can
  read and a lever that changes it, as the Delve's posts stand aside for a
  badge.
- **Giving something up.** A use may cost coin. Treasure is never used up, and
  no flag removes an item: one leaves play only with the opponent that carries
  it.
- **Every available act is a button.** Knowledge can't hide a choice, so make
  the choice cost something and let the clues say what it buys.
- **Examining is free.** There is no clock, so a feature costs the player
  nothing unless it is a risk.

## The design ticket

Stage 5 is a design ticket, which pauses for the owner's approval before any
content is written. The proposal on the ticket has:

- [ ] the approved premise, secret, cast, choices and clue web, and **what
      checking them against the engine changed**;
- [ ] every feature with its tag and what it carries, and every flag with what
      sets it and what uses it;
- [ ] the rooms, their regions and the routes through them;
- [ ] **the layout as a sketch file and its rendered map**, passing the layout
      rules (see below): paste the sketch's JSON and the console grid into the
      ticket, and attach the SVG;
- [ ] each fight with its estimator figures (`npm.cmd run estimate`), the
      mechanics used, the treasure against the budget, and the XP;
- [ ] each obstacle on the way to the main prize, with its ways past and their
      families (see [Ways past an obstacle](#ways-past-an-obstacle));
- [ ] a list of the decisions the owner must make, each with a recommendation.

Record the owner's approval and any changes on the ticket. Build the module in a
separate ticket from the approved design.

## Features and words

Every room automatically gets a first impression from its description and one visible feature, creature or item when the browser has an AI key. Write the room description as something a player can perceive on arrival. Keep secrets in discoveries, checks or dialogue topics. The engine uses revealed discoveries for return visits.

- **Every feature is a clue, a lever, a risk or a reward,** and may be two. A
  _clue_ is a source for a revelation. A _lever_ changes the world: it opens a
  way, sets a flag or gives an item another feature needs. A _risk_ costs
  something when it is tried without thought. A _reward_ is loot. Cut a feature
  that is none of these and fold its words into the room's description. Keep
  reward-only features few: they are what a player clicks through.
- **Three sources for every revelation,** in more than one region and of more
  than one kind: a feature, a creature's topic, the way an actor behaves. Put a
  source for what the best ending needs in the first rooms.
- **A clue decides what it is a clue to.** When a discovery says where
  something is, give the search it points at `noRollWhen` with that discovery:
  the character who found the clue looks and finds, with no roll, and one who
  didn't still searches by a check.
- **A risk makes a thoughtless click cost.** A feature's check is rolled the
  first time it is examined, so looking is trying: a noisy band raises the
  alarm, and a failure by 5 can hurt.
- **Words are true whenever they can be shown.** A description, a discovery or
  a reply appears in every state in which its feature or topic is offered. What
  it asserts, such as that the character holds a key, that a purse is full or
  that someone waits in the next room, must hold in all of them. Word it so
  that it does, or give it a flag: `changed` on a feature, `offeredWhile` and
  `offeredUntil` on a topic or a use. Put words about a fight's opponents in a
  room's or a passage's `presence`, which goes with the fight. The engine itself
  says when a find was taken, on this visit or an earlier one, and holds an
  opponent's description while it has not noticed the character.
- **Teach a pattern, then vary it.** Introduce a trap or secret safely, then
  repeat it with a twist, using features, checks, hidden passages and traps.
- **Loops and a second route.** Give the way to the objective more than one
  route, and a loop or secret shortcut, rather than a tree of dead ends.

## Ways past an obstacle

Breaking a door and fighting for its key both test the same thing. If they are
the only ways to the main prize, a Fighter has two and a Wizard none. The **main
prize** is the module's victory fight, or else the hoard the module is built
around, such as a strongroom or a vault.

- **Way families.** Every way past an obstacle (a shut door, a gap, a guard) is
  one of:
  - _might_: force or break, climb or lift, or win a fight for the key;
  - _skill_: pick or disarm with thieves' tools, or sneak past;
  - _mind_: an Intelligence or Wisdom check that finds a spare key or a hidden
    way, reads a mechanism or a ward, or works out a safe path;
  - _voice_: talk someone into handing over the key or opening the way.
- **Every obstacle on the way to the main prize offers a way that isn't
  might:** a mind or voice way, or one open to everyone, such as a key or a tool
  that no fight or check guards. A key on an opponent is a might way, even one
  who may surrender, since the fight comes first. A second route round the
  obstacle counts by the ways past its own obstacles: the Weirgate's grate has a
  key on a bandit, a pick and a break, but the culvert round it opens with a
  crank lying in the keeper's office.
- **Let the mind win sometimes.** Give mind checks things worth having that
  might can't get as well: a quieter way, a hidden hoard, advantage on a later
  check. Offer a mind check as two approaches, an Intelligence skill for the
  Wizard and a Wisdom skill for the Cleric. Prefer Arcana, Religion, Medicine
  and Nature, which neither a Fighter nor a Rogue can take; Investigation and
  Perception are a Rogue's too.
- **Might is loud.** Mark every band of a break or force `"noisy": true`,
  success included. A noisy band needs the module to have an alarm, so give it
  one whose effects make the noise cost something. The quiet ways then stay worth finding.
- **The best ending has a way that isn't might too.** Where it takes a fight,
  give the fight an action that mind or voice makes, as the Delve's oath
  (Religion, History or Intimidation) leaves the Castellan paralysed.
- **The gate doesn't check this.** It never talks, and its objective is the
  nearest loot, not the main prize. The design ticket lists the ways instead.

## The clicker test

The balance gate's judged runs examine every feature, take every item, use every
item a feature accepts and pay for any use they can afford. They are the
_clicker_: a player who presses every button and chooses nothing.

- **The clicker never reaches the best ending.** A module whose best ending is
  found in play has a test that no judged run ends in it, as
  `tests/abandoned-delve.test.mjs` has. Build that ending on a choice the
  clicker makes the other way: it always takes the Castellan's deal, which
  closes the relief.
- **The clicker trips every risk.** It rings the bell and takes every badge, so
  the gate's figures are the module at its loudest. Measure them at the build
  before declaring a difficulty.
- **Play it through with a fresh character.** A character who has played the
  module holds its loot and awards in the ledger, and finds neither again.

## The map

Every room sits on a cell of a square grid that you choose by hand. Nothing is
laid out automatically. The rules live in `src/map-5e.ts`. The module validator
and the mapping tool both use that code, so a layout the tool passes is one the
validator accepts.

- **Cells.** A room's `at` is `[x, y]`: x grows east, y grows south, and each
  runs from −50 to 50. One room per cell on each floor.
- **Floors.** A room's `floor` is 0 unless you set it; up is positive, and
  floors run from −9 to 9. Every floor uses the same cells, so put a stair's top
  room above or beside its foot room, and the floors line up.
- **Passages on a floor** run straight: east–west, north–south or at 45°. A
  passage can't run through a room on a cell between its ends, and two passages
  on a floor can't cross or overlap. One passage between two rooms is enough.
- **Passages between floors** are `"vertical": "stairs" | "ladder" | "shaft"`,
  and join adjacent floors only. Their ends need not share a cell or neighbour
  one, but keeping them close reads better.

These are errors. The tool also **warns** about layouts that read badly:

- **A scattered region**, one whose rooms on a floor surround another region's
  room. Keep each region together on each floor, as a block.
- **A long passage**, three cells or more. Move the rooms closer, or put a room
  on the way.
- **A passage longer than its words.** A passage of two cells or more whose
  description opens with a door, an arch, a gate, a hatch, a curtain or steps,
  or says "short", "a few steps" or "next door". Describe the way between, or
  move the rooms together.

A warning doesn't fail the tool. Fix it, or give a reason in the proposal.

### Laying out regions and routes

- Give each region its own block of cells, or its own floor. A second floor is
  the clearest region boundary.
- Prefer one-cell passages. Use a two-cell passage only where the description
  earns the distance (a bridge, a wall-walk, a long tunnel).
- Draw the main route as a readable line from the start room. Branch side rooms
  off it, and don't wind it back across itself.
- A loop (two routes into a room) reads best as a ring of cells, not as a long
  passage back to the start.
- Leave a cell free beside a room that might later grow a neighbour.

## The mapping tool and layout sketches

Propose every layout as a sketch file and check it with
`npm.cmd run map -- <module-id | path>`. [The mapping tool](mapping-tool.md)
explains its output and the sketch format.

## Settled authoring rules

- **SRD 5.2 only.** Use only SRD 5.2 names, rules and stat blocks
  ([ADR 0005](adr/0005-start-afresh-on-5e-and-suspend-compatibility.md)). Name
  opponents by bestiary id. Content is original, and the game is single-player:
  design every module for one character.
- **The career and its capstone.** Four long modules, one per level band (1, 2, 3–4 and
  4–5), carry a character from level 1 to level 5. Each has 10–20 rooms and two
  regions, each region with a rest site and an exit. The optional fifth module,
  Last Shift at Cinder Mint, starts at level 5 and has 28 rooms. Its two
  narrative victories award no additional ending XP. The Well of the Hollow
  Moon is a second optional level-5 module, with 32 rooms on four floors and
  a victory for carrying its silver float out. The validator allows at
  most 50 rooms, 100 passages and 30 encounters.
- **The XP path.** The main endings' awards (escape with loot, or victory where
  the module has one), taken in level order, add up to SRD 5.2's thresholds for
  levels 2 to 5 (`LEVEL_XP`), so each award carries the whole step to the next
  module's level on its own, and fight XP is slack. A module whose story ends
  two ways may pay two endings, a victory and the escape with loot, each the
  same full step: the Delve's 600 XP for paying the dead, or for carrying the
  garrison's pay out. They share one award, so a character earns it once,
  whichever it reaches. Other endings pay nothing. A career plays a module
  only once it reaches the module's minimum level, so a career that falls
  short of a level stalls.
- **An objective that leaves the best ending to be found.** Mark the ending
  the objective text names with `objective: true`. The Leave warning compares
  only against it, so a victory found in play is never announced. An escape
  with loot that should mean one prize, not any coin, names it with
  `needsItem`: the Delve's needs the vault's chest, so the easy road still
  leads to the Castellan and his deal.
- **No loot in the start or exit room.** The gate's cautious run takes it and
  leaves, which flatters the module. Put the first loot behind a fight.
- **Treasure.** Low levels are mostly copper and silver; from level 3, give a
  mixed hoard with at least two kinds of gem or art object. The budget, the share
  of it to hold, the gem and art limits and tiers are in
  [the treasure rules](rules/treasure.md#treasure), and magic items in
  [magic items](rules/treasure.md#magic-items).
- **Difficulty.** Declare the strictest difficulty whose survival threshold
  every class clears by at least 3 points under the balance gate, its
  survival credited the gate's 2-point allowance (a caster's survival below
  level 3 sets nothing). `shipped-modules.test.mjs` checks it.
- **Keys.** If the only key to the way on can be lost (its carrier flees with
  it), the gate counts the character as stranded and fails the module. Give such
  a key a second way on.
- **Long modules** have at least two regions, each with a rest site.
- **Backdrops.** Give each region a `backdrop`: the faint drawing of the setting shown
  below the room cards when space permits. A room that is a different kind of
  place, such as a forest camp outside a lodge, names its own. The backdrops
  are `cellar` (a vault of barrels and shelves), `crypt` (arches, skulls and a
  tomb), `culvert` (a brick tunnel over water), `farmyard` (a barn, a well and a
  cart), `forest` (pines and a camp fire at night), `hall` (a hearth, antlers
  and a long table), `ruin` (broken walls, a tower and a standing stone) and
  `weir` (a toll house, a lock and a footbridge), drawn in
  `src/backdrops-5e.ts`. They are only for the page: the AI DM never sees them.
- **After a content change,** run `npm.cmd test -- --modules <id>`, and
  `npm.cmd run gate:verdicts` if the recorded verdicts test fails.

## Mechanic coverage

The four modules are the agreed set for exercising the engine's mechanics. A
module change that drops a mechanic only one or two modules carry should move
it to another module, or keep a fixture for it in `tests/fixtures/`.

- **One module:** reaction trade (Weirgate); lurking (Weirgate); sneaking past
  with bypass XP and sneaking again (Weirgate); surrender and `gives` (Cider
  House); a wandering encounter only on rests (Delve); +1 gear (Lodge); spell
  scrolls (Delve); wands (Weirgate); retries (Lodge); Remarkable Athlete's
  lever (Lodge); a victory ending on a fight (Weirgate); a victory on
  departure (Delve); a use that costs coin, of an item an opponent carries
  (Delve); a fight action that gives a condition lasting more than a turn
  (Delve).
- **Two modules:** reaction rolls, parley and tolls (Weirgate, Delve); a key
  carried by an opponent (Cider House, Weirgate; no fixture); an encounter
  that withdraws on a flag (Delve, Lodge); a topic offered while one flag is
  set and until another is (Delve, Weirgate); region wandering tables
  (Weirgate, Lodge); talk-only passages (Weirgate, Lodge); alarms (Delve,
  Weirgate); merchant trade (Delve, Lodge).
- **Three or four:** undead to turn (Delve, Weirgate, Lodge), morale and fled carriers, monster loot, rest sites,
  thieves' tools, stuck and locked doors, graded checks, several approaches,
  circumstances, hidden passages with open and close effects, flags, items used
  on features, fight actions, and routes with region sweeps.
