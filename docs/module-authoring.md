# Authoring a module

Read this first when you design or build an adventure module, whether you are a
person or an agent. It holds the rules that are settled, so each design doesn't
learn them again. The module format, what the validator refuses and the
bestiary are in [rules/modules.md](rules/modules.md); the balance gate is in
[rules/balance.md](rules/balance.md); the game's terms are in
[`CONTEXT.md`](../CONTEXT.md).

## The design ticket

A module starts as a design ticket, which pauses for the owner's approval before
any content is written. The proposal on the ticket has:

- [ ] the rooms, their regions and the routes through them;
- [ ] **the layout as a sketch file and its rendered map**, passing the layout
      rules (see below): paste the sketch's JSON and the console grid into the
      ticket, and attach the SVG;
- [ ] each fight with its estimator figures (`npm.cmd run estimate`), the
      mechanics used, the treasure against the budget, and the XP;
- [ ] each obstacle on the way to the main prize, with its ways past and their
      families (see [Ways past an obstacle](#ways-past-an-obstacle));
- [ ] a list of the decisions the owner must make.

Record the owner's approval and any changes on the ticket. Build the module in a
separate ticket from the approved sketch.

## Writing good rooms

- **2–4 finds per room.** Give a room two to four things to search or examine
  (hidden loot, a clue, a hazard) and a sensory line before adding rooms or
  fights.
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
- **The gate doesn't check this.** It never talks, and its objective is the
  nearest loot, not the main prize. The design ticket lists the ways instead.

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

## The mapping tool

```powershell
npm.cmd run map -- <module-id | path to a module or a layout sketch>
```

The command builds the project, then draws and checks one layout: a shipped
module by id (`abandoned-delve`), or a module or sketch file by path. It prints
a text grid of each floor and writes an SVG to `.scratch/maps/<id>.svg`. It
lists every layout error and warning, and exits 1 on any error (0 if there are
only warnings). For a module, it also runs the full module validator and lists
the validator's first problem that isn't a layout one.

### Reading the text grid

```text
Floor 0
      0   1   2   3
  0  [A]-[B]-----[D]
          |
  1      [C]
```

- Each room is a letter in brackets on its cell. The x values head the columns
  and the y values start the rows. Every floor uses the same columns, but shows
  only its own rows.
- `-`, `|`, `\` and `/` are passages on the floor. A run across an empty cell
  draws through it.
- **Rooms** lists each letter with its id, name, cell, floor, region, backdrop
  (in a module that names any), and whether it is the start or an exit.
- **Marked passages** lists the passages with something to note: a door, a
  hidden passage, a trap, a flag that opens or closes it, and the floors a
  vertical passage joins.
- A crooked passage (an error) isn't drawn on the grid.

### Reading the SVG

The SVG shows each floor from the top down, shading rooms by region (its legend
names each region's backdrop) and tagging the start and exits. Its legend
explains the marks: hidden and flag-controlled passages are dashed or dotted,
doors are squares (filled when locked), traps are red triangles, and ▲ / ▼ mark
a room's stairs, ladders and shafts.

## Layout sketches

A sketch is a module's map before its content exists: a strict subset of a
module, each field meaning the same, so the module is built by filling in the
rest. `tests/fixtures/fox-barrow-sketch.json` is a complete example.

- **Top level:** `kind` (`dungeon-one-5e-map-sketch`), `formatVersion`, `id`,
  `title`, `startRoomId`, `rooms`, `passages`, and optionally `regions` (each
  `id` and `name`).
- **A room:** `id`, `name` and `at`, and optionally `floor`, `region` and
  `exit`.
- **A passage:** `id` and `between`, and optionally `description`, `vertical`,
  `hidden`, `openWhen`, `closeWhen`, `door` (only its `state`, `stuck` or
  `locked`) and `trap` (`{}`, which the module fills in).

Anything else is refused, and so is a reference to a room or region that isn't
there, and what the module validator would refuse of these fields. Keep
sketches in `.scratch/` while you work, which git ignores, and paste them into
the design ticket.

## Settled authoring rules

- **SRD 5.2 only.** Use only SRD 5.2 names, rules and stat blocks
  ([ADR 0005](adr/0005-start-afresh-on-5e-and-suspend-compatibility.md)). Name
  opponents by bestiary id. Content is original, and the game is single-player:
  design every module for one character.
- **The four-module set.** Four long modules, one per level band (1, 2, 3–4 and
  4–5), carry a character from level 1 to level 5. Each has 10–20 rooms and two
  regions, each region with a rest site and an exit. The validator allows at
  most 50 rooms, 100 passages and 30 encounters.
- **The XP path.** The main endings' awards (escape with loot, or victory where
  the module has one), taken in level order, add up to SRD 5.2's thresholds for
  levels 2 to 5 (`LEVEL_XP`), so each award carries the whole step to the next
  module's level on its own, and fight XP is slack. Other endings pay nothing. A
  career plays a module only once it reaches the module's minimum level, so a
  career that falls short of a level stalls.
- **No loot in the start or exit room.** The gate's cautious run takes it and
  leaves, which flatters the module. Put the first loot behind a fight.
- **Treasure.** The budget is 150 gp × the module's maximum recommended level,
  twice that for a long module (`LONG_MODULE_BUDGET_FACTOR`). A designed module
  holds 75–100% of it, as a mixed hoard with at least two kinds of gem or art
  object. From maximum level 3 (`MAGIC_ITEM_LIMITS`), one magic item any class
  may use and one caster item in the caster slot, each from its own minimum
  level (`MAGIC_ITEM_MIN_LEVEL`); a 1st-level scroll is common and counts
  inside the budget.
- **Difficulty.** Declare the strictest difficulty whose survival threshold
  every class clears by at least 3 points under the balance gate (a caster's
  survival below level 3 sets nothing). `shipped-modules.test.mjs` checks it.
- **Keys.** If the only key to the way on can be lost (its carrier flees with
  it), the gate counts the character as stranded and fails the module. Give such
  a key a second way on.
- **Long modules** have at least two regions, each with a rest site.
- **Backdrops.** Give each region a `backdrop`: the faint drawing behind the
  room panel of the kind of place it is. A room that is a different kind of
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

- **One module:** reaction rolls, parley, tolls and
  reaction trade (Weirgate); lurking (Weirgate); sneaking past with bypass XP
  and sneaking again (Weirgate); surrender and `gives` (Cider House); a
  wandering encounter only on rests (Delve); +1 gear (Lodge); spell scrolls
  (Delve); wands (Weirgate); retries (Lodge); Remarkable Athlete's lever
  (Lodge); a victory ending on a fight (Weirgate).
- **Two modules:** a key carried by an opponent (Cider House, Weirgate; no
  fixture); region wandering tables (Weirgate, Lodge); talk-only passages
  (Weirgate, Lodge); alarms (Delve, Weirgate); undead to turn (Delve,
  Weirgate); merchant trade (Delve, Lodge).
- **Three or four:** morale and fled carriers, monster loot, rest sites,
  thieves' tools, stuck and locked doors, graded checks, several approaches,
  circumstances, hidden passages with open and close effects, flags, items used
  on features, fight actions, and routes with region sweeps.
