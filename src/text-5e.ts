/** Words shared by the 5e game's modules. */

/** Counts in words, for the AI DM prompt's rest rules (#508). */
export const COUNT_WORDS = ["no", "one", "two", "three", "four"] as const;

/** "a, b or c": `items` as a list in a sentence. */
export function listed(items: readonly string[], conjunction = "or"): string {
  return items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)!}`;
}
