// The backdrops (#517): faint drawings of the kind of place a room is, made
// for Dungeon One in one colour. A module names one for each region, and a
// room may override its region's (src/adventure-5e.ts); the page draws the
// current room's behind the scene column, as the shop draws its shelves
// (#515). Each is 800 x 600, standing on its bottom edge, and drawn in
// currentColor so the page picks its colour and strength. Each starts
// hidden; the page shows the current room's.

import { fail } from "./json-shape.js";

/** Every backdrop a module may name. */
export const BACKDROPS = [
  "cellar",
  "crypt",
  "culvert",
  "farmyard",
  "forest",
  "hall",
  "ruin",
  "weir",
] as const;

export type Backdrop = (typeof BACKDROPS)[number];

/** Whether `value` names a backdrop. */
export const isBackdrop = (value: unknown): value is Backdrop =>
  (BACKDROPS as readonly unknown[]).includes(value);

/**
 * `{ backdrop }` from a module's `value`, or nothing when it is left out;
 * fails naming `where` when it names no backdrop.
 */
export function readBackdrop(
  value: unknown,
  where: string,
): Readonly<{ backdrop?: Backdrop }> {
  if (value === undefined) {
    return {};
  }
  if (!isBackdrop(value)) {
    fail(
      `${where} names unknown backdrop ${String(value)}: use one of ${BACKDROPS.join(", ")}.`,
    );
  }
  return { backdrop: value };
}

// Path pieces. Shapes in one path cut each other out (evenodd).

/** A circle of radius `r` about (`x`, `y`). */
const circle = (x: number, y: number, r: number) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

/** A rectangle from (`x`, `y`), `w` wide and `h` high. */
const box = (x: number, y: number, w: number, h: number) =>
  `M${x} ${y}h${w}v${h}h${-w}z`;

const path = (d: string) => `<path fill-rule="evenodd" d="${d}"/>`;

/** A round arch's ring, springing from `left` to `right` at height `y`. */
const arch = (left: number, right: number, y: number, thickness: number) => {
  const r = (right - left) / 2;
  const inner = r - thickness;
  return `M${left} ${y}a${r} ${r} 0 0 1 ${2 * r} 0h${-thickness}a${inner} ${inner} 0 0 0 ${-2 * inner} 0z`;
};

/** A skull facing out, its crown's top-left at (`x`, `y`). */
const skull = (x: number, y: number) =>
  `M${x} ${y + 12}a12 12 0 0 1 24 0v8h-5v6h-14v-6h-5z` +
  circle(x + 7, y + 13, 3) +
  circle(x + 17, y + 13, 3);

/** A candle on a stand whose foot is at (`x`, `y`). */
const candleStand = (x: number, y: number) =>
  path(
    `M${x - 20} ${y}l20-18l20 18z` +
      box(x - 4, y - 110, 8, 94) +
      box(x - 14, y - 116, 28, 6) +
      box(x - 6, y - 144, 12, 28) +
      `M${x} ${y - 172}q-9 15 0 24q9-9 0-24z`,
  );

/** A barrel seen end on: its rim, its head and its bung. */
const barrelEnd = (x: number, y: number, r: number) =>
  path(
    circle(x, y, r) +
      circle(x, y, r - 6) +
      circle(x, y, r - 12) +
      circle(x, y - r / 2, 4),
  );

/** A pine whose trunk stands at (`x`, `y`), `h` high and `w` wide. */
const pine = (x: number, y: number, h: number, w: number) => {
  const tiers = [0, 1, 2, 3].map((tier) => {
    const top = y - h + tier * h * 0.2;
    const half = (w / 2) * (0.45 + tier * 0.18);
    return `M${x} ${top}l${half} ${h * 0.3}h${-2 * half}z`;
  });
  return path(
    box(x - w * 0.05, y - h * 0.2, w * 0.1, h * 0.2) + tiers.join(""),
  );
};

/** A tuft of grass at (`x`, `y`). */
const tuft = (x: number, y: number) =>
  `M${x} ${y}q-4-12-10-16q8 4 12 12q0-12 4-20q0 12 2 20q4-8 12-12q-6 4-8 16z`;

