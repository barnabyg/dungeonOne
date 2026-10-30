/** Words shared by the 5e game's modules. */

/** "a, b or c": `items` as a list in a sentence. */
export function listed(items: readonly string[], conjunction = "or"): string {
  return items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)!}`;
}
