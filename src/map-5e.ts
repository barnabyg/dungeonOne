/**
 * The room map's layout rules (#455), in one place for the module validator
 * and the mapping tool (#456).
 *
 * Each room sits on one cell of a square grid, `at: [x, y]` (x grows east,
 * y grows south), on a floor (0 by default; up is positive). The map is a
 * layout of rooms: there is still no tactical grid, no position inside a
 * room.
 *
 * - No two rooms share a cell of the same floor.
 * - A passage on one floor is a straight run: horizontal, vertical or a 45°
 *   diagonal, with no room on a cell between its two ends.
 * - Passages on the same floor don't cross or overlap.
 * - A passage between floors is `vertical` (stairs, a ladder or a shaft) and
 *   links rooms on adjacent floors; a vertical passage never links rooms on
 *   one floor.
 *
 * Those are errors. The mapping tool (#456) also warns about layouts that
 * read badly: a scattered region (one whose rooms on a floor surround
 * another region's room), a passage of three cells or more, and a passage
 * of two cells or more whose description reads as a doorway or a step.
 */

import { fail, integer } from "./json-shape.js";

export type Cell = readonly [x: number, y: number];

/** What carries a passage between floors. */
export const VERTICAL_KINDS = ["stairs", "ladder", "shaft"] as const;
export type VerticalKind = (typeof VERTICAL_KINDS)[number];

/** The most cells from the origin a room may sit, on either axis. */
export const MAX_CELL = 50;
/** The most floors above or below floor 0 a room may be on. */
export const MAX_FLOOR = 9;

/** A room as the map sees it. */
export type MapRoom = Readonly<{
  id: string;
  at: Cell;
  floor: number;
  region?: string;
}>;

/** A passage as the map sees it. */
export type MapPassage = Readonly<{
  id: string;
  between: readonly [string, string];
  vertical?: VerticalKind;
  description?: string;
}>;

/** A room's cell (#455): `[x, y]`, each within `MAX_CELL`. */
export function readCell(value: unknown, where: string): Cell {
  if (!Array.isArray(value) || value.length !== 2) {
    fail(`${where} must be a cell, [x, y].`);
  }
  const [x, y] = value as unknown[];
  return [
    integer(x, `${where} x`, -MAX_CELL, MAX_CELL),
    integer(y, `${where} y`, -MAX_CELL, MAX_CELL),
  ];
}

/** A room's floor: 0 if left out, else within `MAX_FLOOR` of it. */
export const readFloor = (value: unknown, where: string): number =>
  value === undefined ? 0 : integer(value, where, -MAX_FLOOR, MAX_FLOOR);

const cellText = ([x, y]: Cell) => `[${x}, ${y}]`;
const placeText = (room: MapRoom) =>
  `${room.id} on cell ${cellText(room.at)} of floor ${room.floor}`;

/** The cells strictly between a straight run's two ends. */
function cellsBetween(from: Cell, to: Cell): Cell[] {
  const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
  const dx = Math.sign(to[0] - from[0]);
  const dy = Math.sign(to[1] - from[1]);
  return Array.from(
    { length: Math.max(0, steps - 1) },
    (_, index) =>
      [from[0] + dx * (index + 1), from[1] + dy * (index + 1)] as const,
  );
}

const isStraight = ([x1, y1]: Cell, [x2, y2]: Cell) =>
  x1 === x2 || y1 === y2 || Math.abs(x2 - x1) === Math.abs(y2 - y1);

/** The turn from a to b to c: positive anticlockwise, 0 if in a line. */
const turn = (a: Cell, b: Cell, c: Cell) =>
  Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));

/**
 * Whether c lies in the box with corners a and b: for c in line with a and
 * b, whether it lies on the segment between them.
 */
const inBox = (a: Cell, b: Cell, c: Cell) =>
  Math.min(a[0], b[0]) <= c[0] &&
  c[0] <= Math.max(a[0], b[0]) &&
  Math.min(a[1], b[1]) <= c[1] &&
  c[1] <= Math.max(a[1], b[1]);