// A crypt: an arcade of three round arches on pillars, skulls on shelves in
// the side bays, and a carved tomb with its effigy between two candles.
const CRYPT = [
  path(box(0, 470, 800, 7)),
  ...[40, 280, 520, 760].map((x) =>
    path(
      box(x, 158, 40, 312) + box(x - 6, 150, 52, 10) + box(x - 6, 460, 52, 10),
    ),
  ),
  ...[80, 320, 560].map((left) => path(arch(left, left + 200, 158, 16))),
  ...[100, 580].map((left) =>
    path(
      box(left, 300, 120, 6) +
        box(left, 380, 120, 6) +
        [0, 34, 68, 96].map((dx) => skull(left + dx, 274)).join("") +
        [10, 48, 86].map((dx) => skull(left + dx, 354)).join(""),
    ),
  ),
  path(
    `M250 470l12-90h276l12 90z` + box(292, 400, 96, 50) + box(412, 400, 96, 50),
  ),
  path(
    box(240, 362, 320, 20) +
      circle(292, 350, 12) +
      `M306 362q10-20 40-20h150q22 0 30 20z`,
  ),
  candleStand(200, 470),
  candleStand(600, 470),
  `<g fill="none" stroke="currentColor" stroke-width="3"><path d="M0 0l90 70M0 30l70 40M30 0l50 60M0 50q40-10 52-60M0 22q20-4 26-22M0 80q60-20 80-80"/><path d="M800 0l-90 70M800 30l-70 40M770 0l-50 60M800 50q-40-10-52-60M800 22q-20-4-26-22M800 80q-60-20-80-80"/></g>`,
].join("");

// A cellar: a brick vault, barrels racked end on, shelves of jars and
// bottles, sacks and a crate on the floor, and a ham on a hook.
const CELLAR = [
  path(`M0 230Q400-10 800 230v22Q400 12 0 252z`),
  path(`M0 140Q400-60 800 140v12Q400-46 0 152z`),
  path(box(0, 500, 800, 7)),
  path(box(40, 486, 300, 14) + box(56, 500, 12, 20) + box(312, 500, 12, 20)),
  ...(
    [
      [90, 432],
      [190, 432],
      [290, 432],
      [140, 342],
      [240, 342],
      [190, 252],
    ] as const
  ).map(([x, y]) => barrelEnd(x, y, 50)),
  path(box(184, 468, 12, 18) + box(180, 484, 20, 4)),
  ...[300, 400].map((y) =>
    path(box(480, y, 280, 8) + box(488, y + 8, 8, 20) + box(744, y + 8, 8, 20)),
  ),
  ...(
    [
      [500, 30, 44],
      [540, 24, 34],
      [576, 34, 50],
      [624, 22, 30],
      [664, 30, 40],
      [708, 26, 46],
    ] as const
  ).map(([x, w, h]) =>
    path(
      `M${x} 300v${-h + 8}q0-8 8-8h${w - 16}q8 0 8 8v${h - 8}z` +
        box(x + 4, 300 - h - 8, w - 8, 6),
    ),
  ),
  ...[502, 530, 558, 600, 628, 690, 718].map((x) =>
    path(`M${x} 400v-36q0-10 8-14v-14h6v14q8 4 8 14v36z`),
  ),
  path(
    `M470 500q-8-50 18-70l8-12 8 10q40 24 30 72z` +
      `M540 500q-6-40 16-56l7-12 7 10q34 18 26 58z`,
  ),
  path(
    box(620, 440, 70, 60) +
      `M626 446h58v48h-58z` +
      `M626 446l58 48h-12l-46-38zM684 446l-58 48h12l46-38z`,
  ),
  path(
    box(418, 40, 4, 70) +
      `M420 110q-30 10-26 50q6 40 26 48q20-8 26-48q4-40-26-50z` +
      circle(420, 196, 5),
  ),
].join("");

