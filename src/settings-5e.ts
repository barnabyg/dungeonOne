/**
 * Game settings (#506): the choices a player makes on the Settings page, kept
 * in `settings.json` beside the character library (format version 1).
 *
 * The defaults are the game as balanced: the gate, the harness, the career
 * simulation, the DM evaluations and the CLI always play at them. Starting an
 * adventure copies the full set into its session, which plays by that copy
 * to the end, whatever the file says later.
 *
 * A setting missing from the file is at its default, so adding a setting
 * leaves older files readable; changing a setting's meaning or values bumps
 * the format. A malformed file, an unknown key, a value a setting doesn't
 * offer or another format version is refused with a message that names the
 * file. A missing file is every default.
 */
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeFileAtomically } from "./atomic-file.js";
import { parseBoundedJson } from "./bounded-json.js";
import { acquireFileLock } from "./file-lock.js";
import {
  OPENAI_DM_DEFAULT_MODEL,
  OPENAI_DM_MODELS,
} from "./openai-dm-models.js";

export const SETTINGS_FORMAT = 1;
const MAX_SETTINGS_BYTES = 64 * 1024;

/** One choice a setting offers: its value in the file and how players read it. */
export type SettingChoice = Readonly<{ value: string | number; label: string }>;

export type SettingDefinition = Readonly<{
  name: string;
  /** What the setting changes, in a sentence. */
  text: string;
  choices: readonly SettingChoice[];
  default: string | number;
}>;

