import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import {
  createCharacter,
  createRolledCharacter,
  advanceCharacter,
  characterProfile,
} from "../dist/character-rules.js";
import { createSeededRandom } from "../dist/random.js";
import {
  beaconExamine,
  beaconPeaceful,
  stonebridgeExamine,
  stonebridgePeaceful,
} from "./fixtures/character-journeys.mjs";

const MODULES = [
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
  // Treasure releases (#119) play with fighter-rules-v3 characters.
  [
    "hollow-beacon-loot",
    [1, 2],
    "ridge-trail",
    "ridge-raider",
    beaconExamine,
    "fighter-rules-v3",
  ],
  [
    "stonebridge-loot",
    [2, 3],
    "raider-den",
    "toll-raider",
    stonebridgeExamine,
    "fighter-rules-v3",
  ],
];
const rulesOf = (module) => module[5];

/** Fights the basic opponent and walks the peaceful route on 64 seeds;
 * returns how many seeds the character survives the fight. A character
 * carrying a healing draught drinks it on its turn once at 5 HP or less. */
function qualify(loaded, [file, , entry, opponent, peaceful], base, level) {
  let surviving = 0;
  for (let seed = 0; seed < 64; seed++) {
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
      turn < 100 && state.status === "playing" && state.combat !== undefined;
      turn++
    ) {
      const low =
        state.fighter.hp <= 5 &&
        Object.entries(state.items ?? {}).some(
          ([id, place]) => id.startsWith("carried-") && place === "inventory",
        );
      apply(low ? "use healing draught" : "attack " + opponent);
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
    const check = file.startsWith("hollow-beacon") ? "read-beacon" : undefined;
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
    // An unused draught is still carried at the end.
    assert.deepEqual(
      state.characterResult.inventory?.items,
      sheet.inventory?.items,
    );
  }
  return surviving;
}

for (const module of MODULES) {
  const [file, levels] = module;
  test(`${file}: recommended bounds and all presets qualify across 64 seeds`, async () => {
    const loaded = loadAdventure(await readFile(`adventures/${file}.json`));
    assert.equal(loaded.ok, true);
    for (const level of levels) {
      for (const preset of ["balanced", "stout", "scout"]) {
        const surviving = qualify(
          loaded,
          module,
          createCharacter("Sample", preset, undefined, rulesOf(module)),
          level,
        );
        assert.ok(
          surviving >= 51,
          `${file} ${preset} level ${level}: ${surviving}/64 survival must remain at least 80% on the basic fight`,
        );
      }
    }
  });

  // Combat uses only the Strength, Dexterity and Constitution modifiers, so one
  // score per modifier band covers every roll the Fighter minimums allow. The
  // other abilities sit at 3, the lowest roll, for the peaceful route (#118).
  test(`${file}: every rolled Fighter meeting the minimums qualifies across 64 seeds`, async () => {
    const loaded = loadAdventure(await readFile(`adventures/${file}.json`));
    assert.equal(loaded.ok, true);
    const dice = {
      3: [1, 1, 1],
      7: [1, 3, 3],
      9: [3, 3, 3],
      13: [4, 4, 5],
      16: [5, 5, 6],
      18: [6, 6, 6],
    };
    for (const level of levels) {
      for (const strength of [9, 13, 16, 18]) {
        for (const dexterity of [9, 13, 16, 18]) {
          for (const constitution of [7, 9, 13, 16, 18]) {
            const base = createRolledCharacter(
              "Sample",
              {
                strength: dice[strength],
                dexterity: dice[dexterity],
                constitution: dice[constitution],
                intelligence: dice[3],
                wisdom: dice[3],
                charisma: dice[3],
              },
              undefined,
              rulesOf(module) ?? "fighter-rules-v2",
            );
            const surviving = qualify(loaded, module, base, level);
            assert.ok(
              surviving >= 51,
              `${file} rolled STR ${strength} DEX ${dexterity} CON ${constitution} level ${level}: ${surviving}/64 survival must remain at least 80% on the basic fight`,
            );
          }
        }
      }
    }
  });
}

// The minimums are needed: one Strength or Dexterity band lower, or the lowest
// Constitution, fails the level 1 fight. Version 1 sheets accept any scores and
// share version 2 play rules, so they stand in for the refused rolls (#118).
test("hollow-beacon-characters: rolls below the Fighter minimums fail level 1", async () => {
  const loaded = loadAdventure(
    await readFile("adventures/hollow-beacon-characters.json"),
  );
  for (const [strength, dexterity, constitution] of [
    [8, 9, 7],
    [9, 8, 7],
    [9, 9, 3],
  ]) {
    const base = {
      ...createCharacter("Sample", "balanced", "0".repeat(32)),
      abilities: {
        strength,
        dexterity,
        constitution,
        intelligence: 3,
        wisdom: 3,
        charisma: 3,
      },
    };
    const surviving = qualify(
      loaded,
      MODULES[0],
      { ...base, hp: characterProfile(base).maxHp },
      1,
    );
    assert.ok(
      surviving < 51,
      `STR ${strength} DEX ${dexterity} CON ${constitution}: ${surviving}/64`,
    );
  }
});

// A carried draught never decides balance: each loot release qualifies with or
// without one, and one draught adds at most a little survival. Drinking costs a
// turn, so on a few seeds it does not help at all (#119).
for (const module of MODULES.filter((entry) => rulesOf(entry))) {
  const [file, levels] = module;
  test(`${file}: a carried healing draught adds only a little survival`, async () => {
    const loaded = loadAdventure(await readFile(`adventures/${file}.json`));
    for (const level of levels) {
      for (const preset of ["balanced", "stout", "scout"]) {
        const base = createCharacter(
          "Sample",
          preset,
          undefined,
          "fighter-rules-v3",
        );
        const without = qualify(loaded, module, base, level);
        const carrying = qualify(
          loaded,
          module,
          { ...base, inventory: { silver: 0, items: ["healing-draught"] } },
          level,
        );
        assert.ok(
          carrying >= 51 && carrying - without <= 6,
          `${file} ${preset} level ${level}: ${without}/64 without, ${carrying}/64 with a draught`,
        );
      }
    }
  });
}