/** Whether the segments a–b and c–d meet anywhere, ends included. */
function meet(a: Cell, b: Cell, c: Cell, d: Cell): boolean {
  const abc = turn(a, b, c);
  const abd = turn(a, b, d);
  const cda = turn(c, d, a);
  const cdb = turn(c, d, b);
  if (abc * abd < 0 && cda * cdb < 0) {
    return true;
  }
  return (
    (abc === 0 && inBox(a, b, c)) ||
    (abd === 0 && inBox(a, b, d)) ||
    (cda === 0 && inBox(c, d, a)) ||
    (cdb === 0 && inBox(c, d, b))
  );
}

/**
 * The layout's errors, in the order the rules above list them: each names
 * the rooms, passages and cells concerned. Every passage must name two of
 * `rooms`.
 */
export function layoutErrors(
  rooms: readonly MapRoom[],
  passages: readonly MapPassage[],
): string[] {
  const errors: string[] = [];
  const byId = new Map(rooms.map((room) => [room.id, room]));
  const key = (at: Cell, floor: number) => `${at[0]},${at[1]},${floor}`;
  const byCell = new Map<string, MapRoom>();
  for (const room of rooms) {
    const other = byCell.get(key(room.at, room.floor));
    if (other === undefined) {
      byCell.set(key(room.at, room.floor), room);
    } else {
      errors.push(
        `rooms ${other.id} and ${room.id} are both on cell ${cellText(room.at)} of floor ${room.floor}: give each room its own cell.`,
      );
    }
  }
  const ends = (passage: MapPassage) =>
    passage.between.map((roomId) => {
      const room = byId.get(roomId);
      if (room === undefined) {
        throw new Error(`passage ${passage.id} names unknown room ${roomId}.`);
      }
      return room;
    }) as [MapRoom, MapRoom];
  const flat: { passage: MapPassage; from: MapRoom; to: MapRoom }[] = [];
  for (const passage of passages) {
    const [from, to] = ends(passage);
    if (from.floor !== to.floor) {
      if (passage.vertical === undefined) {
        errors.push(
          `passage ${passage.id} links ${placeText(from)} and ${placeText(to)}: mark a passage between floors as stairs, a ladder or a shaft (vertical).`,
        );
      } else if (Math.abs(from.floor - to.floor) !== 1) {
        errors.push(
          `passage ${passage.id} (${passage.vertical}) links ${placeText(from)} and ${placeText(to)}: it may link only adjacent floors.`,
        );
      }
      continue;
    }
    if (passage.vertical !== undefined) {
      errors.push(
        `passage ${passage.id} is ${passage.vertical}, but ${from.id} and ${to.id} are both on floor ${from.floor}: a vertical passage links adjacent floors.`,
      );
      continue;
    }
    if (!isStraight(from.at, to.at)) {
      errors.push(
        `passage ${passage.id} from ${placeText(from)} to ${to.id} on cell ${cellText(to.at)} is not a straight run: make it horizontal, vertical or a 45° diagonal.`,
      );
      continue;
    }
    const blocking = cellsBetween(from.at, to.at)
      .map((at) => byCell.get(key(at, from.floor)))
      .filter((room) => room !== undefined);
    if (blocking.length > 0) {
      for (const room of blocking) {
        errors.push(
          `passage ${passage.id} from ${from.id} to ${to.id} runs through room ${placeText(room)}: move the room, or route the passage round it.`,
        );
      }
      continue;
    }
    flat.push({ passage, from, to });
  }
  const runText = ({ from, to }: (typeof flat)[number]) =>
    `${from.id} on cell ${cellText(from.at)} to ${to.id} on cell ${cellText(to.at)}`;
  for (const [index, first] of flat.entries()) {
    for (const second of flat.slice(index + 1)) {
      if (first.from.floor !== second.from.floor) {
        continue;
      }
      const shared = [first.from, first.to].filter(
        (room) => room === second.from || room === second.to,
      );
      // Two straight runs from one room meet only there, unless they lie
      // along each other, which would put a room on the other's run.
      if (shared.length === 1) {
        continue;
      }
      if (shared.length === 2) {
        errors.push(
          `passages ${first.passage.id} and ${second.passage.id} both link ${first.from.id} and ${first.to.id}: one is enough.`,
        );
      } else if (
        meet(first.from.at, first.to.at, second.from.at, second.to.at)
      ) {
        errors.push(
          `passages ${first.passage.id} (${runText(first)}) and ${second.passage.id} (${runText(second)}) cross on floor ${first.from.floor}: move a room so they don't.`,
        );
      }
    }
  }
  return errors;
}

