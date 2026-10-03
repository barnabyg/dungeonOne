import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright";
import { startBrowserServer } from "../dist/browser-server.js";
import { BROWSER_START_VERSION } from "../dist/browser-releases.js";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createCharacter } from "../dist/character-rules.js";
import {
  CHARACTER_PROMPT_VERSION,
  PREVIOUS_CHARACTER_PROMPT_VERSION,
  REJECTED_ACTION_REPLY,
} from "../dist/character-runtime.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { createSeededRandom } from "../dist/random.js";
import { verifyTraceFile } from "../dist/replay.js";
import {
  completeSessionTrace,
  createDmSessionTrace,
  recordDmTraceTurn,
} from "../dist/trace.js";

async function withDirectory(body) {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-111-"));
  try {
    await body(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const state = async (server) => (await fetch(`${server.url}/api/state`)).json();
const post = async (server, path, body) => {
  const response = await fetch(server.url + path, {
    method: "POST",
    headers: { Origin: server.url, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const toolCall = (name, args, id = "queued") => ({
  id,
  name,
  argumentsJson: JSON.stringify(args),
});

/** Scripted provider that returns what the test queues, in order. */
function queuedModel() {
  const model = {
    queue: [],
    async respond() {
      return model.queue.shift() ?? { text: "Unexpected extra request." };
    },
  };
  return model;
}

/** Starts a v12 character adventure for a new level 1 character. */
async function startAdventure(directory, model) {
  const server = await startBrowserServer({
    contentVersion: BROWSER_START_VERSION,
    savePath: join(directory, "unused-slot.json"),
    libraryPath: join(directory, "characters.json"),
    seed: 0,
    apiKey: "offline-fixture",
    dmModel: model,
  });
  const created = (
    await post(server, "/api/characters/create", {
      name: "Ada",
      preset: "balanced",
      revision: (await (await fetch(`${server.url}/api/characters`)).json())
        .revision,
    })
  ).body.library;
  await post(server, "/api/characters/play", {
    characterId: created.characters[0].sheet.id,
    adventureId: "hollow-beacon",
    revision: created.revision,
    confirmed: true,
  });
  return server;
}

test("a rejected mutation's reply is engine-authored, whatever the provider narrates", async () =>
  withDirectory(async (directory) => {
    const model = queuedModel();
    const server = await startAdventure(directory, model);
    try {
      async function turn(body, responses) {
        model.queue = [...responses];
        const result = await post(server, "/api/turn", {
          revision: (await state(server)).revision,
          ...body,
        });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        return { result: result.body, unused: model.queue.length };
      }

      // The provider claims the ending and a level after a rejected ending.
      const claimed = await turn(
        { message: "Resolve the verified safe signal." },
        [
          {
            toolCalls: [
              toolCall("resolve_quest", {
                resolutionId: "verified-safe-signal",
              }),
            ],
          },
          { text: "Done! The beacon blazes and you are now level 5." },
        ],
      );
      assert.equal(claimed.result.committed, false);
      assert.equal(claimed.result.cards[0].title, "Action rejected");
      assert.equal(claimed.result.reply, REJECTED_ACTION_REPLY);
      // The success narration was never requested from the provider.
      assert.equal(claimed.unused, 1);

      // Impossible: fitting an item the Fighter does not carry.
      const impossible = await turn(
        { message: "Fit the component into the beacon socket." },
        [
          {
            toolCalls: [
              toolCall("place_item", {
                item_id: "signal-component",
                target: "beacon-socket",
              }),
            ],
          },
          { text: "The component clicks home and the beacon is repaired." },
        ],
      );
      assert.equal(impossible.result.committed, false);
      assert.equal(impossible.result.reply, REJECTED_ACTION_REPLY);

      // A click whose provider call names a different action is refused too.
      const view = await state(server);
      const option = view.actions.find(({ message }) =>
        /^Head|^Go|watch loft/i.test(message),
      );
      assert.ok(option, JSON.stringify(view.actions.map((a) => a.message)));
      const mismatched = await turn({ optionId: option.id }, [
        {
          toolCalls: [
            toolCall("resolve_quest", { resolutionId: "verified-safe-signal" }),
          ],
        },
        { text: "You win the adventure and gain 1000 XP." },
      ]);
      assert.equal(mismatched.result.committed, false);
      assert.equal(mismatched.result.reply, REJECTED_ACTION_REPLY);

      // A read keeps the provider's narration.
      const read = await turn({ message: "How am I doing?" }, [
        { toolCalls: [toolCall("get_character_status", {})] },
        { text: "You are unhurt and ready, still at level 1." },
      ]);
      assert.equal(
        read.result.reply,
        "You are unhurt and ready, still at level 1.",
      );

      // A committed action keeps the provider's narration.
      const moved = await turn({ message: "Head up to the watch loft." }, [
        { toolCalls: [toolCall("move", { destinationId: "watch-loft" })] },
        { text: "You climb the worn stair into the watch loft." },
      ]);
      assert.equal(moved.result.committed, true);
      assert.equal(
        moved.result.reply,
        "You climb the worn stair into the watch loft.",
      );

      // The player sees the authored replies, and none of the false claims.
      const sheet = (await (await fetch(`${server.url}/api/characters`)).json())
        .characters[0].sheet;
      assert.equal(sheet.level, 1);
      assert.equal(sheet.xp, 0);
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.goto(server.url);
        const conversation = page.locator("#conversation");
        await conversation.getByText("watch loft").first().waitFor();
        const text = await conversation.innerText();
        assert.equal(text.split(REJECTED_ACTION_REPLY).length - 1, 3);
        assert.doesNotMatch(text, /level 5|beacon is repaired|1000 XP/);
        assert.match(text, /You climb the worn stair into the watch loft\./);
      } finally {
        await browser.close();
      }
    } finally {
      await server.close();
    }
  }));

test("character AI traces recorded under the previous prompt version still replay", async () =>
  withDirectory(async (directory) => {
    const loaded = loadAdventure(
      await readFile(
        fileURLToPath(
          new URL(
            "../adventures/hollow-beacon-characters.json",
            import.meta.url,
          ),
        ),
      ),
    );
    const runtime = createDataRuntime(
      loaded.adventure,
      createCharacter("Ada", "balanced"),
    );
    assert.equal(runtime.promptVersion, CHARACTER_PROMPT_VERSION);
    const identity = { provider: "scripted", model: "issue-111" };
    const initial = runtime.createSession();
    const trace = createDmSessionTrace(0, initial, identity, runtime);
    const responses = [
      { toolCalls: [toolCall("move", { destinationId: "watch-loft" })] },
      { text: "You climb into the loft." },
    ];
    const turn = await runDmTurn({
      state: initial,
      playerInput: "Head up to the watch loft.",
      transcript: [],
      random: createSeededRandom(0),
      runtime,
      model: { identity, respond: async () => responses.shift() },
    });
    assert.deepEqual(turn.diagnostics, []);
    recordDmTraceTurn(trace, "Head up to the watch loft.", turn);
    completeSessionTrace(trace, "eof", turn.state);
    const path = join(directory, "trace.json");
    for (const version of [
      CHARACTER_PROMPT_VERSION,
      PREVIOUS_CHARACTER_PROMPT_VERSION,
    ]) {
      trace.dm.promptVersion = version;
      await writeFile(path, JSON.stringify(trace));
      await verifyTraceFile(path);
    }
    trace.dm.promptVersion = "character-adventure-dm-v0";
    await writeFile(path, JSON.stringify(trace));
    await assert.rejects(verifyTraceFile(path), /prompt version/);
  }));
