import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import {
  createCharacter,
  advanceCharacter,
  characterProfile,
} from "../dist/character-rules.js";
import { createSeededRandom } from "../dist/random.js";
import {
  beaconPeaceful,
  stonebridgePeaceful,
} from "./fixtures/character-journeys.mjs";

for (const [file, levels, entry, opponent, peaceful] of [
  [
    "hollow-beacon-characters",
    [1, 2],
    "ridge-trail",
    "ridge-raider",
    beaconPeaceful,
  ],
  [
    "stonebridge-characters",
    [2, 3],
    "raider-den",
    "toll-raider",
    stonebridgePeaceful,
  ],
]) {
  test(`${file}: recommended bounds and all presets qualify across 64 seeds`, async () => {
    const loaded = loadAdventure(await readFile(`adventures/${file}.json`));
    assert.equal(loaded.ok, true);
    for (const level of levels) {
      for (const preset of ["balanced", "stout", "scout"]) {
        let surviving = 0;
        for (let seed = 0; seed < 64; seed++) {
          const base = createCharacter("Sample", preset);
          const sheet = advanceCharacter(
            base,
            level === 1 ? 0 : level === 2 ? 1000 : 2500,
            base.hp,
          );
          sheet.hp = characterProfile(sheet).maxHp;
          const runtime = createDataRuntime(loaded.adventure, sheet);
          const random = createSeededRandom(seed);
          let state = runtime.createSession();
          const apply = (command) => {
            const result = runtime.handleAction(
              state,
              runtime.parseCommand(command),
              random,
            );
            assert.equal(
              result.rejection,
              undefined,
              command + JSON.stringify(result.rejection),
            );
            state = result.state;
          };
          apply("move " + entry);
          for (
            let turn = 0;
            turn < 100 &&
            state.status === "playing" &&
            state.combat !== undefined;
            turn++
          ) {
            apply("attack " + opponent);
          }
          if (state.status === "playing") {
            assert.equal(state.combat, undefined);
            surviving++;
          } else {
            assert.equal(state.status, "defeat");
            assert.equal(state.fighter.hp, 0);
          }
          // A failed optional check must leave the entire peaceful route intact.
          state = runtime.createSession();
          const check =
            file === "hollow-beacon-characters" ? "read-beacon" : undefined;
          if (check) {
            state = runtime.handleAction(
              state,
              runtime.parseCommand("check " + check),
              { roll: () => 1 },
            ).state;
            assert.equal(state.abilityChecks[check].result, "failure");
          }
          for (const command of peaceful) {
            apply(command);
          }
          assert.equal(state.status, "victory");
          assert.equal(state.fighter.hp, sheet.hp);
        }
        assert.ok(
          surviving >= 51,
          `${file} ${preset} level ${level}: ${surviving}/64 survival must remain at least 80% on the basic fight`,
        );
      }
    }
  });
}
