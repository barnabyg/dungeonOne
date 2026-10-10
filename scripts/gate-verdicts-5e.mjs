// Gates every shipped module for both classes and records the verdicts in
// adventures/5e/gate-verdicts.json, which the browser reads at startup in
// place of gating them (src/gate-verdicts-5e.ts). Run it when
// tests/shipped-modules.test.mjs reports the file out of date.
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import * as prettier from "prettier";

import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { passesGate } from "../dist/balance-5e.js";
import {
  GATE_VERDICTS_PATH,
  recordGateVerdicts,
} from "../dist/gate-verdicts-5e.js";

/** The verdicts file's text for `adventures`, as Prettier formats it. */
export async function renderGateVerdicts(adventures, qualifies = passesGate) {
  return prettier.format(
    JSON.stringify(recordGateVerdicts(adventures, qualifies)),
    { parser: "json" },
  );
}

export async function main(write = (text) => process.stdout.write(text)) {
  const adventures = await loadBuiltInFifthAdventures();
  await writeFile(GATE_VERDICTS_PATH, await renderGateVerdicts(adventures));
  write(`Recorded the gate's verdicts on ${adventures.length} modules.\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
