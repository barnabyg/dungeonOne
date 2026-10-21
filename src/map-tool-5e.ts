/**
 * The mapping tool's model and drawings (#456). The tool reads either a
 * finished adventure module or a design-stage layout sketch into a
 * `MapLayout`, checks it with the rules in `map-5e.ts` (shared with the
 * module validator), and draws it as a plain-text grid and as an SVG.
 *
 * A layout sketch is a strict subset of a module: a room has only `id`,
 * `name`, `at`, `floor`, `region` and `exit`; a passage only `id`,
 * `between`, `description`, `vertical`, `hidden`, `openWhen`, `closeWhen`, a
 * `door` with only its `state`, and an empty `trap`. Each means what it
 * means in a module, so building the module from a sketch is filling in the
 * rest.
 *
 * A module's backdrops (#517) are drawn too: each room's in the room list,
 * and each region's in the SVG's legend. A sketch has none.
 */

import { type Backdrop, readBackdrop } from "./backdrops-5e.js";
import {
  FIFTH_ADVENTURE_FORMAT,
  FIFTH_ADVENTURE_KIND,
  MAX_REGIONS,
} from "./adventure-5e.js";
import {
  fail,
  id,
  isOneOf,
  isRecord,
  knownKeys,
  list,
  text,
  unique,
} from "./json-shape.js";
import {
  cellText,
  type MapPassage,
  type MapRoom,
  readCell,
  readFloor,
  straightRun,
  VERTICAL_KINDS,
  type VerticalKind,
} from "./map-5e.js";

const MAP_SKETCH_KIND = "dungeon-one-5e-map-sketch";
const MAP_SKETCH_FORMAT = 1;
const DOOR_STATES = ["stuck", "locked"] as const;

export type LayoutRoom = MapRoom &
  Readonly<{
    name: string;
    exit?: true;
    /** The room's backdrop (#517), its own or its region's. */
    backdrop?: Backdrop;
  }>;

export type LayoutPassage = MapPassage &
  Readonly<{
    door?: (typeof DOOR_STATES)[number];
    hidden?: true;
    trap?: true;
    openWhen?: string;
    closeWhen?: string;
  }>;

/** A module's or a sketch's map: what the tool checks and draws. */
export type MapLayout = Readonly<{
  source: "module" | "sketch";
  id: string;
  title: string;
  startRoomId: string;
  regions: readonly Readonly<{
    id: string;
    name: string;
    backdrop?: Backdrop;
  }>[];
  rooms: readonly LayoutRoom[];
  passages: readonly LayoutPassage[];
}>;

const SKETCH_ROOM_KEYS = ["floor", "region", "exit"];
const SKETCH_PASSAGE_KEYS = [
  "description",
  "vertical",
  "door",
  "trap",
  "hidden",
  "openWhen",
  "closeWhen",
];

function readRoom(raw: Record<string, unknown>, where: string): LayoutRoom {
  const roomId = id(raw.id, `${where} id`);
  if (raw.exit !== undefined && raw.exit !== true) {
    fail(`${where} exit must be true, or left out.`);
  }
  return {
    id: roomId,
    name: text(raw.name, `${where} name`, 80),
    at: readCell(raw.at, `${where} (${roomId}) at`),
    floor: readFloor(raw.floor, `${where} (${roomId}) floor`),
    ...(raw.region === undefined
      ? {}
      : { region: id(raw.region, `${where} region`) }),
    ...(raw.exit === true ? { exit: true as const } : {}),
    ...readBackdrop(raw.backdrop, `${where} (${roomId})`),
  };
}

