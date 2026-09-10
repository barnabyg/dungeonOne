import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");

function runCli(input) {
  return spawnSync(process.execPath, [cli], {
    cwd: root,
    encoding: "utf8",
    input,
    timeout: 5_000,
  });
}

test("built game starts at the entrance, offers help, and quits cleanly", () => {
  const result = runCli("help\nstatus\ninventory\nquit\n");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /The Stolen Signet/i);
  assert.match(result.stdout, /entrance/i);
  assert.match(result.stdout, /type [\"']help[\"']/i);
  assert.match(
    result.stdout,
    /Available commands:[\s\S]*look[\s\S]*inspect <target>[\s\S]*move <location>[\s\S]*status[\s\S]*inventory[\s\S]*quit/i,
  );
  assert.match(result.stdout, /HP:\s*20\/20/i);
  assert.match(result.stdout, /Equipped:\s*longsword/i);
  assert.match(result.stdout, /Collectibles:\s*empty/i);
  assert.doesNotMatch(result.stdout, /victory|defeat/i);
});

test("built game visits all rooms, inspects visible features, and backtracks", () => {
  const result = runCli(
    [
      "look",
      "inspect ruined archway",
      "move guardroom",
      "inspect cold hearth",
      "move reliquary",
      "look",
      "move guardroom",
      "move entrance",
      "quit",
      "",
    ].join("\n"),
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Entrance[\s\S]*Visible features:[^\n]*ruined archway/i,
  );
  assert.match(result.stdout, /Exits:[^\n]*guardroom/i);
  assert.match(result.stdout, /crest of the old watch/i);
  assert.match(result.stdout, /Guardroom[\s\S]*cold hearth/i);
  assert.match(result.stdout, /Reliquary[\s\S]*stone pedestal/i);
  assert.match(result.stdout, /Exits:[^\n]*entrance[^\n]*reliquary/i);
  assert.match(result.stdout, /Guardroom[\s\S]*Entrance/i);
});

test("built game recovers from malformed, invisible, and illegal commands", () => {
  const result = runCli(
    "\ndance\ninspect\ninspect pedestal\nmove\nmove cellar\nmove reliquary\nlook\nquit\n",
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /enter a command/i);
  assert.match(result.stdout, /don't understand [\"']dance[\"']/i);
  assert.match(result.stdout, /inspect <target>/i);
  assert.match(result.stdout, /can't see [\"']pedestal[\"']/i);
  assert.match(result.stdout, /move <location>/i);
  assert.match(result.stdout, /don't know a location named [\"']cellar[\"']/i);
  assert.match(result.stdout, /reliquary isn't adjacent/i);
  assert.match(result.stdout, /Entrance/i);
});

test("built game exits cleanly on EOF without an outcome", () => {
  const result = runCli("");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /entrance/i);
  assert.doesNotMatch(result.stdout, /victory|defeat/i);
});
