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
} as const satisfies Record<string, SettingDefinition>;

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