function readPassage(
  raw: Record<string, unknown>,
  where: string,
  sketch: boolean,
): LayoutPassage {
  if (!Array.isArray(raw.between) || raw.between.length !== 2) {
    fail(`${where} between must name two rooms.`);
  }
  const [from, to] = raw.between as unknown[];
  if (raw.vertical !== undefined && !isOneOf(VERTICAL_KINDS, raw.vertical)) {
    fail(`${where} vertical must be ${VERTICAL_KINDS.join(", ")}.`);
  }
  if (raw.hidden !== undefined && raw.hidden !== true) {
    fail(`${where} hidden must be true, or left out.`);
  }
  // The module validator's own refusals, so a sketch builds into a module.
  if (sketch && raw.hidden === true && raw.openWhen !== undefined) {
    fail(
      `${where} is hidden and has openWhen: a band opens a hidden passage, a flag one already there to see.`,
    );
  }
  if (sketch && raw.openWhen !== undefined && raw.openWhen === raw.closeWhen) {
    fail(`${where} opens and closes on the same flag.`);
  }
  let door: LayoutPassage["door"];
  if (raw.door !== undefined) {
    const state = isRecord(raw.door) ? raw.door.state : undefined;
    if (
      !isOneOf(DOOR_STATES, state) ||
      (sketch && Object.keys(raw.door as object).length !== 1)
    ) {
      fail(
        `${where} door must have a state, ${DOOR_STATES.join(" or ")}${sketch ? ", and nothing else in a sketch" : ""}.`,
      );
    }
    door = state;
  }
  if (
    raw.trap !== undefined &&
    (!isRecord(raw.trap) || (sketch && Object.keys(raw.trap).length > 0))
  ) {
    fail(`${where} trap must be {} in a sketch: the module fills it in.`);
  }
  return {
    id: id(raw.id, `${where} id`),
    between: [id(from, `${where} between`), id(to, `${where} between`)],
    ...(raw.description === undefined
      ? {}
      : { description: text(raw.description, `${where} description`, 200) }),
    ...(raw.vertical === undefined
      ? {}
      : { vertical: raw.vertical as VerticalKind }),
    ...(door === undefined ? {} : { door }),
    ...(raw.hidden === true ? { hidden: true as const } : {}),
    ...(raw.trap === undefined ? {} : { trap: true as const }),
    ...(raw.openWhen === undefined
      ? {}
      : { openWhen: id(raw.openWhen, `${where} openWhen`) }),
    ...(raw.closeWhen === undefined
      ? {}
      : { closeWhen: id(raw.closeWhen, `${where} closeWhen`) }),
  };
}

/**
 * The map of a module or a layout sketch, decoded from JSON. A sketch is
 * read strictly; a module only for its map, which leaves the rest of it to
 * the module validator. Fails with a `ShapeError` if the map can't be read
 * or names a room or region that isn't there; the layout rules are left to
 * `layoutErrors`.
 */
