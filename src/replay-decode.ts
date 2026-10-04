// Pure trace decoding helpers. A leaf module: replay code of every runtime
// family imports it without creating import cycles.
import { isDeepStrictEqual } from "node:util";
import type { RollRecord } from "./trace.js";

export type JsonObject = Record<string, unknown>;

export type TraceCompletion = Readonly<{
  reason: "quit" | "eof";
  outcome: "victory" | "defeat" | "incomplete";
}>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireObject(value: unknown, path: string): JsonObject {
  if (!isObject(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value;
}

export function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string.`);
  }
  return value;
}

export function requireOneOf(
  value: unknown,
  allowed: readonly string[],
  path: string,
): string {
  const actual = requireString(value, path);
  if (!allowed.includes(actual)) {
    throw new Error(`${path} must be one of: ${allowed.join(", ")}.`);
  }
  return actual;
}

export function requireInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${path} must be a safe integer.`);
  }
  return Number(value);
}

export function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean.`);
  }
  return value;
}

export function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }
  return value;
}

export function requireExactKeys(
  value: JsonObject,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(`${path} contains unsupported identifier ${key}.`);
    }
  }
  for (const key of allowed) {
    requireObject(value[key], `${path}.${key}`);
  }
}

export function requireOnlyKeys(
  value: JsonObject,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(`${path} contains unsupported field ${key}.`);
    }
  }
}

export function validateStringArray(value: unknown, path: string): void {
  requireArray(value, path).forEach((entry, index) => {
    requireString(entry, `${path}[${index}]`);
  });
}

export function validateOneOfArray(
  value: unknown,
  allowed: readonly string[],
  path: string,
): void {
  requireArray(value, path).forEach((entry, index) => {
    requireOneOf(entry, allowed, `${path}[${index}]`);
  });
}

export function requireSupported(
  actual: unknown,
  expected: string | number,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(`Unsupported ${label} ${JSON.stringify(actual)}.`);
  }
}

export function validateRoll(value: unknown, path: string): RollRecord {
  const roll = requireObject(value, path);
  if (!Number.isSafeInteger(roll.sides) || Number(roll.sides) <= 0) {
    throw new Error(`${path}.sides must be a positive safe integer.`);
  }
  if (
    !Number.isSafeInteger(roll.value) ||
    Number(roll.value) < 1 ||
    Number(roll.value) > Number(roll.sides)
  ) {
    throw new Error(`${path}.value must be an integer from 1 through sides.`);
  }
  return { sides: Number(roll.sides), value: Number(roll.value) };
}

export function validateCompletion(value: unknown): TraceCompletion {
  const completion = requireObject(value, "completion");
  if (completion.reason !== "quit" && completion.reason !== "eof") {
    throw new Error('completion.reason must be "quit" or "eof".');
  }
  if (
    completion.outcome !== "victory" &&
    completion.outcome !== "defeat" &&
    completion.outcome !== "incomplete"
  ) {
    throw new Error(
      'completion.outcome must be "victory", "defeat", or "incomplete".',
    );
  }
  return {
    reason: completion.reason,
    outcome: completion.outcome,
  };
}

export function requireFields(
  value: JsonObject,
  keys: readonly string[],
  path: string,
): void {
  requireOnlyKeys(value, keys, path);
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`${path}.${key} is required.`);
    }
  }
}

export function formatDiagnosticJson(value: unknown): string {
  return JSON.stringify(value, undefined, 2);
}

export function requireMatch(
  location: string,
  expected: unknown,
  actual: unknown,
): void {
  if (!isDeepStrictEqual(expected, actual)) {
    throw new Error(
      `Replay divergence at ${location}.\nExpected:\n${formatDiagnosticJson(expected)}\nActual:\n${formatDiagnosticJson(actual)}`,
    );
  }
}
