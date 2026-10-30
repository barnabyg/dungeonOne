# The mapping tool

```powershell
npm.cmd run map -- <module-id | path to a module or a layout sketch>
```

The command builds the project, then draws and checks one layout: a shipped
module by id (`abandoned-delve`), or a module or sketch file by path. It prints
a text grid of each floor and writes an SVG to `.scratch/maps/<id>.svg`. It
lists every layout error and warning, and exits 1 on any error (0 if there are
only warnings). For a module, it also runs the full module validator and lists
the validator's first problem that isn't a layout one.

## Reading the text grid

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

## Reading the SVG

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