/** Every setting, in the order the Settings page shows them. */
export const SETTINGS = {
  carryingCapacity: {
    name: "Carrying capacity",
    text: "How much a character can carry: its Strength score times the pounds chosen, or no limit.",
    choices: [
      { value: 10, label: "Strength × 10 lb" },
      { value: 15, label: "Strength × 15 lb" },
      { value: 20, label: "Strength × 20 lb" },
      { value: 30, label: "Strength × 30 lb" },
      { value: "unlimited", label: "Unlimited" },
    ],
    default: 15,
  },
  // Loot and economy (#507).
  treasureFound: {
    name: "Treasure found",
    text: "What coin, gems and art objects are worth when found: the coin taken and each gem or art object's value. Potions, scrolls, gear and magic items are unchanged.",
    choices: [
      { value: 50, label: "50%" },
      { value: 100, label: "100%" },
      { value: 150, label: "150%" },
      { value: 200, label: "200%" },
    ],
    default: 100,
  },
  itemsFound: {
    name: "Items found",
    text: "Whether every potion, scroll, wand and piece of gear an adventure hides is there, or each is missing with an even chance. Coin, gems, art, keys, tools and anything a way on needs are always there.",
    choices: [
      { value: "normal", label: "Normal" },
      { value: "scarce", label: "Scarce" },
    ],
    default: "normal",
  },
  merchantPrices: {
    name: "Merchant prices",
    text: "What merchants charge for what they sell, ammunition included, as a multiple of the catalogue price.",
    choices: [
      { value: 0.5, label: "× 0.5" },
      { value: 0.75, label: "× 0.75" },
      { value: 1, label: "× 1" },
      { value: 1.5, label: "× 1.5" },
      { value: 2, label: "× 2" },
    ],
    default: 1,
  },
  merchantBuyBack: {
    name: "Merchant buy-back",
    text: "What merchants pay for gear and ammunition, as a share of the catalogue price. Gems and art objects always sell for their full value.",
    choices: [
      { value: 25, label: "25%" },
      { value: 50, label: "50%" },
      { value: 75, label: "75%" },
      { value: 100, label: "100%" },
    ],
    default: 50,
  },
  startingCoin: {
    name: "Starting coin",
    text: "The coin in a new character's purse when it is saved. Characters saved before keep their purses.",
    choices: [
      { value: 0, label: "None" },
      { value: 10, label: "10 gp" },
      { value: 25, label: "25 gp" },
      { value: 50, label: "50 gp" },
    ],
    default: 0,
  },
  // Survival (#508).
  shortRests: {
    name: "Short rests per adventure",
    text: "How many short rests a character may take in an adventure, or in each region of a long one.",
    choices: [
      { value: 0, label: "0" },
      { value: 1, label: "1" },
      { value: 2, label: "2" },
      { value: 3, label: "3" },
      { value: 4, label: "4" },
      { value: "unlimited", label: "Unlimited" },
    ],
    default: 2,
  },
  longRest: {
    name: "Long rest at rest sites",
    text: "Whether a character may take a long rest at the safe places to rest that an adventure marks.",
    choices: [
      { value: "on", label: "On" },
      { value: "off", label: "Off" },
    ],
    default: "on",
  },
  lastStand: {
    name: "Last Stand",
    text: "Whether a character an attack brings to 0 HP may drink a potion with its reaction instead of falling, and the death saving throw it needs first.",
    choices: [
      { value: "off", label: "Off" },
      { value: 11, label: "DC 11" },
      { value: 10, label: "DC 10 (the SRD's)" },
      { value: "automatic", label: "Automatic (no death save)" },
    ],
    default: 11,
  },
  opponentHp: {
    name: "Opponent hit points",
    text: "Each opponent's hit points, as a share of its stat block's, rounded up. Its XP is unchanged.",
    choices: [
      { value: 75, label: "75%" },
      { value: 100, label: "100%" },
      { value: 125, label: "125%" },
      { value: 150, label: "150%" },
    ],
    default: 100,
  },
  wandering: {
    name: "Wandering encounters",
    text: "Whether wandering encounters and their omens come: Double doubles each table's chance, up to 100.",
    choices: [
      { value: "off", label: "Off" },
      { value: "normal", label: "Normal" },
      { value: "double", label: "Double chance" },
    ],
    default: "normal",
  },
  fleeAttacks: {
    name: "Fleeing draws attacks",
    text: "Whether each opponent gets an attack on a character fleeing a fight.",
    choices: [
      { value: "on", label: "On" },
      { value: "off", label: "Off" },
    ],
    default: "on",
  },
  morale: {
    name: "Morale",
    text: "How readily opponents lose their nerve and flee or surrender. Undead and mindless creatures never do.",
    choices: [
      { value: "never", label: "Never flee" },
      { value: "normal", label: "Normal" },
      { value: "easily", label: "Flee easily (morale DC +2)" },
    ],
    default: "normal",
  },
  // How a new character's ability scores are made (#509); a creation already
  // started keeps the method it started with.
  abilityScores: {
    name: "Ability scores",
    text: "How a new character's ability scores are made. A creation already started keeps its method and dice.",
    choices: [
      { value: "roll", label: "4d6 drop lowest" },
      {
        value: "standard-array",
        label: "Standard array (15, 14, 13, 12, 10, 8)",
      },
      { value: "point-buy", label: "Point buy (27 points)" },
      { value: "roll-reroll", label: "4d6 drop lowest, one reroll" },
    ],
    default: "roll",
  },
  // Every XP award credited when an adventure settles, scaled and rounded
  // down (#509).
  xpRate: {
    name: "XP rate",
    text: "Every XP award an adventure credits is multiplied by this and rounded down. Levels still follow the XP table.",
    choices: [
      { value: 0.5, label: "× 0.5" },
      { value: 1, label: "× 1" },
      { value: 1.5, label: "× 1.5" },
      { value: 2, label: "× 2" },
    ],
    default: 1,
  },
  // The model the AI DM answers a typed message with (#510): the session
  // records it with the rest, so an adventure keeps its model to the end.
  dmModel: {
    name: "Dungeon Master model",
    text: "The OpenAI model the AI Dungeon Master answers with when you type to it.",
    choices: OPENAI_DM_MODELS.map((model) => ({ value: model, label: model })),
    default: OPENAI_DM_DEFAULT_MODEL,
  },
} as const satisfies Record<string, SettingDefinition>;

/** How a new character's ability scores are made (#509). */
export type AbilityMethod =
  (typeof SETTINGS)["abilityScores"]["choices"][number]["value"];

/** The ability-score methods, in the Settings page's order (#509). */
export const ABILITY_METHODS: readonly AbilityMethod[] =
  SETTINGS.abilityScores.choices.map(({ value }) => value);

/** An XP award at `rate` (#509): scaled, rounded down. */
export function scaleXp(
  xp: number,
  rate: (typeof SETTINGS)["xpRate"]["choices"][number]["value"],
): number {
  return Math.floor(xp * rate);
}

export type SettingId = keyof typeof SETTINGS;

export const SETTING_IDS = Object.keys(SETTINGS) as SettingId[];

/** A full set of settings: one offered value for each. */
export type GameSettings = {
  readonly [Id in SettingId]: (typeof SETTINGS)[Id]["choices"][number]["value"];
};

export const DEFAULT_SETTINGS: GameSettings = Object.fromEntries(
  SETTING_IDS.map((id) => [id, SETTINGS[id].default]),
) as GameSettings;