/** A four-pointed star about (`x`, `y`). */
const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r}q${r / 5} ${(r * 4) / 5} ${r} ${r}q${(-r * 4) / 5} ${r / 5} ${-r} ${r}q${-r / 5} ${(-r * 4) / 5} ${-r} ${-r}q${(r * 4) / 5} ${-r / 5} ${r} ${-r}z`;

// A forest clearing at night: pines on either side under a moon and stars,
// a camp fire between stones, a tent, a log to sit on, and grass.
const FOREST = [
  path(
    `M560 56a34 34 0 1 0 0 68a26 34 0 1 1 0-68z` +
      (
        [
          [300, 70, 9],
          [420, 120, 6],
          [660, 170, 7],
          [250, 180, 5],
          [480, 40, 5],
        ] as const
      )
        .map(([x, y, r]) => star(x, y, r))
        .join(""),
  ),
  pine(50, 504, 430, 150),
  pine(160, 508, 300, 110),
  pine(740, 502, 450, 160),
  pine(650, 508, 280, 100),
  path(`M0 500Q200 488 400 500T800 496v10Q600 500 400 510T0 510z`),
  path(`M330 500l60-32l8 10l-56 26zM470 500l-60-32l-8 10l56 26z`),
  path(
    `M400 470q-30-30-6-70q4 22 16 26q-2-30 18-50q-6 40 14 60q4-18 14-22q4 30-20 56z`,
  ),
  path(
    [316, 340, 364, 436, 460, 484]
      .map((x) => `M${x - 12} 504a12 8 0 0 1 24 0z`)
      .join(""),
  ),
  path(`M490 500l70-120l70 120z` + `M544 500l16-40l16 40z`),
  path(`M200 506q0-22 18-22h70q18 0 18 22z` + circle(218, 495, 7)),
  path([20, 120, 310, 520, 640, 780].map((x) => tuft(x, 502)).join("")),
].join("");

/** Strokes `d` in lines `width` wide, with round ends. */
const lines = (d: string, width: number) =>
  `<g fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round"><path d="${d}"/></g>`;

/** A spoked wheel of radius `r` about (`x`, `y`). */
const wheel = (x: number, y: number, r: number, spokes: number) =>
  path(circle(x, y, r) + circle(x, y, r - 7) + circle(x, y, 9)) +
  lines(
    Array.from({ length: spokes }, (_, index) => {
      const angle = (index * Math.PI * 2) / spokes;
      const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
      return `M${round(x + dx * 9)} ${round(y + dy * 9)}L${round(x + dx * (r - 6))} ${round(y + dy * (r - 6))}`;
    }).join(""),
    4,
  );

const round = (value: number) => Math.round(value * 10) / 10;

/** A peaked roof from `left` to `right` with its eaves at `y`. */
const roof = (left: number, right: number, y: number, pitch: number) =>
  `M${left} ${y}L${(left + right) / 2} ${y - pitch}L${right} ${y}z`;

/** Ripples on water, a row of short waves from `left` to `right` at `y`. */
const ripples = (left: number, right: number, y: number) =>
  Array.from(
    { length: Math.floor((right - left) / 40) },
    (_, index) => `M${left + index * 40} ${y}q10-6 20 0q10 6 20 0`,
  ).join("");

// A culvert: a brick tunnel running into the dark, a channel of water
// between two walkways, a sluice gate on its screw, and a pipe pouring in.
const CULVERT = [
  ...(
    [
      [380, 18, 500],
      [290, 14, 480],
      [210, 11, 462],
      [140, 8, 446],
    ] as const
  ).map(([r, thickness, floor]) =>
    path(
      arch(400 - r, 400 + r, 380 - (380 - r) / 4, thickness) +
        box(
          400 - r,
          380 - (380 - r) / 4,
          thickness,
          floor - 380 + (380 - r) / 4,
        ) +
        box(
          400 + r - thickness,
          380 - (380 - r) / 4,
          thickness,
          floor - 380 + (380 - r) / 4,
        ),
    ),
  ),
  path(box(0, 470, 250, 10) + box(550, 470, 250, 10) + box(0, 520, 800, 6)),
  lines(ripples(250, 550, 494) + ripples(270, 530, 508), 3),
  wheel(130, 300, 42, 6),
  path(box(126, 342, 8, 104) + box(90, 430, 80, 40) + box(84, 424, 92, 8)),
  path(box(650, 320, 110, 30) + box(640, 314, 12, 42)),
  lines(`M650 340q-26 40-14 128M664 344q-22 40-10 124`, 5),
  path([330, 470].map((x) => circle(x, 300, 10) + circle(x, 300, 6)).join("")),
].join("");

