import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  artworkForLocation,
  loadBrowserArtwork,
} from "../dist/browser-artwork.js";

const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1EAAAAASUVORK5CYII=";

test("artwork is scoped to an adventure version and does not expose unvisited locations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-artwork-"));
  const manifestPath = join(directory, "artwork.json");
  const manifest = {
    adventureId: "another-adventure",
    version: "2",
    locations: [
      { id: "grotto", file: "grotto.png", alt: "The grotto entrance" },
    ],
  };
  try {
    await writeFile(
      join(directory, "grotto.png"),
      Buffer.from(pixel, "base64"),
    );
    await writeFile(manifestPath, JSON.stringify(manifest));
    const pack = await loadBrowserArtwork(manifestPath);
    const adventure = { id: "another-adventure", version: "2" };
    assert.deepEqual(artworkForLocation(pack, adventure, "grotto"), {
      src: "data:image/png;base64," + pixel,
      alt: "The grotto entrance",
    });
    assert.equal(
      artworkForLocation(pack, { ...adventure, id: "hollow-beacon" }, "grotto"),
      undefined,
    );
    assert.equal(
      artworkForLocation(pack, { ...adventure, version: "1" }, "grotto"),
      undefined,
    );
    assert.equal(artworkForLocation(pack, adventure, "secret-room"), undefined);
    assert.equal(artworkForLocation(undefined, adventure, "grotto"), undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("artwork rejects duplicate IDs, remote files, folder escapes and non-raster content", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-artwork-invalid-"));
  try {
    const manifestPath = join(directory, "artwork.json");
    const entry = { id: "grotto", file: "grotto.png", alt: "Grotto" };
    const manifest = {
      adventureId: "another-adventure",
      version: "2",
      locations: [entry],
    };
    await writeFile(
      join(directory, "grotto.png"),
      Buffer.from(pixel, "base64"),
    );
    await writeFile(
      join(directory, "code.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    for (const locations of [
      [entry, entry],
      [{ ...entry, file: "https://example.com/art.png" }],
      [{ ...entry, file: "..\\outside.png" }],
      [{ ...entry, file: "code.svg" }],
      [{ ...entry, alt: "" }],
    ]) {
      await writeFile(manifestPath, JSON.stringify({ ...manifest, locations }));
      await assert.rejects(loadBrowserArtwork(manifestPath));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
