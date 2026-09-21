import { open, type FileHandle } from "node:fs/promises";
import { parseBoundedJson } from "./bounded-json.js";

const TRACE_BYTE_LIMIT = 16 * 1024 * 1024;

// Keep enough significant digits to distinguish supported versions 1–4 even
// when a legal numeric spelling has millions of zeroes before its exponent.
function numericToken() {
  let digits = "",
    omitted = 0,
    fraction = 0,
    exponent = 0;
  let fractional = false,
    exponential = false,
    negativeExponent = false,
    negative = false;
  return {
    add(char: string) {
      if (char === "e" || char === "E") {
        exponential = true;
      } else if (char === ".") {
        fractional = true;
      } else if (char === "-") {
        if (exponential) {
          negativeExponent = true;
        } else {
          negative = true;
        }
      } else if (char >= "0" && char <= "9") {
        if (exponential) {
          exponent = Math.min(1e12, exponent * 10 + Number(char));
        } else {
          if (fractional) {
            fraction++;
          }
          if (digits.length > 0 || char !== "0") {
            if (digits.length < 64) {
              digits += char;
            } else {
              omitted++;
            }
          }
        }
      }
    },
    value() {
      return Number(
        `${negative ? "-" : ""}${digits || "0"}e${omitted - fraction + (negativeExponent ? -exponent : exponent)}`,
      );
    },
  };
}

/** Locate the last top-level formatVersion without retaining the envelope.
 * JSON validation happens afterward. Keys may be escaped or cross chunks, and
 * quoted text/nested fields must never masquerade as envelope metadata. */
async function isFormat4(file: FileHandle): Promise<boolean> {
  const chunk = Buffer.alloc(64 * 1024);
  let position = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let keyExpected = false;
  let captureKey = false;
  let key = "";
  let formatKey = false;
  let captureValue = false;
  let token = "";
  let number = numericToken();
  let tokenLength = 0;
  let version: unknown;
  const finishValue = () => {
    try {
      version =
        tokenLength > 128 ? number.value() : (JSON.parse(token) as unknown);
    } catch {
      version = undefined;
    }
    captureValue = false;
    formatKey = false;
    token = "";
  };
  for (;;) {
    const { bytesRead } = await file.read(chunk, 0, chunk.length, position);
    if (bytesRead === 0) {
      break;
    }
    position += bytesRead;
    // JSON delimiters and the format key are ASCII. Work on bytes so Unicode
    // decoding and chunk boundaries cannot introduce false delimiters.
    for (const byte of chunk.subarray(0, bytesRead)) {
      const char = String.fromCharCode(byte);
      if (inString) {
        if (captureKey && key.length <= 128) {
          key += char;
        }
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
          if (captureKey) {
            try {
              formatKey = JSON.parse(key) === "formatVersion";
            } catch {
              formatKey = false;
            }
            captureKey = false;
            keyExpected = false;
          }
        }
        continue;
      }
      if (captureValue) {
        if (char === "," || char === "}") {
          finishValue();
        } else if (char === '"' || char === "{" || char === "[") {
          // Non-numeric values cannot select format 4.
          finishValue();
          version = undefined;
        } else {
          if (!/[\x20\t\r\n]/.test(char)) {
            if (token.length <= 128) {
              token += char;
            }
            number.add(char);
            tokenLength++;
          }
          continue;
        }
      }
      if (char === '"') {
        inString = true;
        captureKey = depth === 1 && keyExpected;
        key = captureKey ? '"' : "";
      } else if (char === "{" || char === "[") {
        depth++;
        if (depth === 1) {
          keyExpected = char === "{";
        }
      } else if (char === "}" || char === "]") {
        depth--;
      } else if (depth === 1 && char === ",") {
        keyExpected = true;
        formatKey = false;
      } else if (depth === 1 && char === ":" && formatKey) {
        captureValue = true;
        token = "";
        number = numericToken();
        tokenLength = 0;
      }
    }
  }
  if (captureValue) {
    finishValue();
  }
  return version === 4;
}

export async function readTraceFile(path: string): Promise<unknown> {
  let file: FileHandle;
  try {
    file = await open(path, "r");
  } catch (error) {
    throw new Error(
      `Unable to read trace "${path}": ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  try {
    if (!(await file.stat()).isFile()) {
      throw new Error("Expected a regular trace file.");
    }
    if (await isFormat4(file)) {
      if ((await file.stat()).size > TRACE_BYTE_LIMIT) {
        throw new Error(`byte-limit: Trace exceeds ${TRACE_BYTE_LIMIT} bytes.`);
      }
      // Positioned reads leave the handle offset at zero. Read at most the
      // limit plus one byte even if another process grows the file meanwhile.
      const buffer = Buffer.alloc(TRACE_BYTE_LIMIT + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          length,
          buffer.length - length,
          length,
        );
        if (bytesRead === 0) {
          break;
        }
        length += bytesRead;
      }
      return parseBoundedJson(
        buffer.subarray(0, length),
        TRACE_BYTE_LIMIT,
        48,
        false,
      );
    }
    // Historical formats retain their original unbounded reader and decoder.
    const contents = await file.readFile("utf8");
    try {
      return JSON.parse(contents) as unknown;
    } catch (error) {
      throw new Error(
        `Trace contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  } finally {
    await file.close();
  }
}
