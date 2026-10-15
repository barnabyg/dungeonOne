# Authoring a module

Read this first when you design or build an adventure module, whether you are a
person or an agent. It holds the rules that are settled, so each design doesn't
learn them again. The full list of what the module validator refuses is in
[the rules document](character-rules.md#adventure-modules); the game's terms are
in [`CONTEXT.md`](../CONTEXT.md).

## The design ticket

A module starts as a design ticket, which pauses for the owner's approval before
any content is written. The proposal on the ticket has:

- [ ] the rooms, their regions and the routes through them;
- [ ] **the layout as a sketch file and its rendered map**, passing the layout
      rules (see below): paste the sketch's JSON and the console grid into the
      ticket, and attach the SVG;
- [ ] each fight with its estimator figures (`npm.cmd run estimate`), the
      mechanics used, the treasure against the budget, and the XP;
- [ ] a list of the decisions the owner must make.

Record the owner's approval and any changes on the ticket. Build the module in a
separate ticket from the approved sketch.

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
  or says "short", "a few steps", "next door" or "beside". Describe the way
  between, or move the rooms together.

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

The command builds the project, then draws and checks one layout:

- a shipped module by id, such as `npm.cmd run map -- abandoned-delve`;
- a module file by path, such as `.\adventures\eval\memory-tunnels.json`;
- a layout sketch by path, such as `.\.scratch\thornwood-sketch.json`.

It prints a text grid of each floor and writes an SVG to
`.scratch/maps/<id>.svg`. It lists every layout error and warning, and exits 1
on any error (0 if there are only warnings). For a module, the tool also runs
the full module validator and lists the validator's first problem that isn't a
layout one.

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
- **Rooms** lists each letter with its id, name, cell, floor, region, and
  whether it is the start or an exit.
- **Marked passages** lists the passages with something to note: a door (stuck
  or locked), a hidden passage, a trap, a flag that opens or closes it, and
  stairs, ladders and shafts with the floors they join.
- A crooked passage (an error) isn't drawn on the grid.

### Reading the SVG

The SVG shows each floor from the top down, on the same columns. Rooms are boxes
labelled by name and id, and shaded by region. The start room has a green
border, and START and EXIT tags mark the start and exit rooms. The marks are:

- **Grey line**: a passage.
- **Dashed purple line**: a hidden passage.
- **Dotted blue line**: a passage a flag opens or closes.
- **Square**: a door. A hollow square is stuck, and a filled one is locked.
- **Red triangle**: a trap.
- **▲ / ▼ in a room**: its stairs, ladders and shafts. The legend lists each
  one, with the room it leads to and its marks.

## Layout sketches

A sketch is a module's map before its content exists. It is a strict subset of
a module: each field means the same as in a module, so building the module from
the sketch is a matter of filling in the rest. Its kind is
`dungeon-one-5e-map-sketch`, in format version 1.

```json
{
  "kind": "dungeon-one-5e-map-sketch",
  "formatVersion": 1,
  "id": "fox-barrow",
  "title": "The Fox Barrow",
  "startRoomId": "mound-gate",
  "regions": [
    { "id": "mound", "name": "The Mound" },
    { "id": "vault", "name": "The Vault" }
  ],
  "rooms": [
    {
      "id": "mound-gate",
      "name": "Mound Gate",
      "at": [0, 0],
      "region": "mound",
      "exit": true
    },
    { "id": "fox-hall", "name": "Fox Hall", "at": [1, 0], "region": "mound" },
    {
      "id": "stair-foot",
      "name": "Stair Foot",
      "at": [1, 0],
      "floor": -1,
      "region": "vault"
    }
  ],
  "passages": [
    {
      "id": "gate-to-hall",
      "between": ["mound-gate", "fox-hall"],
      "description": "A low arch.",
      "door": { "state": "stuck" }
    },
    {
      "id": "hall-stairs",
      "between": ["fox-hall", "stair-foot"],
      "vertical": "stairs"
    }
  ]
}
```

- **Top level:** `kind`, `formatVersion`, `id`, `title`, `startRoomId`,
  `rooms`, `passages`, and optionally `regions` (each `id` and `name`).
- **A room:** `id`, `name` and `at`, and optionally `floor`, `region` and
  `exit`.
- **A passage:** `id` and `between`, and optionally `description`, `vertical`,
  `hidden`, `openWhen`, `closeWhen`, `door` (only its `state`, `stuck` or
  `locked`) and `trap` (`{}`, which the module fills in).

Anything else is refused, and so is a reference to a room or region that isn't
there. The tool also refuses what the module validator would refuse of these
fields: more than 10 regions, a region with no room, some rooms with a region
and some without, a hidden passage with `openWhen`, and a passage that opens and
closes on one flag. Keep sketches in `.scratch/` while you work, which git ignores, and
paste them into the design ticket. `tests/fixtures/fox-barrow-sketch.json` is a
complete example.

## Settled authoring rules

- **SRD 5.2 only.** Use only SRD 5.2 names, rules and stat blocks
  ([ADR 0005](adr/0005-start-afresh-on-5e-and-suspend-compatibility.md)). Name
  opponents by bestiary id. Content is original, and the game is single-player:
  design every module for one character.
- **Size.** A module in the four-module set has 10–20 rooms. The validator
  allows at most 50 rooms, 100 passages and 30 encounters.
- **No loot in the start or exit room.** The gate's cautious run takes it and
  leaves, which flatters the module. Put the first loot behind a fight.
- **Treasure.** The budget is 150 gp × the module's maximum recommended level,
  twice that for a long module. A designed module holds 75–100% of it, as a
  mixed hoard.
- **Difficulty.** Declare the strictest difficulty that every class passes with
  at least 3 points of slack under the balance gate.
- **Keys.** If the only key to the way on can be lost (its carrier flees with
  it), the gate counts the character as stranded and fails the module. Give such
  a key a second way on.
- **Long modules** have at least two regions, each with a rest site.
- **After a content change,** run `npm.cmd test -- --modules <id>`, and
  `npm.cmd run gate:verdicts` if the recorded verdicts test fails.
