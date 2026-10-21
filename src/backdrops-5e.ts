// The backdrops (#517): faint drawings of the kind of place a room is, made
// for Dungeon One in one colour. A module names one for each region, and a
// room may override its region's (src/adventure-5e.ts); the page draws the
// current room's behind the scene column, as the shop draws its shelves
// (#515). Each is 800 x 600, standing on its bottom edge, and drawn in
// currentColor so the page picks its colour and strength.

/** Every backdrop a module may name. */
export const BACKDROPS = ["cellar", "crypt", "forest"] as const;

export type Backdrop = (typeof BACKDROPS)[number];

/** Whether `value` names a backdrop. */
export const isBackdrop = (value: unknown): value is Backdrop =>
  (BACKDROPS as readonly unknown[]).includes(value);

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
  ...[
    [90, 432],
    [190, 432],
    [290, 432],
    [140, 342],
    [240, 342],
    [190, 252],
  ].map(([x, y]) => barrelEnd(x!, y!, 50)),
  path(box(184, 468, 12, 18) + box(180, 484, 20, 4)),
  ...[300, 400].map((y) =>
    path(box(480, y, 280, 8) + box(488, y + 8, 8, 20) + box(744, y + 8, 8, 20)),
  ),
  ...[
    [500, 30, 44],
    [540, 24, 34],
    [576, 34, 50],
    [624, 22, 30],
    [664, 30, 40],
    [708, 26, 46],
  ].map(([x, w, h]) =>
    path(
      `M${x!} 300v${-h! + 8}q0-8 8-8h${w! - 16}q8 0 8 8v${h! - 8}z` +
        box(x! + 4, 300 - h! - 8, w! - 8, 6),
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
      [
        [300, 70, 9],
        [420, 120, 6],
        [660, 170, 7],
        [250, 180, 5],
        [480, 40, 5],
      ]
        .map(([x, y, r]) => star(x!, y!, r!))
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

const art = (name: Backdrop, drawing: string) =>
  `<svg class="backdrop" data-backdrop="${name}" viewBox="0 0 800 600" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false"><g fill="currentColor">${drawing}</g></svg>`;

/** Each backdrop's drawing, an inline SVG, in the order of BACKDROPS. */
export const BACKDROP_ART: Readonly<Record<Backdrop, string>> = {
  cellar: art("cellar", CELLAR),
  crypt: art("crypt", CRYPT),
  forest: art("forest", FOREST),
};