export function readMapLayout(value: unknown): MapLayout {
  if (!isRecord(value)) {
    fail("the file must hold a JSON object.");
  }
  const sketch = value.kind === MAP_SKETCH_KIND;
  if (sketch) {
    knownKeys(
      value,
      [
        "kind",
        "formatVersion",
        "id",
        "title",
        "startRoomId",
        "rooms",
        "passages",
      ],
      ["regions"],
      "the sketch",
    );
    if (value.formatVersion !== MAP_SKETCH_FORMAT) {
      fail(
        `it is a layout sketch in format version ${String(value.formatVersion)}, not ${MAP_SKETCH_FORMAT}. Move it aside; the file has not been changed.`,
      );
    }
  } else if (value.kind === FIFTH_ADVENTURE_KIND) {
    if (value.formatVersion !== FIFTH_ADVENTURE_FORMAT) {
      fail(
        `it is a 5e adventure module in format version ${String(value.formatVersion)}, not ${FIFTH_ADVENTURE_FORMAT}. Move it aside; the file has not been changed.`,
      );
    }
  } else {
    fail(
      `kind must be ${MAP_SKETCH_KIND} (a layout sketch) or ${FIFTH_ADVENTURE_KIND} (a module).`,
    );
  }
  const record = (entry: unknown, where: string) => {
    if (!isRecord(entry)) {
      fail(`${where} must be an object.`);
    }
    return entry;
  };
  const regions = (
    value.regions === undefined
      ? []
      : list(value.regions, "regions", MAX_REGIONS)
  ).map((entry, index) => {
    const where = `region ${index + 1}`;
    const region = sketch
      ? knownKeys(entry, ["id", "name"], [], where)
      : record(entry, where);
    const regionId = id(region.id, `${where} id`);
    return {
      id: regionId,
      name: text(region.name, `${where} name`, 60),
      ...readBackdrop(region.backdrop, `region ${regionId}`),
    };
  });
  const rooms = list(value.rooms, "rooms", 50).map((entry, index) => {
    const where = `room ${index + 1}`;
    return readRoom(
      sketch
        ? knownKeys(entry, ["id", "name", "at"], SKETCH_ROOM_KEYS, where)
        : record(entry, where),
      where,
    );
  });
  const passages = list(value.passages, "passages", 100, 0).map(
    (entry, index) => {
      const where = `passage ${index + 1}`;
      return readPassage(
        sketch
          ? knownKeys(entry, ["id", "between"], SKETCH_PASSAGE_KEYS, where)
          : record(entry, where),
        where,
        sketch,
      );
    },
  );
  const regionIds = unique(regions, "region");
  const roomIds = unique(rooms, "room");
  unique(passages, "passage");
  for (const room of rooms) {
    if (room.region !== undefined && !regionIds.has(room.region)) {
      fail(`room ${room.id} names unknown region ${room.region}.`);
    }
  }
  // As in a module: every room has a region, or none does, and each region
  // has a room.
  if (sketch && regions.length > 0) {
    const index = rooms.findIndex(({ region }) => region === undefined);
    if (index !== -1) {
      fail(
        `room ${index + 1} (${rooms[index]!.id}) has no region, but other rooms have one: give every room a region, or none.`,
      );
    }
    for (const { id: regionId } of regions) {
      if (!rooms.some(({ region }) => region === regionId)) {
        fail(`region ${regionId} has no room: give it one, or leave it out.`);
      }
    }
  }
  for (const passage of passages) {
    for (const end of passage.between) {
      if (!roomIds.has(end)) {
        fail(`passage ${passage.id} names unknown room ${end}.`);
      }
    }
  }
  const startRoomId = id(value.startRoomId, "startRoomId");
  if (!roomIds.has(startRoomId)) {
    fail(`startRoomId names unknown room ${startRoomId}.`);
  }
  // A room without a backdrop of its own has its region's.
  const backdrops = new Map(
    regions.map(({ id: key, backdrop }) => [key, backdrop]),
  );
  return {
    source: sketch ? "sketch" : "module",
    id: id(value.id, "id"),
    title: text(value.title, "title", 80),
    startRoomId,
    regions,
    rooms: rooms.map((room) => {
      const backdrop =
        room.backdrop ??
        (room.region === undefined ? undefined : backdrops.get(room.region));
      return backdrop === undefined ? room : { ...room, backdrop };
    }),
    passages,
  };
}

/** The rooms' grid labels: A–Z, then a–z. */
const label = (index: number) =>
  String.fromCharCode(index < 26 ? 65 + index : 71 + index);

/** The floors with rooms, highest first. */
const floorsOf = (layout: MapLayout) =>
  [...new Set(layout.rooms.map(({ floor }) => floor))].sort((a, b) => b - a);

