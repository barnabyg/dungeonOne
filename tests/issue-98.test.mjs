import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { BROWSER_HTML, BROWSER_SCRIPT } from "../dist/browser-page.js";
import { startBrowserServer } from "../dist/browser-server.js";

test("information reads track discovery, return visits and the deadline without touching save, RNG or AI", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-98-"));
  const savePath = join(directory, "slot.json");
  const routes = [
    ["talk", { speakerId: "iona", topicId: "brief", approach: "ask" }],
    ["move", { destinationId: "watch-loft" }],
    ["move", { destinationId: "signal-records" }],
    ["search", { target: "setting-plate" }],
    ["move", { destinationId: "watch-loft" }],
    ["wait", { amount: "3" }],
    ["move", { destinationId: "watch-yard" }],
  ];
  let calls = 0;
  let index = 0;
  const server = await startBrowserServer({
    savePath,
    seed: 0,
    apiKey: "test",
    dmModel: {
      async respond(request) {
        calls++;
        if ("reply" in request) {
          return {
            text: JSON.stringify({
              delivery: "steady",
              opening: "none",
              closing: "none",
              factIds: request.reply.approvedFacts.map(({ id }) => id),
            }),
          };
        }
        if (request.toolResults.length) {
          return { text: "Done." };
        }
        const [name, args] = routes[index++];
        return {
          toolCalls: [{ id: name, name, argumentsJson: JSON.stringify(args) }],
        };
      },
    },
  });
  const post = async (endpoint, body) =>
    fetch(server.url + endpoint, {
      method: "POST",
      headers: { Origin: server.url, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        revision: (await (await fetch(server.url + "/api/state")).json())
          .revision,
      }),
    });
  async function readOnly() {
    const before = await readFile(savePath, "utf8");
    const count = calls;
    let view;
    for (let i = 0; i < 5; i++) {
      view = await (await fetch(server.url + "/api/state")).json();
    }
    assert.equal(await readFile(savePath, "utf8"), before);
    assert.equal(calls, count);
    assert.equal(view.character.hp, 20);
    assert.equal(view.character.maxHp, 20);
    assert.deepEqual(view.character.equipment, []);
    assert.deepEqual(view.character.collectedItems, []);
    return view;
  }
  try {
    await post("/api/start");
    let view = await readOnly();
    assert.deepEqual(
      view.scene.journal.discoveries.map(({ id }) => id),
      ["dark-beacon-known"],
    );
    for (let i = 0; i < routes.length; i++) {
      const response = await post("/api/turn", {
        message: i === 5 ? "Wait three days" : "Follow the next lead",
      });
      assert.equal(response.status, 200);
      const turn = await response.json();
      assert.equal(turn.committed, true);
      view = await readOnly();
      assert.deepEqual(view, turn.view);
      if (i === 3 || i === 4) {
        const evidence = view.scene.journal.discoveries.find(
          ({ id }) => id === "altered-setting",
        );
        assert.equal(evidence.classification, "observation");
        assert.equal(evidence.source.name, "beacon setting plate");
        assert.match(evidence.summary, /who changed it and why remain unknown/);
        assert.equal(
          view.scene.journal.actionableLeads.some((lead) =>
            lead.startsWith("Visit Pell"),
          ),
          false,
        );
        assert.equal(
          view.scene.journal.discoveries.some(({ id }) => id === "pell-shift"),
          false,
        );
      }
      if (i === 5) {
        assert.equal(view.clocks[0].value, 3);
        assert.equal(
          view.scene.room.npcs.some(({ id }) => id === "pell"),
          false,
        );
        assert.equal(
          view.scene.suggestions.some((lead) => lead.includes("talk pell")),
          false,
        );
      }
      if (i === 6) {
        assert.equal(
          view.scene.room.npcs.some(({ id }) => id === "pell"),
          true,
        );
      }
    }
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("secondary panels preserve conversation, scroll and focus while showing classified current information", async () => {
  const nodes = new Map();
  let ready;
  const loaded = new Promise((resolve) => {
    ready = resolve;
  });
  const document = {
    activeElement: undefined,
    getElementById: (id) => nodes.get(id),
    createElement: () => node(),
  };
  function node(id = "") {
    return {
      id,
      children: [],
      listeners: {},
      textContent: "",
      scrollTop: 125,
      set disabled(value) {
        this.isDisabled = value;
        if (id === "message" && !value) {
          ready();
        }
      },
      append(...children) {
        this.children.push(...children);
      },
      replaceChildren(...children) {
        this.children = children;
      },
      setAttribute(name, value) {
        this[name] = value;
      },
      addEventListener(name, listener) {
        this.listeners[name] = listener;
      },
      focus(options) {
        document.activeElement = this;
        this.focusOptions = options;
      },
    };
  }
  for (const match of BROWSER_HTML.matchAll(/id="([^"]+)"/g)) {
    nodes.set(match[1], node(match[1]));
  }
  let reads = 0;
  const view = {
    slot: "occupied",
    seed: 0,
    hp: { current: 20, maximum: 20 },
    clocks: [],
    deadline: { name: "Caravan", day: 3 },
    character: {
      hp: 20,
      maxHp: 20,
      outcome: "playing",
      equipment: [],
      collectedItems: [],
    },
    scene: {
      outcome: "playing",
      objective: "Investigate",
      room: {
        name: "Watch Yard",
        description: "Yard",
        exits: [],
        features: [],
        items: [],
        opponents: [],
      },
      journal: {
        quest: { title: "Watch", status: "active", milestones: [] },
        actionableLeads: ["Compare the plate"],
        discoveries: [
          {
            title: "Plate",
            classification: "observation",
            source: { name: "Plate" },
            summary: "Alteration observed",
          },
          {
            title: "Account",
            classification: "testimony",
            source: { name: "Pell" },
            summary: "Pell says",
          },
          {
            title: "Suspicion",
            classification: "belief",
            source: { name: "Iona" },
            summary: "Unconfirmed",
          },
        ],
      },
    },
  };
  runInNewContext(BROWSER_SCRIPT, {
    document,
    fetch: async () => {
      reads++;
      return { ok: true, json: async () => view };
    },
  });
  await loaded;
  const content = () => {
    const walk = (item) =>
      [item.textContent, ...item.children.map(walk)].join(" ");
    return walk(nodes.get("information-body"));
  };
  for (const name of [
    "inventory",
    "character",
    "journal",
    "leads",
    "inventory",
  ]) {
    const button = nodes.get("open-" + name);
    assert.ok(button, "panel button exists: " + name);
    button.listeners.click();
    assert.equal(nodes.get("information").hidden, false);
    assert.equal(document.activeElement.id, "information-title");
    assert.equal(document.activeElement.focusOptions.preventScroll, true);
    if (name === "inventory") {
      assert.match(content(), /No equipment.*No carried items/);
    }
    if (name === "character") {
      assert.match(content(), /20 \/ 20.*playing/);
    }
    if (name === "journal") {
      assert.match(
        content(),
        /Observed evidence.*Alteration observed.*Testimony.*Pell says.*Beliefs.*Unconfirmed.*Current leads.*Compare the plate/,
      );
    }
    if (name === "leads") {
      assert.match(content(), /Compare the plate/);
    }
    nodes.get("close-information").listeners.click();
    assert.equal(document.activeElement, button);
    assert.equal(nodes.get("information").hidden, true);
  }
  nodes.get("open-journal").listeners.click();
  nodes
    .get("information")
    .listeners.keydown({ key: "Escape", preventDefault() {} });
  assert.equal(document.activeElement.id, "open-journal");
  assert.equal(nodes.get("conversation").scrollTop, 125);
  assert.equal(nodes.get("conversation").children.length, 0);
  assert.equal(reads, 1);
  assert.equal(nodes.get("location").textContent, "Watch Yard");
  nodes.get("open-leads").listeners.click();
  view.scene.journal.actionableLeads = ["Report the alteration to Iona"];
  nodes.get("refresh").listeners.click();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.match(content(), /Report the alteration to Iona/);
  assert.doesNotMatch(content(), /Compare the plate/);
  assert.equal(nodes.get("conversation").scrollTop, 125);
  nodes.get("close-information").listeners.click();
  nodes.get("open-inventory").listeners.click();
  view.character.collectedItems = [{ id: "note", name: "Recovered note" }];
  nodes.get("refresh").listeners.click();
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.match(content(), /Recovered note/);
  assert.doesNotMatch(content(), /No carried items/);
});
