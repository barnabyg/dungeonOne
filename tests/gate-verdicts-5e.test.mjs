// The recorded gate verdicts (src/gate-verdicts-5e.ts): the browser offers a
// module by its recorded verdict only while the module is exactly the one
// recorded, and gates it otherwise. tests/shipped-modules.test.mjs checks the
// shipped file against the gate.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GATE_VERDICTS_FORMAT,
  loadGateVerdicts,
  moduleHash,
  recordedOrGated,
  recordGateVerdicts,
} from "../dist/gate-verdicts-5e.js";
import { renderGateVerdicts } from "../scripts/gate-verdicts-5e.mjs";
import {
  loneGoblin,
  ratlessTunnels,
  sealedCrypt,
} from "./fixtures/modules.mjs";

const withDirectory = async (work) => {
  const directory = await mkdtemp(join(tmpdir(), "gate-verdicts-"));
  try {
    await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test("a module's hash follows its content", () => {
  assert.match(moduleHash(sealedCrypt), /^[0-9a-f]{64}$/u);
  assert.equal(
    moduleHash(sealedCrypt),
    moduleHash(structuredClone(sealedCrypt)),
  );
  const changed = structuredClone(sealedCrypt);
  changed.title = "The Resealed Crypt";
  assert.notEqual(moduleHash(changed), moduleHash(sealedCrypt));
});

test("the record holds each module's hash and verdict, by id", () => {
  assert.deepEqual(
    recordGateVerdicts(
      [sealedCrypt, loneGoblin],
      (adventure) => adventure === sealedCrypt,
    ),
    {
      format: GATE_VERDICTS_FORMAT,
      verdicts: {
        "lone-goblin": { hash: moduleHash(loneGoblin), qualified: false },
        "sealed-crypt": { hash: moduleHash(sealedCrypt), qualified: true },
      },
    },
  );
});

test("a recorded verdict is used only for the module recorded; any other is gated", () => {
  // The recorded verdicts are the opposite of the gate's, to tell them apart.
  const qualifies = recordedOrGated(
    recordGateVerdicts([ratlessTunnels], () => false).verdicts,
  );
  assert.equal(qualifies(ratlessTunnels), false);
  const changed = structuredClone(ratlessTunnels);
  changed.title = "The Quieter Tunnels";
  assert.equal(qualifies(changed), true);
  assert.equal(recordedOrGated({})(ratlessTunnels), true);
});

test("the script writes the record as Prettier formats it", async () => {
  const text = await renderGateVerdicts([sealedCrypt], () => true);
  assert.equal(
    text,
    `${JSON.stringify(
      recordGateVerdicts([sealedCrypt], () => true),
      null,
      2,
    )}\n`,
  );
});

test("a missing, unreadable or other-format file records no verdicts", async () =>
  withDirectory(async (directory) => {
    const file = join(directory, "gate-verdicts.json");
    assert.deepEqual(await loadGateVerdicts(file), {});
    const record = recordGateVerdicts([sealedCrypt], () => true);
    for (const content of [
      "{",
      "null",
      JSON.stringify({ ...record, format: GATE_VERDICTS_FORMAT + 1 }),
      JSON.stringify({ format: GATE_VERDICTS_FORMAT }),
      JSON.stringify({
        format: GATE_VERDICTS_FORMAT,
        verdicts: { "sealed-crypt": { hash: "x", qualified: "yes" } },
      }),
    ]) {
      await writeFile(file, content);
      assert.deepEqual(await loadGateVerdicts(file), {}, content);
    }
    await writeFile(file, JSON.stringify(record));
    assert.deepEqual(await loadGateVerdicts(file), record.verdicts);
  }));