/** The rows a floor's rooms span, from its lowest y to its highest. */
function floorRows(layout: MapLayout, floor: number) {
  const ys = layout.rooms
    .filter((room) => room.floor === floor)
    .map(({ at }) => at[1]);
  return { minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** A passage's two rooms, from the layout's rooms by id. */
function passageEnds(layout: MapLayout) {
  const byId = new Map(layout.rooms.map((room) => [room.id, room]));
  return (passage: LayoutPassage) =>
    passage.between.map((roomId) => byId.get(roomId)!) as [
      LayoutRoom,
      LayoutRoom,
    ];
}

/** The columns every floor's rooms span, so the floors line up. */
function columns(layout: MapLayout) {
  const xs = layout.rooms.map(({ at }) => at[0]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs) };
}

/** A passage between floors, as the text lists it. */
const verticalText = (
  passage: LayoutPassage,
  from: LayoutRoom,
  to: LayoutRoom,
) =>
  `${passage.vertical!}, ${to.floor > from.floor ? "up" : "down"} from floor ${from.floor} to floor ${to.floor}`;

/** A passage's marks but its floors: a door, hidden, a trap and flags. */
function passageMarks(passage: LayoutPassage) {
  return [
    ...(passage.door === undefined ? [] : [`${passage.door} door`]),
    ...(passage.hidden ? ["hidden"] : []),
    ...(passage.trap ? ["trap"] : []),
    ...(passage.openWhen === undefined
      ? []
      : [`opens on flag ${passage.openWhen}`]),
    ...(passage.closeWhen === undefined
      ? []
      : [`closes on flag ${passage.closeWhen}`]),
  ];
}

/** Rows of cells as columns padded to their widest, two spaces apart. */
const table = (rows: readonly (readonly string[])[]) => {
  const widths = rows[0]!.map((_, column) =>
    Math.max(...rows.map((row) => row[column]!.length)),
  );
  return rows.map((row) =>
    `  ${row.map((cell, column) => cell.padEnd(widths[column]!)).join("  ")}`.trimEnd(),
  );
};

/**
 * The layout as plain text: a heading, a grid of each floor (rooms as
 * lettered boxes on their cells, passages drawn between them), the rooms by
 * letter, and the passages with marks (a door, hidden, a trap, a flag or
 * between floors).
 */
export function drawMapText(layout: MapLayout): string {
  const { minX, maxX } = columns(layout);
  const labels = new Map(
    layout.rooms.map((room, index) => [room.id, label(index)]),
  );
  const ends = passageEnds(layout);
  // A cell is four characters wide and two lines tall: a room's box, then
  // the gap a passage crosses to the next cell. Every floor has the same
  // columns, but only its own rows.
  const column = (x: number) => 6 + 4 * (x - minX);
  const lines = [
    `${layout.title} (${layout.id}): a ${layout.source} of ${layout.rooms.length} rooms and ${layout.passages.length} passages.`,
  ];
  for (const floor of floorsOf(layout)) {
    const { minY, maxY } = floorRows(layout, floor);
    const line = (y: number) => 2 * (y - minY);
    const grid = Array.from({ length: line(maxY) + 1 }, (_, row) => [
      ...(row % 2 === 0 ? `${String(row / 2 + minY).padStart(3)}  ` : "     "),
      ..." ".repeat(column(maxX) - 3),
    ]);
    const put = (row: number, col: number, char: string) => {
      grid[row]![col] = char;
    };
    for (const passage of layout.passages) {
      const [from, to] = ends(passage);
      if (
        passage.vertical !== undefined ||
        from.floor !== floor ||
        to.floor !== floor
      ) {
        continue;
      }
      const run = straightRun(from.at, to.at);
      if (run === undefined) {
        continue;
      }
      const { dx, dy, steps } = run;
      const char = dy === 0 ? "-" : dx === 0 ? "|" : dx === dy ? "\\" : "/";
      // Each half step lands on a gap or on an empty cell's middle; a
      // horizontal run also fills the cells' sides.
      for (let half = 1; half < 2 * steps; half += 1) {
        const row = line(from.at[1]) + half * dy;
        const col = column(from.at[0]) + 2 * half * dx;
        put(row, col, char);
        if (dy === 0) {
          put(row, col - 1, char);
          put(row, col + 1, char);
        }
      }
    }
    for (const room of layout.rooms) {
      if (room.floor === floor) {
        const row = line(room.at[1]);
        const col = column(room.at[0]);
        put(row, col - 1, "[");
        put(row, col, labels.get(room.id)!);
        put(row, col + 1, "]");
      }
    }
    const header = Array.from({ length: maxX - minX + 1 }, (_, index) =>
      String(index + minX)
        .padStart(2)
        .padEnd(4),
    ).join("");
    lines.push(
      "",
      `Floor ${floor}`,
      `     ${header}`.trimEnd(),
      ...grid.map((row) => row.join("").trimEnd()),
    );
  }
  const regionName = new Map(
    layout.regions.map(({ id: key, name }) => [key, name]),
  );
  lines.push(
    "",
    "Rooms",
    ...table(
      layout.rooms.map((room) => [
        labels.get(room.id)!,
        room.id,
        room.name,
        cellText(room.at),
        `floor ${room.floor}`,
        ...(layout.regions.length === 0
          ? []
          : [room.region === undefined ? "" : regionName.get(room.region)!]),
        ...(layout.rooms.every(({ backdrop }) => backdrop === undefined)
          ? []
          : [room.backdrop === undefined ? "" : `${room.backdrop} backdrop`]),
        [
          ...(room.id === layout.startRoomId ? ["start"] : []),
          ...(room.exit ? ["exit"] : []),
        ].join(", "),
      ]),
    ),
  );
  const marked = layout.passages.flatMap((passage) => {
    const [from, to] = ends(passage);
    const marks = [
      ...(passage.vertical === undefined
        ? []
        : [verticalText(passage, from, to)]),
      ...passageMarks(passage),
    ];
    return marks.length === 0
      ? []
      : [
          [
            `${labels.get(from.id)!}-${labels.get(to.id)!}`,
            passage.id,
            marks.join(", "),
          ],
        ];
  });
  if (marked.length > 0) {
    lines.push("", "Marked passages", ...table(marked));
  }
  return `${lines.join("\n")}\n`;
}

// The SVG's geometry, in pixels: a cell, the room box in it, and margins.
const CELL_W = 170;
const CELL_H = 120;
const BOX_W = 136;
const BOX_H = 80;
const LEFT = 48;
const RIGHT = 24;
const LINE = 20;

/** Region shades, in the order the module lists its regions. */
const REGION_SHADES = [
  "#dce9f9",
  "#fbeccb",
  "#dcf0dc",
  "#f3dcee",
  "#e5dff8",
  "#fadedb",
  "#d9f0f0",
  "#efefd4",
];
const NO_REGION = "#f2f2f2";
const START = "#2e7d32";
const DOOR = "#6d4c41";
const HIDDEN = "#8e6fbf";
const FLAGGED = "#3f7fbf";
const TRAP = "#d32f2f";
const VERTICAL = "#1d4f91";

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** A room's name in lines of up to 18 characters, two at most. */
function nameLines(name: string): string[] {
  const lines: string[] = [];
  for (const word of name.split(" ")) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= 18) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines.length <= 2
    ? lines
    : [lines[0]!, `${lines.slice(1).join(" ").slice(0, 17)}…`];
}