/** A passage on one floor this many cells long, or longer, is long. */
export const LONG_PASSAGE = 3;

/**
 * Whether a passage's description reads as a doorway or a step rather than
 * a way between: a door, an arch, a gate, a hatch, a curtain or steps in
 * its first four words, or "short", "a few steps" or "next door" anywhere.
 */
const readsShort = (description: string) =>
  /^(?:\S+\s+){0,3}?(?:door|doorway|arch|archway|gate|hatch|curtain|steps?)\b/iu.test(
    description,
  ) || /\b(?:short|few steps|next door)\b/iu.test(description);

/**
 * The layout's warnings: first each region whose rooms on a floor surround
 * (lie around, in a bounding box) a room of another region on that floor;
 * then each straight passage on one floor that runs `LONG_PASSAGE` cells or
 * more, or runs two cells or more but reads as a doorway or a step.
 */
export function layoutWarnings(
  rooms: readonly MapRoom[],
  passages: readonly MapPassage[] = [],
): string[] {
  const warnings: string[] = [];
  const blocks = new Map<string, MapRoom[]>();
  for (const room of rooms) {
    if (room.region !== undefined) {
      const block = `${room.region}\n${room.floor}`;
      blocks.set(block, [...(blocks.get(block) ?? []), room]);
    }
  }
  for (const members of blocks.values()) {
    const [{ region, floor }] = members as [MapRoom];
    const xs = members.map(({ at }) => at[0]);
    const ys = members.map(({ at }) => at[1]);
    const low: Cell = [Math.min(...xs), Math.min(...ys)];
    const high: Cell = [Math.max(...xs), Math.max(...ys)];
    for (const room of rooms) {
      if (
        room.floor === floor &&
        room.region !== region &&
        inBox(low, high, room.at)
      ) {
        warnings.push(
          `region ${region} is scattered: room ${room.id} of region ${room.region} is on cell ${cellText(room.at)}, among its rooms on floor ${floor} (${cellText(low)} to ${cellText(high)}).`,
        );
      }
    }
  }
  const byId = new Map(rooms.map((room) => [room.id, room]));
  for (const { id, between, vertical, description } of passages) {
    const [from, to] = between.map((roomId) => byId.get(roomId));
    if (
      from === undefined ||
      to === undefined ||
      from.floor !== to.floor ||
      vertical !== undefined ||
      !isStraight(from.at, to.at)
    ) {
      continue;
    }
    const cells = Math.max(
      Math.abs(to.at[0] - from.at[0]),
      Math.abs(to.at[1] - from.at[1]),
    );
    if (cells >= LONG_PASSAGE) {
      warnings.push(
        `passage ${id} from ${from.id} to ${to.id} runs ${cells} cells on floor ${from.floor}: move the rooms closer, or put a room on the way.`,
      );
    }
    if (cells >= 2 && description !== undefined && readsShort(description)) {
      warnings.push(
        `passage ${id} from ${from.id} to ${to.id} runs ${cells} cells, but its description reads as a doorway or a step ("${description}"): describe the way between, or move the rooms together.`,
      );
    }
  }
  return warnings;
}
