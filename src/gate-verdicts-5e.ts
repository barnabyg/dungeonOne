/**
 * The balance gate's verdicts on the shipped modules, recorded in
 * `adventures/5e/gate-verdicts.json` so the browser offers them without
 * gating each at startup (about 28 s for both classes). A verdict is keyed by
 * a hash of the loaded module, so a changed module is gated afresh. The gate
 * also depends on the engine, so `tests/shipped-modules.test.mjs` checks the
 * file against the gate itself: a change that moves a verdict fails until
 * `npm run gate:verdicts` records it again.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { FifthAdventure } from "./adventure-5e.js";
import { passesGate } from "./balance-5e.js";

/** The recorded verdicts file's format; any other is ignored. */
export const GATE_VERDICTS_FORMAT = 1;

/** The recorded verdicts file, beside the shipped modules. */
export const GATE_VERDICTS_PATH = fileURLToPath(
  new URL("../adventures/5e/gate-verdicts.json", import.meta.url),
);

/** Each module's recorded verdict, by module id. */
export type GateVerdicts = Readonly<
  Record<string, Readonly<{ hash: string; qualified: boolean }>>
>;

/** The recorded verdicts file's content. */
export type GateVerdictsFile = Readonly<{
  format: typeof GATE_VERDICTS_FORMAT;
  verdicts: GateVerdicts;
}>;

/** A hash of the loaded module: any change to it, or its monsters, changes it. */
export function moduleHash(adventure: FifthAdventure): string {
  return createHash("sha256").update(JSON.stringify(adventure)).digest("hex");
}

/** The verdicts file for `adventures`, by id, each judged by `qualifies`. */
export function recordGateVerdicts(
  adventures: readonly FifthAdventure[],
  qualifies: (adventure: FifthAdventure) => boolean,
): GateVerdictsFile {
  const sorted = [...adventures].sort((a, b) => a.id.localeCompare(b.id));
  return {
    format: GATE_VERDICTS_FORMAT,
    verdicts: Object.fromEntries(
      sorted.map((adventure) => [
        adventure.id,
        { hash: moduleHash(adventure), qualified: qualifies(adventure) },
      ]),
    ),
  };
}

const isVerdict = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { hash?: unknown }).hash === "string" &&
  typeof (value as { qualified?: unknown }).qualified === "boolean";

/**
 * The verdicts recorded at `path`. A missing or unreadable file, or one in
 * another format, records none, so every module is gated as before.
 */
export async function loadGateVerdicts(
  path: string = GATE_VERDICTS_PATH,
): Promise<GateVerdicts> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return {};
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { format?: unknown }).format !== GATE_VERDICTS_FORMAT
  ) {
    return {};
  }
  const { verdicts } = parsed as { verdicts?: unknown };
  if (
    typeof verdicts !== "object" ||
    verdicts === null ||
    !Object.values(verdicts).every(isVerdict)
  ) {
    return {};
  }
  return verdicts as GateVerdicts;
}

/**
 * Whether a module passes the gate (`passesGate`): its recorded verdict when
 * `verdicts` holds one for exactly this module, or else the gate's.
 */
export function recordedOrGated(
  verdicts: GateVerdicts,
): (adventure: FifthAdventure) => boolean {
  return (adventure) => {
    const recorded = Object.hasOwn(verdicts, adventure.id)
      ? verdicts[adventure.id]
      : undefined;
    return recorded !== undefined && recorded.hash === moduleHash(adventure)
      ? recorded.qualified
      : passesGate(adventure);
  };
}
