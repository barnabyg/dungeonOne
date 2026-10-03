/**
 * Supported-release policy for the single-slot Hollow Beacon browser launcher.
 *
 * An empty slot or a confirmed New game starts {@link BROWSER_START_VERSION}.
 * An occupied slot continues only when its saved tuple (adventure ID, content
 * version, rules version and schema) exactly matches a listed release. The slot
 * plays from its own saved, digest-verified snapshot; nothing is migrated or
 * reinterpreted. Slot content is deliberately not pinned to the bundled file's
 * digest, so a save made before a release file's last correction stays readable.
 * A new content release appends a row and moves the start version deliberately;
 * existing rows never change.
 */
import { fileURLToPath } from "node:url";
import { loadAdventureFile } from "./adventure-file.js";
import type { ValidatedAdventure } from "./adventure-loader.js";
import type { AdventureRuntime } from "./runtime-contract.js";

export const BROWSER_RELEASES = [
  {
    version: "4",
    rulesVersion: "chapel-clues-rules-v11",
    schemaVersion: 10,
    file: "hollow-beacon-watch.json",
  },
  {
    version: "5",
    rulesVersion: "chapel-clues-rules-v11",
    schemaVersion: 10,
    file: "hollow-beacon-refugees.json",
  },
  {
    version: "6",
    rulesVersion: "chapel-clues-rules-v12",
    schemaVersion: 11,
    file: "hollow-beacon-trust.json",
  },
  {
    version: "7",
    rulesVersion: "chapel-clues-rules-v13",
    schemaVersion: 12,
    file: "hollow-beacon-threat.json",
  },
  {
    version: "8",
    rulesVersion: "chapel-clues-rules-v14",
    schemaVersion: 13,
    file: "hollow-beacon-recovery.json",
  },
  {
    version: "9",
    rulesVersion: "chapel-clues-rules-v15",
    schemaVersion: 14,
    file: "hollow-beacon-component.json",
  },
  {
    version: "10",
    rulesVersion: "chapel-clues-rules-v16",
    schemaVersion: 15,
    file: "hollow-beacon-confrontation.json",
  },
  {
    version: "11",
    rulesVersion: "chapel-clues-rules-v17",
    schemaVersion: 16,
    file: "hollow-beacon-finale.json",
  },
] as const;

export type BrowserReleaseVersion =
  (typeof BROWSER_RELEASES)[number]["version"];

/** The release the launcher starts for an empty slot or confirmed New game. */
export const BROWSER_START_VERSION: BrowserReleaseVersion = "11";

const UNSUPPORTED_SLOT = `This browser continues only bundled Hollow Beacon releases: ${BROWSER_RELEASES.map(
  (release) =>
    `version ${release.version} with ${release.rulesVersion}/schema ${release.schemaVersion}`,
).join(
  ", ",
)}, or a character adventure from its library. The occupied slot was left unchanged; select another save path.`;

export type BrowserReleasePolicy = Readonly<{
  /** Validated content for new slots. */
  start: ValidatedAdventure;
  /** Throws, without changing anything, unless the slot may be continued. */
  assertContinuable(runtime: AdventureRuntime): void;
}>;

function isCharacterAdventure(runtime: AdventureRuntime): boolean {
  return (
    runtime.content?.snapshot.schemaVersion === 17 &&
    runtime.engineVersion === "character-adventure-engine-v1" &&
    runtime.startingCharacter !== undefined &&
    ((runtime.id === "hollow-beacon" && runtime.version === "12") ||
      (runtime.id === "stonebridge" && runtime.version === "1"))
  );
}

const ADVENTURE_ID = "hollow-beacon";

function matchesRelease(
  tuple: Readonly<{
    id: string;
    version: string;
    rulesVersion: string;
    schemaVersion: number | undefined;
  }>,
): boolean {
  return BROWSER_RELEASES.some(
    (release) =>
      tuple.id === ADVENTURE_ID &&
      tuple.version === release.version &&
      tuple.rulesVersion === release.rulesVersion &&
      tuple.schemaVersion === release.schemaVersion,
  );
}

/**
 * Loads and verifies every bundled release, rejecting a file whose declared
 * tuple differs from its policy row.
 */
export async function browserReleasePolicy(
  startVersion: BrowserReleaseVersion,
): Promise<BrowserReleasePolicy> {
  let start: ValidatedAdventure | undefined;
  for (const release of BROWSER_RELEASES) {
    const loaded = await loadAdventureFile(
      fileURLToPath(new URL(`../adventures/${release.file}`, import.meta.url)),
    );
    if (!loaded.ok) {
      throw new Error("The bundled Hollow Beacon adventure is invalid.");
    }
    const { snapshot } = loaded.adventure;
    if (
      snapshot.contentVersion !== release.version ||
      !matchesRelease({
        id: snapshot.id,
        version: snapshot.contentVersion,
        rulesVersion: snapshot.rulesVersion,
        schemaVersion: snapshot.schemaVersion,
      })
    ) {
      throw new Error("The bundled Hollow Beacon adventure is invalid.");
    }
    if (release.version === startVersion) {
      start = loaded.adventure;
    }
  }
  if (start === undefined) {
    throw new Error(`Hollow Beacon ${startVersion} is not a browser release.`);
  }
  return {
    start,
    assertContinuable(runtime) {
      if (
        !isCharacterAdventure(runtime) &&
        !matchesRelease({
          id: runtime.id,
          version: runtime.version,
          rulesVersion: runtime.rulesVersion,
          schemaVersion: runtime.content?.snapshot.schemaVersion,
        })
      ) {
        throw new Error(UNSUPPORTED_SLOT);
      }
    },
  };
}
