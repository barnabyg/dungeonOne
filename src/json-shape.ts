/**
 * Checks on the shape of decoded JSON, shared by the file-format validators.
 * A failed check throws a `ShapeError` naming the problem; the validator
 * catches it and says what it was validating.
 */

export class ShapeError extends Error {}

export function fail(message: string): never {
  throw new ShapeError(message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function exactKeys(
  value: unknown,
  keys: readonly string[],
  where: string,
): Record<string, unknown> {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== [...keys].sort().join(",")
  ) {
    fail(`${where} must have exactly ${keys.join(", ")}.`);
  }
  return value;
}

/** Like `exactKeys`, but the `optional` keys may be left out. */
export function knownKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  where: string,
): Record<string, unknown> {
  if (
    !isRecord(value) ||
    !required.every((key) => key in value) ||
    !Object.keys(value).every(
      (key) => required.includes(key) || optional.includes(key),
    )
  ) {
    fail(
      `${where} must have ${required.join(", ")}${optional.length === 0 ? "" : ` and may have ${optional.join(", ")}`}, and nothing else.`,
    );
  }
  return value;
}

export function text(value: unknown, where: string, max = 2000): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > max ||
    /[\p{Cc}\p{Cs}]/u.test(value)
  ) {
    fail(`${where} must be text of 1–${max} characters.`);
  }
  return value;
}

export function id(value: unknown, where: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,47}$/.test(value)) {
    fail(`${where} must be a lowercase id.`);
  }
  return value;
}

export function integer(
  value: unknown,
  where: string,
  min: number,
  max: number,
) {
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    fail(`${where} must be an integer from ${min} to ${max}.`);
  }
  return value as number;
}

export function list(
  value: unknown,
  where: string,
  max: number,
  min = 1,
): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${where} must list ${min}–${max} entries.`);
  }
  return value;
}

/** The entries' keys; fails with `message` on the first repeated key. */
export function distinct<T>(
  entries: readonly T[],
  key: (entry: T) => string,
  message: (entry: T) => string,
): Set<string> {
  const keys = new Set<string>();
  for (const entry of entries) {
    if (keys.has(key(entry))) {
      fail(message(entry));
    }
    keys.add(key(entry));
  }
  return keys;
}

export function unique<T extends { id: string }>(
  entries: readonly T[],
  where: string,
) {
  return distinct(
    entries,
    ({ id: entryId }) => entryId,
    ({ id: entryId }) => `duplicate ${where} id ${entryId}.`,
  );
}
