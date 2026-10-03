/**
 * Supported-release policy for the browser launcher.
 *
 * Each row is one released, bundled adventure file and its exact tuple:
 * adventure ID, content version, rules version and schema. `mode` names the
 * browser mode that plays it: the default character library (`character`)
 * or the `--legacy` single save slot (`single-slot`). Rows with `starts`
 * are offered for new adventures. Other rows exist only so occupied saves
 * keep continuing.
 *
 * An occupied save continues only when its saved tuple exactly matches a
 * row of its mode. It plays from its own saved snapshot, which the save
 * authority checks against its recorded digest. Saves are deliberately not
 * pinned to the bundled file's digest, so a save made before a release file's
 * last correction stays readable. Nothing is migrated or reinterpreted.
 *
 * A new content release appends a row with `starts` and removes `starts` from
 * the release it supersedes. Existing tuples never change.
 */
import { fileURLToPath } from "node:url";
import { loadAdventureFile } from "./adventure-file.js";
import type { ValidatedAdventure } from "./adventure-loader.js";
import type { AdventureRuntime } from "./runtime-contract.js";

export type BrowserRelease = Readonly<{
  id: string;
  version: string;
  rulesVersion: string;
  schemaVersion: number;
  file: string;
  mode: "character" | "single-slot";
  starts: boolean;
}>;

const singleSlot = (
  version: string,
  rulesVersion: string,
  schemaVersion: number,
  file: string,
  starts = false,
): BrowserRelease => ({
  id: "hollow-beacon",
  version,
  rulesVersion,
  schemaVersion,
  file,
  mode: "single-slot",
  starts,
});

export const BROWSER_RELEASES: readonly BrowserRelease[] = [
  {
    id: "hollow-beacon",
    version: "12",
    rulesVersion: "character-adventure-rules-v1",
    schemaVersion: 17,
    file: "hollow-beacon-characters.json",
    mode: "character",
    starts: false,
  },
  {
    id: "hollow-beacon",
    version: "13",
    rulesVersion: "character-adventure-rules-v2",
    schemaVersion: 17,
    file: "hollow-beacon-examine.json",
    mode: "character",
    starts: false,
  },
  {
    id: "hollow-beacon",
    version: "14",
    rulesVersion: "character-adventure-rules-v2",
    schemaVersion: 17,
    file: "hollow-beacon-story.json",
    mode: "character",
    starts: true,
  },
  {
    id: "stonebridge",
    version: "1",
    rulesVersion: "character-adventure-rules-v1",
    schemaVersion: 17,
    file: "stonebridge-characters.json",
    mode: "character",
    starts: true,
  },
  singleSlot("4", "chapel-clues-rules-v11", 10, "hollow-beacon-watch.json"),
  singleSlot("5", "chapel-clues-rules-v11", 10, "hollow-beacon-refugees.json"),
  singleSlot("6", "chapel-clues-rules-v12", 11, "hollow-beacon-trust.json"),
  singleSlot("7", "chapel-clues-rules-v13", 12, "hollow-beacon-threat.json"),
  singleSlot("8", "chapel-clues-rules-v14", 13, "hollow-beacon-recovery.json"),
  singleSlot("9", "chapel-clues-rules-v15", 14, "hollow-beacon-component.json"),
  singleSlot(
    "10",
    "chapel-clues-rules-v16",
    15,
    "hollow-beacon-confrontation.json",
  ),
  singleSlot(
    "11",
    "chapel-clues-rules-v17",
    16,
    "hollow-beacon-finale.json",
    true,
  ),
];

const SINGLE_SLOT = BROWSER_RELEASES.filter(
  ({ mode }) => mode === "single-slot",
);

/** The Hollow Beacon version a `--legacy` empty slot or New game starts. */
export const BROWSER_START_VERSION = SINGLE_SLOT.find(
  ({ starts }) => starts,
)!.version;

export type BrowserReleasePolicy = Readonly<{
  /** Validated content for new `--legacy` slots. */
  start: ValidatedAdventure;
  /** Throws, without changing anything, unless the save may be continued. */
  assertContinuable(runtime: AdventureRuntime): void;
}>;

const UNSUPPORTED_SAVE = `This browser continues only listed releases: ${BROWSER_RELEASES.map(
  (release) =>
    `${release.id} ${release.version} (${release.rulesVersion}/schema ${release.schemaVersion}, ${release.mode})`,
).join(", ")}. The occupied slot was left unchanged; select another save path.`;

function isListed(runtime: AdventureRuntime): boolean {
  const character = runtime.startingCharacter !== undefined;
  return BROWSER_RELEASES.some(
    (release) =>
      release.mode === (character ? "character" : "single-slot") &&
      release.id === runtime.id &&
      release.version === runtime.version &&
      release.rulesVersion === runtime.rulesVersion &&
      release.schemaVersion === runtime.content?.snapshot.schemaVersion &&
      (!character || runtime.engineVersion === "character-adventure-engine-v1"),
  );
}

async function loadRelease(
  release: BrowserRelease,
): Promise<ValidatedAdventure> {
  const loaded = await loadAdventureFile(
    fileURLToPath(new URL(`../adventures/${release.file}`, import.meta.url)),
  );
  if (
    !loaded.ok ||
    loaded.adventure.snapshot.id !== release.id ||
    loaded.adventure.snapshot.contentVersion !== release.version ||
    loaded.adventure.snapshot.rulesVersion !== release.rulesVersion ||
    loaded.adventure.snapshot.schemaVersion !== release.schemaVersion
  ) {
    throw new Error(`Invalid bundled adventure release: ${release.file}.`);
  }
  return loaded.adventure;
}

/** Validated content of every character release offered for new adventures. */
export async function startableCharacterAdventures(): Promise<
  readonly ValidatedAdventure[]
> {
  return Promise.all(
    BROWSER_RELEASES.filter(
      ({ mode, starts }) => mode === "character" && starts,
    ).map(loadRelease),
  );
}

/**
 * Loads and verifies every bundled release, rejecting a file whose declared
 * tuple differs from its row, and returns the policy for one launcher.
 */
export async function browserReleasePolicy(
  startVersion: string,
): Promise<BrowserReleasePolicy> {
  const loaded = await Promise.all(BROWSER_RELEASES.map(loadRelease));
  const start = loaded.find(
    (_, index) =>
      BROWSER_RELEASES[index]!.mode === "single-slot" &&
      BROWSER_RELEASES[index]!.version === startVersion,
  );
  if (start === undefined) {
    throw new Error(`Hollow Beacon ${startVersion} is not a browser release.`);
  }
  return {
    start,
    assertContinuable(runtime) {
      if (!isListed(runtime)) {
        throw new Error(UNSUPPORTED_SAVE);
      }
    },
  };
}