/** Whether `value` is one of the values setting `id` offers. */
export function isSettingValue(id: SettingId, value: unknown): boolean {
  return (SETTINGS[id].choices as readonly SettingChoice[]).some(
    (choice) => choice.value === value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * `value` as settings, every missing setting at its default. Throws `refuse`
 * for an unknown key or a value its setting doesn't offer; with `complete`,
 * also for a missing setting (a session's copy holds every one).
 */
export function readSettings(
  value: unknown,
  refuse: (problem: string) => Error,
  complete = false,
): GameSettings {
  if (!isRecord(value)) {
    throw refuse("its settings are not a JSON object");
  }
  for (const [key, entry] of Object.entries(value)) {
    if (!(SETTING_IDS as readonly string[]).includes(key)) {
      throw refuse(`it has an unknown setting "${key}"`);
    }
    if (!isSettingValue(key as SettingId, entry)) {
      throw refuse(
        `its ${SETTINGS[key as SettingId].name.toLowerCase()} is ${JSON.stringify(entry)}, which is not one of the choices`,
      );
    }
  }
  if (complete) {
    const absent = SETTING_IDS.find((id) => !(id in value));
    if (absent !== undefined) {
      throw refuse(`it has no ${SETTINGS[absent].name.toLowerCase()}`);
    }
  }
  return { ...DEFAULT_SETTINGS, ...value } as GameSettings;
}

/** The settings file for the character library at `libraryPath`. */
export function settingsPathFor(libraryPath: string): string {
  return join(dirname(libraryPath), "settings.json");
}

type SettingsFile = Readonly<{
  kind: "dungeon-one-settings";
  formatVersion: typeof SETTINGS_FORMAT;
  settings: Partial<GameSettings>;
}>;

/** The settings file at `path`: read, changed one setting at a time, reset. */
export class FifthSettingsStore {
  constructor(readonly path: string) {}

  private refused(problem: string): Error {
    return new Error(
      `${this.path} is not a settings file this build can read: ${problem}. Move it aside to play at the default settings; the file has not been changed.`,
    );
  }

  async read(): Promise<GameSettings> {
    let bytes: Buffer;
    try {
      bytes = await readFile(this.path);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return DEFAULT_SETTINGS;
      }
      throw error;
    }
    let data: unknown;
    try {
      data = parseBoundedJson(bytes, MAX_SETTINGS_BYTES, 8);
    } catch {
      throw this.refused("it is not valid JSON");
    }
    if (!isRecord(data) || data.kind !== "dungeon-one-settings") {
      throw this.refused("it is not a Dungeon One settings file");
    }
    if (data.formatVersion !== SETTINGS_FORMAT) {
      throw this.refused(
        `it is in format version ${String(data.formatVersion)}, not ${SETTINGS_FORMAT}`,
      );
    }
    if (Object.keys(data).sort().join(",") !== "formatVersion,kind,settings") {
      throw this.refused("it has fields a settings file doesn't");
    }
    return readSettings(data.settings, (problem) => this.refused(problem));
  }

  /** Sets setting `id` to `value`, refusing a value it doesn't offer. */
  async change(id: unknown, value: unknown): Promise<GameSettings> {
    if (
      typeof id !== "string" ||
      !(SETTING_IDS as readonly string[]).includes(id)
    ) {
      throw new Error("There is no such setting.");
    }
    if (!isSettingValue(id as SettingId, value)) {
      throw new Error(`${SETTINGS[id as SettingId].name} has no such choice.`);
    }
    return this.write((settings) => ({ ...settings, [id]: value }));
  }

  /** Puts every setting back to its default. */
  async reset(): Promise<GameSettings> {
    return this.write(() => DEFAULT_SETTINGS);
  }

  private async write(
    change: (settings: GameSettings) => GameSettings,
  ): Promise<GameSettings> {
    await mkdir(dirname(this.path), { recursive: true });
    const release = await acquireFileLock(this.path);
    try {
      const settings = change(await this.read());
      const file: SettingsFile = {
        kind: "dungeon-one-settings",
        formatVersion: SETTINGS_FORMAT,
        settings,
      };
      await writeFileAtomically(
        this.path,
        `${JSON.stringify(file, null, 2)}\n`,
      );
      return settings;
    } finally {
      await release();
    }
  }
}

/** How the Settings page shows the settings: each with its choices, in order. */
export function settingsView(settings: GameSettings) {
  return SETTING_IDS.map((id) => {
    const setting: SettingDefinition = SETTINGS[id];
    return {
      id,
      name: setting.name,
      text: setting.text,
      value: settings[id],
      choices: setting.choices.map(({ value, label }) => ({
        value,
        label,
        ...(value === setting.default ? { default: true } : {}),
      })),
    };
  });
}
