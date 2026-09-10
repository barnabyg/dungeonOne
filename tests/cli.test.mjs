import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");
const winningAttacks = ["attack goblin", "attack goblin", "attack goblin"];

function runCli(input, args = []) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    input,
    timeout: 5_000,
  });
}

test("built game prints one reproducible seed and rejects invalid startup seeds", () => {
  const seeded = runCli("quit\n", ["--seed", "4294967295"]);
  const generated = runCli("quit\n");
  const invalid = runCli("", ["--seed", "-1"]);

  assert.equal(seeded.status, 0, seeded.stderr);
  assert.equal(
    (seeded.stdout.match(/Seed: 4294967295 \(mulberry32-v1\)/g) ?? []).length,
    1,
  );
  assert.equal(generated.status, 0, generated.stderr);
  assert.equal(
    (generated.stdout.match(/Seed: \d+ \(mulberry32-v1\)/g) ?? []).length,
    1,
  );
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /unsigned 32-bit integer/i);
  assert.doesNotMatch(invalid.stdout, /The Stolen Signet/i);
});

test("built game starts at the entrance, offers help, and quits cleanly", () => {
  const result = runCli("help\nstatus\ninventory\nquit\n");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /The Stolen Signet/i);
  assert.match(result.stdout, /entrance/i);
  assert.match(result.stdout, /type [\"']help[\"']/i);
  assert.match(
    result.stdout,
    /Available commands:[\s\S]*look[\s\S]*inspect <target>[\s\S]*move <location>[\s\S]*open <target>[\s\S]*status[\s\S]*inventory[\s\S]*quit/i,
  );
  assert.match(result.stdout, /HP:\s*20\/20/i);
  assert.match(result.stdout, /Equipped:\s*longsword/i);
  assert.match(result.stdout, /Collectibles:\s*empty/i);
  assert.doesNotMatch(result.stdout, /victory|defeat/i);
});

test("built game opens the entrance door, visits all rooms, and backtracks", () => {
  const result = runCli(
    [
      "look",
      "inspect ruined archway",
      "inspect guardroom",
      "move guardroom",
      "inspect wooden door",
      "open",
      "open ruined archway",
      "open wooden door",
      "open wooden door",
      "move guardroom",
      ...winningAttacks,
      "inspect entrance",
      "inspect wooden door",
      "inspect cold hearth",
      "move reliquary",
      "open wooden door",
      "look",
      "move guardroom",
      "move entrance",
      "quit",
      "",
    ].join("\n"),
    ["--seed", "0"],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Entrance[\s\S]*Visible features:[^\n]*ruined archway/i,
  );
  assert.match(result.stdout, /Exits:[^\n]*guardroom/i);
  assert.match(result.stdout, /crest of the old watch/i);
  assert.match(result.stdout, /wooden door to Guardroom is closed/i);
  assert.match(result.stdout, /closed wooden door leads to Guardroom/i);
  assert.match(result.stdout, /weathered iron straps[^\n]*closed/i);
  assert.match(result.stdout, /open <target>/i);
  assert.match(result.stdout, /can't open the ruined archway/i);
  assert.match(result.stdout, /You open the wooden door/i);
  assert.match(result.stdout, /wooden door is already open/i);
  assert.match(result.stdout, /Guardroom[\s\S]*cold hearth/i);
  assert.match(result.stdout, /open wooden door leads to Entrance/i);
  assert.match(result.stdout, /weathered iron straps[^\n]*open/i);
  assert.match(result.stdout, /Reliquary[\s\S]*stone pedestal/i);
  assert.match(result.stdout, /can't see ["']wooden door["'] here/i);
  assert.match(result.stdout, /Exits:[^\n]*entrance[^\n]*reliquary/i);
  assert.match(result.stdout, /Guardroom[\s\S]*Entrance/i);
});

test("built game collects the signet once and keeps it inspectable in inventory", () => {
  const result = runCli(
    [
      "take signet",
      "take",
      "take gem",
      "open wooden door",
      "move guardroom",
      ...winningAttacks,
      "move reliquary",
      "inspect signet",
      "take signet",
      "look",
      "inventory",
      "move guardroom",
      "inspect signet",
      "take signet",
      "quit",
      "",
    ].join("\n"),
    ["--seed", "0"],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /can't see ["']signet["'] here/i);
  assert.match(result.stdout, /take <item>/i);
  assert.match(result.stdout, /can't see ["']gem["'] here/i);
  assert.match(
    result.stdout,
    /Reliquary[\s\S]*Visible items:[^\n]*signet \(on stone pedestal\)/i,
  );
  assert.match(result.stdout, /silver signet[\s\S]*family crest/i);
  const afterPickup = result.stdout.split("You take the signet.")[1];
  assert.ok(afterPickup);
  assert.match(afterPickup, /Visible items:\s*none/i);
  assert.match(afterPickup, /Equipped:\s*longsword/i);
  assert.match(afterPickup, /Collectibles:\s*signet/i);
  assert.match(afterPickup, /silver signet[\s\S]*family crest/i);
  assert.match(afterPickup, /already carrying the signet/i);
});

test("built game recovers from malformed, invisible, and illegal commands", () => {
  const result = runCli(
    "\ndance\nlook around\ninspect\ninspect pedestal\nmove\nmove cellar\nmove reliquary\nlook\nquit\n",
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /enter a command/i);
  assert.match(result.stdout, /don't understand [\"']dance[\"']/i);
  assert.match(result.stdout, /don't understand [\"']look around[\"']/i);
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

test("built game requires the signet at the reliquary exit and ends explicitly", () => {
  const result = runCli(
    [
      "leave",
      "open wooden door",
      "move guardroom",
      ...winningAttacks,
      "move reliquary",
      "leave",
      "take signet",
      "leave",
      "move guardroom",
      "look",
      "status",
      "inventory",
      "help",
      "quit",
      "",
    ].join("\n"),
    ["--seed", "0"],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Objective: retrieve the stolen signet and leave through the reliquary's far exit/i,
  );
  assert.match(result.stdout, /must be in the reliquary/i);
  assert.match(result.stdout, /need the stolen signet/i);
  assert.match(result.stdout, /Victory![\s\S]*escaped through the far exit/i);
  assert.match(result.stdout, /start a new run/i);
  assert.match(result.stdout, /adventure is over[\s\S]*can't change/i);
  assert.match(result.stdout, /Session:\s*victory/i);
  assert.match(result.stdout, /Collectibles:\s*signet/i);
  assert.match(result.stdout, /Available commands:/i);
  assert.equal((result.stdout.match(/^Victory!/gim) ?? []).length, 1);
});

test("seed 0 survives combat and rejected commands do not disturb its rolls", () => {
  const result = runCli(
    [
      "open wooden door",
      "move guardroom",
      "attack",
      "move reliquary",
      "status",
      "dance",
      ...winningAttacks,
      "status",
      "quit",
      "",
    ].join("\n"),
    ["--seed", "0"],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /What do you want to attack/i);
  assert.match(result.stdout, /cannot do that during combat/i);
  assert.match(result.stdout, /don't understand ["']dance["']/i);
  assert.match(
    result.stdout,
    /d20 6 \+ 5 = 11 vs AC 13 — miss[\s\S]*d20 1 \+ 4 = 5 vs AC 16 — miss[\s\S]*d20 5 \+ 5 = 10 vs AC 13 — miss[\s\S]*d20 3 \+ 4 = 7 vs AC 16 — miss[\s\S]*d20 10 \+ 5 = 15 vs AC 13 — hit/i,
  );
  assert.match(result.stdout, /Damage: 8[\s\S]*goblin HP: 0\/7/i);
  assert.match(result.stdout, /Combat victory![\s\S]*Fighter HP: 20\/20/i);
});

test("seed 121 defeats the fighter and preserves readable final state", () => {
  const result = runCli(
    [
      "open wooden door",
      "move guardroom",
      "attack goblin",
      "attack goblin",
      "attack goblin",
      "attack goblin",
      "attack goblin",
      "status",
      "move reliquary",
      "look",
      "help",
      "quit",
      "",
    ].join("\n"),
    ["--seed=121"],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Seed: 121 \(mulberry32-v1\)/i);
  assert.match(
    result.stdout,
    /goblin attacks Fighter with scimitar: d20 20 \+ 4 = 24 vs AC 16 — critical hit[\s\S]*Damage: 9/i,
  );
  assert.match(result.stdout, /Fighter HP: 0\/20[\s\S]*Session: defeat/i);
  assert.match(result.stdout, /Defeat! The fighter has fallen/i);
  assert.match(result.stdout, /adventure is over[\s\S]*can't change/i);
  assert.match(result.stdout, /Guardroom[\s\S]*Available commands:/i);
});
