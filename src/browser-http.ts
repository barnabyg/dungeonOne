/**
 * HTTP plumbing shared by the browser servers: bounded JSON bodies, the
 * security headers on every response, and the same-origin checks that keep
 * other sites (and DNS rebinding) from driving a local game.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > 8192) {
      throw new Error("Request too large.");
    }
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export function respond(
  response: ServerResponse,
  status: number,
  type: string,
  body: string,
): void {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Referrer-Policy": "no-referrer",
  });
  response.end(body);
}

export function json(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  respond(
    response,
    status,
    "application/json; charset=utf-8",
    JSON.stringify(value),
  );
}

/**
 * Rejects a request for another host, or a POST from another origin, with
 * 403. Exact Host plus Origin checks also prevent DNS rebinding and
 * cross-site actions. Returns whether the request was rejected.
 */
export function rejectForeignRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: string,
): boolean {
  if (request.headers.host !== new URL(url).host) {
    json(response, 403, { error: "Unrelated host rejected." });
    return true;
  }
  if (
    request.method === "POST" &&
    (request.headers.origin !== url ||
      (request.headers["sec-fetch-site"] !== undefined &&
        request.headers["sec-fetch-site"] !== "same-origin"))
  ) {
    json(response, 403, { error: "Unrelated origin rejected." });
    return true;
  }
  return false;
}
