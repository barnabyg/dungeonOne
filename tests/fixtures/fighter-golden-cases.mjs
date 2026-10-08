/**
 * The Fighter golden cases (#300): every derived number of a Fighter, for
 * three sets of dice, Strength-first and Dexterity-first, at every level 1–5
 * (level 4 and 5 both owing and having made the level choice), for every
 * Fighting Style and a range of loadouts. The fixture
 * `fighter-golden.json` holds a digest of each case, recorded from the
 * hard-coded Fighter before it became class data, and a few cases in full.
 *
 * `api` adapts the character module: `build(dice, choices)`, `defaults`,
 * `styles`, `validate`, `profile`, `carrying`, `levelForXp`,
 * `defaultPlacement`, `applyLevelChoice`, `pendingLevelChoice`,
 * `levelUpChanges` and `projectCreation`.
 */
import { createHash } from "node:crypto";

export const GOLDEN_DICE = {
  ada: [
    [5, 5, 5, 1],
    [5, 5, 4, 1],
    [5, 4, 4, 1],
    [4, 4, 4, 1],
    [3, 3, 4, 1],
    [3, 3, 3, 1],
  ],
  low: [
    [2, 2, 1, 1],
    [3, 2, 1, 1],
    [1, 1, 1, 1],
    [2, 3, 1, 1],
    [4, 1, 1, 1],
    [3, 3, 1, 1],
  ],
  high: [
    [6, 6, 6, 6],
    [6, 6, 5, 2],
    [6, 5, 5, 1],
    [5, 5, 5, 5],
    [4, 4, 3, 2],
    [6, 6, 6, 1],
  ],
};

const LOADOUTS = {
  mace: ["leather", "mace"],
  "two-daggers": ["leather", "dagger", "dagger"],
  "club-and-dagger": ["leather", "club", "dagger"],
  longsword: ["chain-mail", "longsword"],
  "longsword-shield": ["chain-mail", "shield", "longsword"],
  greatsword: ["plate", "greatsword"],
  shortbow: ["leather", "shortbow"],
  "light-crossbow": ["chain-shirt", "light-crossbow"],
  longbow: ["leather", "longbow"],
  unarmoured: ["shortsword"],
};

/** [name, XP, whether the level choice is made]. */
const STAGES = [
  ["1", 0, false],
  ["2", 300, false],
  ["3", 900, false],
  ["4-owing", 2700, false],
  ["4", 2700, true],
  ["5-owing", 6500, false],
  ["5", 6500, true],
];

/** Sorted keys, so a digest does not depend on the order fields are built in. */
export function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

export function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")
    .slice(0, 16);
}

export function goldenCases(api) {
  const cases = [];
  for (const [diceId, dice] of Object.entries(GOLDEN_DICE)) {
    for (const archer of [false, true]) {
      const placement = api.defaultPlacement(dice);
      const base = api.build(dice, {
        ...api.defaults,
        placement: archer
          ? {
              ...placement,
              strength: placement.dexterity,
              dexterity: placement.strength,
            }
          : placement,
        increase: archer
          ? { dexterity: 2, constitution: 1 }
          : api.defaults.increase,
      });
      for (const [stage, xp, choose] of STAGES) {
        const raised = { ...base, xp, level: api.levelForXp(xp) };
        let sheet = api.validate({
          ...raised,
          hp: api.profile(raised).maxHp,
        });
        if (choose) {
          sheet = api.applyLevelChoice(sheet, {
            increase: { constitution: 1, intelligence: 1 },
            mastery: "longsword",
          });
        }
        for (const style of api.styles) {
          for (const [loadout, equipment] of Object.entries(LOADOUTS)) {
            const each = api.validate({
              ...sheet,
              fightingStyle: style,
              equipment,
            });
            cases.push({
              id: `${diceId}${archer ? "-archer" : ""}/${stage}/${style}/${loadout}`,
              profile: api.profile(each),
              carrying: api.carrying(each),
              pendingLevelChoice: api.pendingLevelChoice(each) ?? null,
            });
          }
        }
      }
    }
  }
  const ada = api.build(GOLDEN_DICE.ada, {
    ...api.defaults,
    placement: api.defaultPlacement(GOLDEN_DICE.ada),
  });
  const levelUps = [
    [0, 300],
    [300, 900],
    [900, 2700],
    [2700, 6500],
    [0, 6500],
  ].map(([from, to]) => ({
    from,
    to,
    changes: api.levelUpChanges(
      { ...ada, xp: from, level: api.levelForXp(from) },
      { ...ada, xp: to, level: api.levelForXp(to) },
    ),
  }));
  const creation = api.projectCreation(GOLDEN_DICE.ada, {
    ...api.defaults,
    placement: api.defaultPlacement(GOLDEN_DICE.ada),
  });
  return { cases, levelUps, creation };
}