// A farmyard: a barn with a loft door, an apple tree, a fence, a roofed
// well with its bucket, and a cart, with windfalls in the grass.
const FARMYARD = [
  path(box(0, 500, 800, 7)),
  path(
    box(40, 330, 240, 170) +
      `M125 500v-80a35 35 0 0 1 70 0v80z` +
      box(66, 360, 30, 30) +
      box(224, 360, 30, 30),
  ),
  path(roof(20, 300, 340, 120) + box(145, 270, 30, 36)),
  ...(
    [
      [330, 330, 46],
      [380, 300, 52],
      [430, 335, 44],
      [375, 350, 40],
    ] as const
  ).map(([x, y, r]) => path(circle(x, y, r))),
  path(
    box(372, 360, 16, 140) + `M372 420l-24-30h6l18 22zM388 410l22-26h6l-28 34z`,
  ),
  path(
    box(290, 452, 190, 6) +
      box(290, 474, 190, 6) +
      [296, 336, 376, 416, 456].map((x) => box(x, 438, 8, 62)).join(""),
  ),
  path(
    box(500, 440, 90, 60) +
      box(500, 432, 90, 8) +
      box(506, 350, 8, 82) +
      box(576, 350, 8, 82) +
      roof(486, 604, 358, 46),
  ),
  path(box(543, 358, 4, 50) + `M533 408h24l-4 22h-16z`),
  wheel(700, 452, 46, 8),
  path(
    box(630, 396, 160, 14) +
      `M790 402l10 6v10l-10-6z` +
      box(640, 380, 8, 16) +
      box(772, 380, 8, 16),
  ),
  path([150, 230, 445, 610, 745].map((x) => circle(x, 494, 6)).join("")),
  path([20, 300, 470, 620].map((x) => tuft(x, 502)).join("")),
].join("");

/** A stag's antlers on a plaque, its top at (`x`, `y`). */
const antlers = (x: number, y: number) =>
  path(`M${x - 18} ${y}q18-14 36 0l-5 30q-13 9-26 0z`) +
  lines(
    `M${x - 10} ${y + 2}q-30-20-34-62M${x - 26} ${y - 30}l-26-6M${x - 34} ${y - 48}l-18-20` +
      `M${x + 10} ${y + 2}q30-20 34-62M${x + 26} ${y - 30}l26-6M${x + 34} ${y - 48}l18-20`,
    7,
  );

// A hall: a great hearth with a fire and a pot under the mantel, antlers
// on the wall either side of its flue, banners, and a long table set with
// candles.
const HALL = [
  path(box(0, 500, 800, 7)),
  path(
    box(360, 110, 80, 160) +
      box(290, 260, 220, 170) +
      `M330 430v-90a70 34 0 0 1 140 0v90z`,
  ),
  path(box(270, 296, 260, 16) + box(260, 424, 280, 10)),
  path(`M370 430l60-22l6 8l-54 20zM430 430l-60-22l-6 8l54 20z`),
  path(
    `M400 412q-26-24-6-60q4 18 14 22q0-24 16-40q-4 34 10 50q4-14 12-18q2 26-18 46z`,
  ),
  path(box(398, 340, 4, 22) + `M378 362h44q2 26-22 30q-24-4-22-30z`),
  antlers(250, 210),
  antlers(550, 210),
  ...[110, 690].map((x) =>
    path(
      box(x - 30, 120, 60, 6) +
        `M${x - 22} 126h44v150l-22-20l-22 20z` +
        circle(x, 180, 12),
    ),
  ),
  path(box(130, 440, 540, 14) + box(160, 454, 14, 46) + box(626, 454, 14, 46)),
  path(box(110, 478, 580, 9) + box(124, 487, 8, 13) + box(668, 487, 8, 13)),
  ...[230, 570].map((x) =>
    path(
      box(x - 5, 410, 10, 30) +
        box(x - 11, 436, 22, 4) +
        `M${x} 388q-7 12 0 18q7-6 0-18z`,
    ),
  ),
  path(box(300, 418, 22, 22) + `M322 422h6q6 0 6 6v4q0 6-6 6h-6v-4h5v-8h-5z`),
  path(`M450 440q4-14 40-14q36 0 40 14z`),
].join("");