const arrow = (from: LayoutRoom, to: LayoutRoom) =>
  to.floor > from.floor ? "▲" : "▼";

/**
 * The layout as an SVG: each floor from the top down, all on the same
 * columns so a stair's two ends line up; each room a box on its cell,
 * shaded by its region and labelled by name and id, with the start and exit
 * rooms and its stairs, ladders and shafts marked; each passage on a floor a
 * line, dashed if hidden and dotted if a flag opens or closes it, with a
 * door and a trap marked on it; then a legend of the regions, the marks and
 * the passages between floors.
 */
export function drawMapSvg(layout: MapLayout): string {
  const { minX, maxX } = columns(layout);
  const ends = passageEnds(layout);
  const shades = new Map(
    layout.regions.map(({ id: key }, index) => [
      key,
      REGION_SHADES[index % REGION_SHADES.length]!,
    ]),
  );
  const width = Math.max(LEFT + (maxX - minX + 1) * CELL_W + RIGHT, 560);
  const parts: string[] = [
    `<text x="${LEFT}" y="28" font-size="20" font-weight="700">${escape(layout.title)}</text>`,
    `<text x="${LEFT}" y="46" font-size="12" fill="#666666">${escape(layout.id)} · ${layout.source} · ${layout.rooms.length} rooms, ${layout.passages.length} passages</text>`,
  ];
  const verticals = layout.passages.filter(
    ({ vertical }) => vertical !== undefined,
  );
  let top = 60;
  for (const floor of floorsOf(layout)) {
    // Every floor has the same columns, so a stair's ends line up, but
    // only its own rows.
    const { minY, maxY } = floorRows(layout, floor);
    const cellsTop = top + 2 * LINE + 10;
    const centre = ([x, y]: readonly [number, number]) =>
      [
        LEFT + (x - minX) * CELL_W + CELL_W / 2,
        cellsTop + (y - minY) * CELL_H + CELL_H / 2,
      ] as const;
    const floorParts = [
      `<text x="${LEFT}" y="${top + LINE}" font-size="16" font-weight="700">Floor ${floor}</text>`,
    ];
    for (let x = minX; x <= maxX; x += 1) {
      floorParts.push(
        `<text x="${centre([x, minY])[0]}" y="${cellsTop - 6}" font-size="10" fill="#999999" text-anchor="middle">${x}</text>`,
      );
      for (let y = minY; y <= maxY; y += 1) {
        const [cx, cy] = centre([x, y]);
        floorParts.push(
          `<rect class="cell" x="${cx - CELL_W / 2}" y="${cy - CELL_H / 2}" width="${CELL_W}" height="${CELL_H}" fill="none" stroke="#eeeeee"/>`,
        );
      }
    }
    for (let y = minY; y <= maxY; y += 1) {
      floorParts.push(
        `<text x="${LEFT - 8}" y="${centre([minX, y])[1] + 4}" font-size="10" fill="#999999" text-anchor="end">${y}</text>`,
      );
    }
    const marks: string[] = [];
    for (const passage of layout.passages) {
      const [from, to] = ends(passage);
      if (
        passage.vertical !== undefined ||
        from.floor !== floor ||
        to.floor !== floor ||
        straightRun(from.at, to.at) === undefined
      ) {
        continue;
      }
      const [x1, y1] = centre(from.at);
      const [x2, y2] = centre(to.at);
      const flagged =
        passage.openWhen !== undefined || passage.closeWhen !== undefined;
      const style = passage.hidden
        ? `stroke="${HIDDEN}" stroke-dasharray="7 6"`
        : flagged
          ? `stroke="${FLAGGED}" stroke-dasharray="2 6"`
          : `stroke="#777777"`;
      const data = `data-passage="${escape(passage.id)}"`;
      floorParts.push(
        `<line class="passage${passage.hidden ? " hidden" : ""}${flagged ? " flagged" : ""}" ${data} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${style} stroke-width="4" stroke-linecap="round"/>`,
      );
      // Marks sit halfway, in the gap between the rooms (or on the empty
      // cell a longer run crosses); a trap beside a door.
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      if (passage.door !== undefined) {
        marks.push(
          `<rect class="door ${passage.door}" ${data} x="${mx - 7}" y="${my - 7}" width="14" height="14" fill="${passage.door === "locked" ? DOOR : "#ffffff"}" stroke="${DOOR}" stroke-width="2"/>`,
        );
      }
      if (passage.trap) {
        const length = Math.hypot(x2 - x1, y2 - y1);
        const tx = mx - ((y2 - y1) / length) * 16;
        const ty = my + ((x2 - x1) / length) * 16;
        marks.push(
          `<path class="trap" ${data} d="M ${tx} ${ty - 7} L ${tx + 7} ${ty + 6} L ${tx - 7} ${ty + 6} Z" fill="${TRAP}"/>`,
        );
      }
    }
    floorParts.push(...marks);
    for (const room of layout.rooms) {
      if (room.floor !== floor) {
        continue;
      }
      const [cx, cy] = centre(room.at);
      const start = room.id === layout.startRoomId;
      const tags = [
        ...(start ? ["START"] : []),
        ...(room.exit ? ["EXIT"] : []),
      ];
      const lines = nameLines(room.name);
      const counts = new Map<string, number>();
      for (const passage of verticals) {
        const [from, to] = ends(passage);
        const there =
          from.id === room.id ? to : to.id === room.id ? from : undefined;
        if (there !== undefined) {
          const key = `${arrow(room, there)} ${passage.vertical!}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      const vertical = [...counts]
        .map(([key, count]) => (count === 1 ? key : `${key} ×${count}`))
        .join(" · ");
      floorParts.push(
        [
          `<g class="room${start ? " start" : ""}${room.exit ? " exit" : ""}" data-room="${escape(room.id)}">`,
          `<rect x="${cx - BOX_W / 2}" y="${cy - BOX_H / 2}" width="${BOX_W}" height="${BOX_H}" rx="6" fill="${room.region === undefined ? NO_REGION : shades.get(room.region)!}" stroke="${start ? START : "#4a4a4a"}" stroke-width="${start ? 3 : 1.5}"/>`,
          ...(tags.length === 0
            ? []
            : [
                `<text x="${cx - BOX_W / 2 + 6}" y="${cy - BOX_H / 2 + 12}" font-size="9" font-weight="700" fill="${START}">${tags.join(" · ")}</text>`,
              ]),
          ...lines.map(
            (line, index) =>
              `<text x="${cx}" y="${cy - 2 + (index - lines.length + 1) * 15}" font-size="13" font-weight="600" text-anchor="middle">${escape(line)}</text>`,
          ),
          `<text x="${cx}" y="${cy + 14}" font-size="10" fill="#666666" text-anchor="middle">${escape(room.id)}</text>`,
          ...(vertical === ""
            ? []
            : [
                `<text x="${cx}" y="${cy + 30}" font-size="10" font-weight="600" fill="${VERTICAL}" text-anchor="middle">${vertical}</text>`,
              ]),
          "</g>",
        ].join(""),
      );
    }
    parts.push(
      `<g class="floor" data-floor="${floor}">`,
      ...floorParts,
      "</g>",
    );
    top = cellsTop + (maxY - minY + 1) * CELL_H + 10;
  }
  // The legend: regions, marks, then passages between floors.
  const legend: string[] = [];
  let y = top + LINE;
  const heading = (words: string) => {
    y += legend.length === 0 ? 0 : 8;
    legend.push(
      `<text x="${LEFT}" y="${y}" font-size="13" font-weight="700">${words}</text>`,
    );
    y += LINE;
  };
  const entry = (sample: string, words: string) => {
    legend.push(
      sample,
      `<text x="${LEFT + 32}" y="${y + 4}" font-size="12">${escape(words)}</text>`,
    );
    y += LINE;
  };
  if (layout.regions.length > 0) {
    heading("Regions");
    for (const { id: key, name, backdrop } of layout.regions) {
      entry(
        `<rect class="swatch" x="${LEFT}" y="${y - 8}" width="22" height="14" fill="${shades.get(key)!}" stroke="#4a4a4a"/>`,
        backdrop === undefined ? name : `${name} (${backdrop} backdrop)`,
      );
    }
  }
  heading("Key");
  const sampleLine = (style: string) =>
    `<line x1="${LEFT}" y1="${y}" x2="${LEFT + 22}" y2="${y}" ${style} stroke-width="4"/>`;
  entry(
    `<rect x="${LEFT}" y="${y - 8}" width="22" height="14" rx="3" fill="#ffffff" stroke="${START}" stroke-width="3"/>`,
    "start room (START); exit room (EXIT)",
  );
  entry(sampleLine(`stroke="#777777"`), "passage");
  entry(
    sampleLine(`stroke="${HIDDEN}" stroke-dasharray="7 6"`),
    "hidden passage",
  );
  entry(
    sampleLine(`stroke="${FLAGGED}" stroke-dasharray="2 6"`),
    "passage a flag opens or closes",
  );
  entry(
    `<rect x="${LEFT + 4}" y="${y - 7}" width="14" height="14" fill="#ffffff" stroke="${DOOR}" stroke-width="2"/>`,
    "stuck door",
  );
  entry(
    `<rect x="${LEFT + 4}" y="${y - 7}" width="14" height="14" fill="${DOOR}" stroke="${DOOR}" stroke-width="2"/>`,
    "locked door",
  );
  entry(
    `<path d="M ${LEFT + 11} ${y - 7} L ${LEFT + 18} ${y + 6} L ${LEFT + 4} ${y + 6} Z" fill="${TRAP}"/>`,
    "trap",
  );
  entry(
    `<text x="${LEFT}" y="${y + 4}" font-size="12" font-weight="600" fill="${VERTICAL}">▲▼</text>`,
    "stairs, a ladder or a shaft up or down (listed below)",
  );
  if (verticals.length > 0) {
    heading("Between floors");
    for (const passage of verticals) {
      const [from, to] = ends(passage);
      const marks = passageMarks(passage);
      legend.push(
        `<text x="${LEFT}" y="${y + 4}" font-size="12">${escape(`${from.name} ${arrow(from, to)} ${passage.vertical!} to ${to.name} (floor ${to.floor})${marks.length === 0 ? "" : `: ${marks.join(", ")}`}`)}</text>`,
      );
      y += LINE;
    }
  }
  const height = y + LINE;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="system-ui, 'Segoe UI', sans-serif">`,
    `<title>${escape(`${layout.title} (${layout.id})`)}</title>`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    ...parts,
    `<g class="legend">`,
    ...legend,
    "</g>",
    "</svg>",
    "",
  ].join("\n");
}
