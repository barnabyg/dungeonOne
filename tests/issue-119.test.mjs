import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadAdventure } from "../dist/adventure-loader.js";
import { CHARACTER_TREASURE_SCHEMA } from "../dist/character-adventure-schema.js";

// Hollow Beacon v14 rewritten as a schema 18 document with treasure.
function treasureDocument(treasure) {
  const story = JSON.parse(
    readFileSync("adventures/hollow-beacon-story.json", "utf8"),
  );
  return {
    ...story,
    schemaVersion: 18,
    rulesVersion: "character-adventure-rules-v3",
    characterAdventure: { ...story.characterAdventure, treasure },
  };
}
const PURSE = {
  id: "raider-purse",
  trigger: "actor-defeated",
  targetId: "ridge-raider",
  silver: 6,
  items: [],
};

test("schema 18 adventures award treasure on authored triggers (#119)", () => {
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v18.schema.json", "utf8")),
    CHARACTER_TREASURE_SCHEMA,
  );
  const loaded = loadAdventure(
    JSON.stringify(
      treasureDocument([
        PURSE,
        {
          id: "keeper-draught",
          trigger: "completion",
          targetId: "",
          silver: 0,
          items: ["healing-draught"],
        },
      ]),
    ),
  );
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  assert.equal(loaded.adventure.snapshot.characterAdventure.treasure.length, 2);
});

test("treasure must be unique, reachable and worth something (#119)", () => {
  for (const [treasure, message] of [
    [[{ ...PURSE, targetId: "nobody" }], /unknown trigger target/],
    [[PURSE, PURSE], /unique/],
    [[{ ...PURSE, id: "hollow-beacon-completion" }], /unique/],
    [[{ ...PURSE, silver: 0 }], /awards nothing/],
  ]) {
    const loaded = loadAdventure(JSON.stringify(treasureDocument(treasure)));
    assert.equal(loaded.ok, false);
    assert.match(
      loaded.diagnostics.map(({ message }) => message).join("\n"),
      message,
    );
  }
  const unknownItem = loadAdventure(
    JSON.stringify(treasureDocument([{ ...PURSE, items: ["vorpal-sword"] }])),
  );
  assert.equal(unknownItem.ok, false);
  // Schema 17 keeps its released syntax: no treasure, no rules v3.
  const story = treasureDocument([PURSE]);
  for (const document of [
    { ...story, schemaVersion: 17 },
    {
      ...story,
      characterAdventure: {
        ...story.characterAdventure,
        treasure: undefined,
      },
      rulesVersion: "character-adventure-rules-v2",
    },
  ]) {
    assert.equal(loadAdventure(JSON.stringify(document)).ok, false);
  }
});
