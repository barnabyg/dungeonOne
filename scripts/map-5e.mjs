// Draws and checks a module's map, or a design-stage layout sketch (#456):
// a plain-text grid on the console and an SVG in .scratch/maps/<id>.svg.
// The checks are the module validator's own layout rules (src/map-5e.ts);
// the tool lists every violation, not just the first, and exits 1 on any.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FIFTH_ADVENTURE_FILES,
  validateFifthAdventure,
} from "../dist/adventure-5e.js";
import { loadBuiltInFifthBestiary } from "../dist/bestiary-5e.js";
import { ShapeError } from "../dist/json-shape.js";
import { layoutErrors, layoutWarnings } from "../dist/map-5e.js";
import { drawMapSvg, drawMapText, readMapLayout } from "../dist/map-tool-5e.js";

const USAGE =
  "Usage: npm run map -- <module-id | path to a module or a layout sketch>\n";

/** The file a command-line target names: a shipped module's id, or a path. */
const targetPath = (target) =>
  Object.hasOwn(FIFTH_ADVENTURE_FILES, target)
    ? fileURLToPath(
        new URL(
          `../adventures/5e/${FIFTH_ADVENTURE_FILES[target]}`,
          import.meta.url,
        ),
      )
    : target;

const section = (heading, entries, none) =>
  entries.length === 0
    ? [none]
    : [
        `${heading} (${entries.length}):`,
        ...entries.map((entry) => `  - ${entry}`),
      ];

/**
 * Draws and checks the module or sketch `args` names; writes the report to
 * `output` and the SVG into `outDir`. Returns the exit code: 0, or 1 if the
 * layout breaks a rule (or the module is invalid) or can't be read, 2 on a
 * usage error.
 */
export async function main(
  args,
  { output = process.stdout, outDir = join(".scratch", "maps") } = {},
) {
  if (args.length !== 1 || args[0].startsWith("-")) {
    output.write(USAGE);
    return 2;
  }
  const path = targetPath(args[0]);
  let value;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch {
    output.write(`${path} is not a readable JSON file.\n`);
    return 1;
  }
  let layout;
  try {
    layout = readMapLayout(value);
  } catch (error) {
    if (error instanceof ShapeError) {
      output.write(`${path}: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
  const errors = layoutErrors(layout.rooms, layout.passages);
  if (layout.source === "module") {
    // The validator stops at the first problem; a layout one is listed
    // already.
    try {
      validateFifthAdventure(value, await loadBuiltInFifthBestiary());
    } catch (error) {
      const problem = error.message.replace(/^Invalid adventure module: /u, "");
      if (!errors.includes(problem)) {
        errors.push(`the module is invalid: ${problem}`);
      }
    }
  }
  const warnings = layoutWarnings(layout.rooms, layout.passages);
  await mkdir(outDir, { recursive: true });
  const svgPath = join(outDir, `${layout.id}.svg`);
  await writeFile(svgPath, drawMapSvg(layout));
  output.write(
    [
      drawMapText(layout),
      ...section("Layout errors", errors, "No layout errors."),
      ...section("Warnings", warnings, "No warnings."),
      `Map: ${svgPath}`,
      "",
    ].join("\n"),
  );
  return errors.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main(process.argv.slice(2));
}
