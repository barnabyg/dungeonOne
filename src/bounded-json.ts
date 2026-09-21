export class JsonInputError extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

export function pointer(path: string, key: string | number): string {
  return `${path}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

/** Parse before indexing: duplicate keys (including escaped equivalents), UTF-8,
 * size and nesting are checked without trusting JSON.parse's object decoding. */
export function parseBoundedJson(
  input: string | Uint8Array,
  byteLimit: number,
  depthLimit = 32,
  strictScalars = true,
): unknown {
  const size =
    typeof input === "string"
      ? Buffer.byteLength(input, "utf8")
      : input.byteLength;
  if (size > byteLimit) {
    throw new JsonInputError(
      "byte-limit",
      "",
      `JSON exceeds ${byteLimit} UTF-8 bytes.`,
    );
  }
  let text: string;
  try {
    text =
      typeof input === "string"
        ? input
        : new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new JsonInputError("invalid-utf8", "", "Input must be valid UTF-8.");
  }
  let offset = 0;
  const fail = (code: string, path: string, message: string): never => {
    throw new JsonInputError(code, path, message);
  };
  const space = () => {
    while (/[\x20\t\r\n]/.test(text[offset] ?? "x")) {
      offset++;
    }
  };
  function string(path: string): string {
    const start = offset++;
    while (offset < text.length) {
      const char = text[offset++];
      if (char === "\\") {
        offset++;
      } else if (char === '"') {
        let value: string;
        try {
          value = JSON.parse(text.slice(start, offset)) as string;
        } catch {
          return fail("invalid-json", path, "Invalid JSON string.");
        }
        if (strictScalars && /[\ud800-\udfff]/u.test(value)) {
          return fail(
            "invalid-string",
            path,
            "Lone surrogates are not supported.",
          );
        }
        return value;
      }
    }
    return fail("invalid-json", path, "Unterminated string.");
  }
  function value(path: string, depth: number): unknown {
    space();
    const char = text[offset];
    if (char === "{" || char === "[") {
      if (depth >= depthLimit) {
        return fail("depth-limit", path, `JSON nesting exceeds ${depthLimit}.`);
      }
      offset++;
      space();
      const array = char === "[";
      const end = array ? "]" : "}";
      const result: Record<string, unknown> = Object.create(null) as Record<
        string,
        unknown
      >;
      const entries: unknown[] = [];
      if (text[offset] === end) {
        offset++;
        return array ? entries : Object.fromEntries(Object.entries(result));
      }
      while (offset < text.length) {
        space();
        let key: string;
        if (array) {
          key = String(entries.length);
        } else {
          if (text[offset] !== '"') {
            return fail("invalid-json", path, "Expected an object key.");
          }
          key = string(path);
          space();
          if (Object.hasOwn(result, key)) {
            return fail(
              "duplicate-key",
              pointer(path, key),
              "Duplicate JSON key.",
            );
          }
          if (text[offset++] !== ":") {
            return fail("invalid-json", path, "Expected a colon.");
          }
        }
        const child = value(pointer(path, key), depth + 1);
        if (array) {
          entries.push(child);
        } else {
          result[key] = child;
        }
        space();
        const delimiter = text[offset++];
        if (delimiter === end) {
          return array ? entries : Object.fromEntries(Object.entries(result));
        }
        if (delimiter !== ",") {
          return fail(
            "invalid-json",
            path,
            "Expected a comma or closing delimiter.",
          );
        }
      }
      return fail("invalid-json", path, "Unterminated container.");
    }
    if (char === '"') {
      return string(path);
    }
    const token =
      /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(
        text.slice(offset),
      )?.[0];
    if (token === undefined) {
      return fail("invalid-json", path, "Expected a JSON value.");
    }
    offset += token.length;
    const primitive: unknown = JSON.parse(token);
    if (
      strictScalars &&
      typeof primitive === "number" &&
      !Number.isSafeInteger(primitive)
    ) {
      return fail("invalid-integer", path, "Numbers must be safe integers.");
    }
    return primitive;
  }
  const parsed = value("", 0);
  space();
  if (offset !== text.length) {
    fail("invalid-json", "", "Unexpected trailing input.");
  }
  return parsed;
}