// A ruin on a hill: a broken wall with an archway, a ruined round tower,
// a standing stone with a hole through it, rubble, and birds over the hills.
const RUIN = [
  lines(`M0 380Q150 330 300 370T600 350T800 372`, 3),
  path(`M0 500Q200 488 400 500T800 496v10Q600 500 400 510T0 510z`),
  path(
    `M40 500V340h30v20h30v-20h30v20h30v-20h30v30l20 8l14-24l24 40l18-10l20 32l14-6V500z` +
      `M150 500v-60a35 35 0 0 1 70 0v60z`,
  ),
  path(
    `M580 500V196l18-18l14 24l22-40l24 30l20-16l18 22l24-10V500z` +
      box(640, 250, 10, 40) +
      box(640, 340, 10, 40) +
      `M624 500v-56a22 22 0 0 1 44 0v56z`,
  ),
  path(`M436 500l8-150q16-22 32 0l8 150z` + circle(460, 392, 10)),
  path(
    `M300 500l6-18h26l4 18zM340 500l4-12h18l2 12zM520 500l4-16h24l6 16zM740 500l6-14h20l4 14z`,
  ),
  lines(
    `M300 120q8-8 16 0q8-8 16 0M360 90q6-6 12 0q6-6 12 0M420 140q7-7 14 0q7-7 14 0`,
    3,
  ),
  path([20, 250, 400, 560, 780].map((x) => tuft(x, 502)).join("")),
].join("");

// A weir: a toll house with a bell turret beside a lock, its two gates
// and their balance beams, water running through, a footbridge over the
// river, and reeds along the banks.
const WEIR = [
  path(
    box(40, 300, 170, 140) +
      `M100 440v-60h36v60z` +
      box(60, 330, 26, 26) +
      box(160, 330, 26, 26),
  ),
  path(roof(24, 226, 306, 76) + box(170, 236, 16, 40)),
  path(
    box(110, 196, 30, 44) +
      roof(102, 148, 200, 26) +
      `M118 236q0-26 7-26q7 0 7 26z`,
  ),
  path(box(0, 440, 260, 10) + box(240, 400, 70, 8) + box(490, 400, 70, 8)),
  path(box(250, 440, 20, 70) + box(530, 440, 20, 70)),
  path(`M270 450l120 18v38l-120-6z` + `M530 450l-120 18v38l120-6z`),
  path(box(296, 408, 10, 46) + box(494, 408, 10, 46)),
  lines(
    ripples(270, 530, 524) + ripples(560, 800, 500) + ripples(580, 780, 516),
    3,
  ),
  path(`M560 440Q670 380 790 440v10Q670 390 560 450z`),
  lines(
    `M560 418Q670 358 790 418` +
      [590, 630, 670, 710, 750]
        .map(
          (x) =>
            `M${x} ${x === 670 ? 388 : x === 630 || x === 710 ? 392 : 402}v22`,
        )
        .join(""),
    4,
  ),
  lines(`M226 440q-4-40 2-70M238 440q2-34-6-58M552 446q4-36-4-60`, 3),
  path(
    `M224 370a4 10 0 1 0 8 0a4 10 0 1 0-8 0zM228 382a4 10 0 1 0 8 0a4 10 0 1 0-8 0zM544 386a4 10 0 1 0 8 0a4 10 0 1 0-8 0z`,
  ),
].join("");

const art = (name: Backdrop, drawing: string) =>
  `<svg class="backdrop" data-backdrop="${name}" hidden viewBox="0 0 800 600" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false"><g fill="currentColor">${drawing}</g></svg>`;

/** Each backdrop's drawing, an inline SVG, in the order of BACKDROPS. */
export const BACKDROP_ART: Readonly<Record<Backdrop, string>> = {
  cellar: art("cellar", CELLAR),
  crypt: art("crypt", CRYPT),
  culvert: art("culvert", CULVERT),
  farmyard: art("farmyard", FARMYARD),
  forest: art("forest", FOREST),
  hall: art("hall", HALL),
  ruin: art("ruin", RUIN),
  weir: art("weir", WEIR),
};
