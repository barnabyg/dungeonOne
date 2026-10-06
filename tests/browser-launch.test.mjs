// The launcher's announcement (src/browser-launch.ts): the URL is printed
// before the desktop browser is opened, so a failed opener still leaves it.
import assert from "node:assert/strict";
import test from "node:test";

import { announceBrowser } from "../dist/browser-launch.js";

test("the URL and how to stop are printed before the browser opens", async () => {
  let output = "";
  const opened = [];
  await announceBrowser(
    "http://127.0.0.1:12345",
    (message) => {
      output += message;
    },
    async (url) => {
      assert.match(output, /Dungeon One: http:\/\/127\.0\.0\.1:12345/);
      opened.push(url);
    },
  );
  assert.deepEqual(opened, ["http://127.0.0.1:12345"]);
  assert.match(output, /Press Ctrl\+C to stop/);
  assert.doesNotMatch(output, /Could not open/);
});

test("a failed browser opener leaves an already printed usable URL", async () => {
  let output = "";
  await announceBrowser(
    "http://127.0.0.1:12345",
    (message) => {
      output += message;
    },
    async (url) => {
      assert.match(output, /http:\/\/127\.0\.0\.1:12345/);
      assert.equal(url, "http://127.0.0.1:12345");
      throw new Error("opener failed");
    },
  );
  assert.match(output, /Could not open.*http:\/\/127\.0\.0\.1:12345/);
});
