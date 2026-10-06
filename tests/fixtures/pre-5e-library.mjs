// A character library as the pre-5e game wrote it (format version 1), deleted
// in #139. 5e loaders must refuse it by name and leave it byte-identical.
export const PRE_5E_LIBRARY = JSON.stringify({
  kind: "dungeon-one-characters",
  formatVersion: 1,
  revision: "0".repeat(32),
  characters: [{ id: "a".repeat(32), name: "Ada" }],
});
