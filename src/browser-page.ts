// Bundled into dist so the extracted package serves the same interface.
export const BROWSER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hollow Beacon</title><link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script></head>
<body><a class="skip" href="#scene">Skip to scene</a>
<header><p class="eyebrow">DUNGEON ONE · LOCAL ADVENTURE</p><h1>Hollow Beacon</h1><p id="seed">Reading save slot…</p></header>
<main><aside aria-label="Adventure status"><h2>At a glance</h2><dl>
<dt>Location</dt><dd id="location">Not started</dd><dt>HP</dt><dd id="hp">—</dd>
<dt>Time</dt><dd id="time">—</dd><dt>Deadline</dt><dd id="deadline">—</dd><dt>Session</dt><dd id="session">—</dd></dl>
<h2>Visible exits</h2><ul id="exits"><li>Start to see exits.</li></ul></aside>
<section id="scene" tabindex="-1" aria-labelledby="scene-title"><p class="eyebrow">CURRENT SCENE</p>
<h2 id="scene-title">Your save slot</h2><p id="description">Checking for an existing adventure…</p>
<p id="objective"></p><h3 id="details-title" hidden>In view</h3><ul id="details"></ul>
<div class="controls"><button id="start" hidden>Start adventure</button><button id="refresh">Read current state</button></div>
<p id="feedback" role="status" aria-live="polite"></p>
<h3>Conversation</h3><div id="conversation" role="log" aria-live="polite" aria-label="Adventure conversation"></div>
<form id="turn" hidden><label for="message">What do you do or ask?</label>
<textarea id="message" maxlength="1000" rows="3" required aria-describedby="message-help" placeholder="Describe one action, or ask a question."></textarea>
<p id="message-help">Enter to send · Shift+Enter for a new line</p>
<button id="send" type="submit">Send message</button></form>
<p class="note">Progress saves automatically. Conversation history is not restored after reload in this opening.</p>
</section>
<aside id="information-navigation" aria-label="Player information">
<h2>Player information</h2><nav aria-label="Information panels">
<button id="open-inventory" aria-controls="information" aria-expanded="false" disabled>Inventory</button>
<button id="open-character" aria-controls="information" aria-expanded="false" disabled>Character</button>
<button id="open-journal" aria-controls="information" aria-expanded="false" disabled>Journal</button>
<button id="open-leads" aria-controls="information" aria-expanded="false" disabled>Known leads</button>
</nav><section id="information" aria-labelledby="information-title" hidden>
<button id="close-information">Close information</button>
<h2 id="information-title" tabindex="-1"></h2><div id="information-body"></div>
</section></aside></main></body></html>`;

export const BROWSER_CSS = `:root{color-scheme:light;font-family:Georgia,serif;color:#25352f;background:#f3f1eb;font-size:18px;line-height:1.65}
*{box-sizing:border-box}body{margin:0}header{max-width:1180px;margin:auto;padding:32px 36px 24px;border-bottom:1px solid #d1d7cd}h1,h2,h3,p{margin:0 0 16px}h1{font-size:2.3rem;line-height:1.2}h2{font-size:1.45rem}h3{font-size:1.05rem}header p:last-child{margin:0}
.eyebrow,dt,button,.note,#seed{font-family:system-ui,sans-serif}.eyebrow{font-size:.7rem;letter-spacing:.13em;color:#57685d;margin-bottom:10px}
main{max-width:1180px;margin:32px auto;display:grid;grid-template-columns:280px minmax(0,1fr);gap:48px;padding:0 36px;align-items:start}
aside{position:sticky;top:24px;padding:24px;background:#e6eae0;border:1px solid #cbd2c3;border-radius:6px;max-height:calc(100vh - 48px);overflow:auto}aside h2{font-size:1.05rem}dl{margin:0 0 24px}dt{font-size:.75rem;color:#526154;margin-top:16px}dd{margin:0;line-height:1.4}ul{padding-left:22px}li{margin-bottom:8px}aside ul{font-size:.9rem;margin-bottom:0}
section{min-width:0;background:#fffdf8;padding:32px;border:1px solid #d7dbd0;border-radius:6px}#description{white-space:pre-wrap}#objective{color:#526154}.controls{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}button{cursor:pointer;font-size:.85rem;padding:12px 18px;border-radius:4px;border:1px solid #345645;background:#345645;color:#fff}button:disabled{opacity:.65;cursor:wait}button:hover{background:#234535}#refresh{background:transparent;color:#25352f}
:focus-visible{outline:3px solid #a75b20;outline-offset:4px}#feedback{font-family:system-ui,sans-serif;font-size:.85rem;margin-top:18px;min-height:1.6em}.note{font-size:.75rem;color:#59665d;border-top:1px solid #d7dbd0;padding-top:18px}.skip{position:absolute;left:12px;top:-100px;background:#fff;padding:8px}.skip:focus{top:12px}[hidden]{display:none!important}
form{margin:24px 0}label{display:block;font-family:system-ui,sans-serif;font-size:.85rem}textarea{display:block;width:100%;margin:8px 0 12px;padding:12px;font:inherit;border:1px solid #83917f;border-radius:4px}article{margin:18px 0;padding:16px;border-left:3px solid #cbd2c3;background:#f3f1eb}article h4{font:600 .8rem system-ui,sans-serif;margin:0 0 8px}article p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.player{border-color:#345645}.result{background:#e6eae0}.notice,.waiting{font-size:.85rem}#conversation:empty{display:none}
.dialogue{background:#eef2e9;border-left:3px solid #58734f}.dialogue p{font-style:italic}.dialogue h4{color:#345645}#message-help{font:.75rem system-ui,sans-serif;color:#59665d}
main{max-width:1500px;grid-template-columns:220px minmax(0,1fr) 280px;gap:24px}header{max-width:1500px}
#conversation{max-height:55vh;overflow:auto;overflow-anchor:none}#information-navigation{padding:18px}nav{display:flex;flex-wrap:wrap;gap:8px}nav button{padding:8px 10px}nav button[aria-expanded="true"]{background:#234535;outline:2px solid #a75b20}#information{margin-top:18px;padding:0;border:0;background:transparent}#information-title{margin-top:18px}#information-body h3{margin-top:20px}#information-body p{white-space:pre-wrap;overflow-wrap:anywhere}#information-body ul{font-size:.85rem}#close-information{background:transparent;color:#25352f}
@media(max-width:1050px){main{grid-template-columns:180px minmax(0,1fr);padding:0 24px}#information-navigation{position:fixed;right:12px;bottom:12px;top:auto;width:280px;max-height:45vh;z-index:2;box-shadow:0 4px 16px #25352f33}#scene{padding-bottom:130px}}
@media(max-width:760px){header{padding:24px}main{grid-template-columns:1fr;gap:24px;margin-top:24px}aside{position:sticky;top:0;max-height:35vh;z-index:1}aside dl{display:grid;grid-template-columns:80px 1fr;gap:4px;margin-bottom:8px}aside dt{margin:0}aside h2{margin-bottom:8px}section{padding:24px}#information-navigation{width:min(280px,calc(100vw - 24px))}}`;

export const BROWSER_SCRIPT = `"use strict";
const element = (id) => document.getElementById(id);
const text = (id, value) => { element(id).textContent = value; };
let pending = false;
let currentView;
let activePanel;
const panels = { inventory: "Inventory", character: "Character", journal: "Journal", leads: "Known leads" };
function informationBlock(heading, values) {
  const title = document.createElement("h3"); title.textContent = heading;
  const items = document.createElement("ul");
  values.forEach((value) => { const item = document.createElement("li"); item.textContent = value; items.append(item); });
  element("information-body").append(title, items);
}
function inventoryBlock(heading, items, empty) {
  informationBlock(heading, items.length ? items.map((item) => item.name) : [empty]);
}
function renderInformation() {
  if (!activePanel || !currentView || currentView.slot === "empty") { return; }
  const status = currentView.character;
  const journal = currentView.scene.journal;
  element("information-body").replaceChildren();
  text("information-title", panels[activePanel]);
  if (activePanel === "inventory") {
    inventoryBlock("Equipment", status.equipment, "No equipment.");
    inventoryBlock("Carried items", status.collectedItems, "No carried items.");
  } else if (activePanel === "character") {
    informationBlock("Current status", ["HP: " + status.hp + " / " + status.maxHp, "Session: " + status.outcome, ...(status.combatTurn ? ["Combat turn: " + status.combatTurn] : [])]);
  } else {
    if (activePanel === "journal") {
      informationBlock(journal.quest.title, ["Quest: " + journal.quest.status]);
      for (const [classification, label] of [["observation", "Observed evidence"], ["testimony", "Testimony"], ["belief", "Beliefs"]]) {
        const entries = journal.discoveries.filter((entry) => entry.classification === classification).map((entry) => entry.title + " — " + entry.source.name + ": " + entry.summary);
        informationBlock(label, entries.length ? entries : ["None recorded."]);
      }
    }
    const leads = [...new Set(journal.actionableLeads.filter((lead) => lead.trim()))];
    informationBlock("Current leads", leads.length ? leads : ["No current leads."]);
  }
}
function closeInformation() {
  if (!activePanel) { return; }
  const opener = element("open-" + activePanel);
  opener.setAttribute("aria-expanded", "false");
  activePanel = undefined;
  element("information").hidden = true;
  opener.focus({ preventScroll: true });
}
Object.keys(panels).forEach((name) => {
  element("open-" + name).addEventListener("click", () => {
    if (!currentView || currentView.slot === "empty") { return; }
    if (activePanel === name) { closeInformation(); return; }
    if (activePanel) { element("open-" + activePanel).setAttribute("aria-expanded", "false"); }
    activePanel = name;
    element("open-" + name).setAttribute("aria-expanded", "true");
    element("information").hidden = false;
    renderInformation();
    element("information-title").focus({ preventScroll: true });
  });
});
element("close-information").addEventListener("click", closeInformation);
element("information").addEventListener("keydown", (event) => {
  if (event.key === "Escape") { event.preventDefault(); closeInformation(); }
});
function busy(value) {
  pending = value;
  ["start", "refresh", "send", "message"].forEach((id) => { element(id).disabled = value; });
  element("conversation").setAttribute("aria-busy", String(value));
}
function entry(label, value, className = "reply") {
  const conversation = element("conversation");
  const follow = conversation.scrollTop + conversation.clientHeight >= conversation.scrollHeight - 24;
  const item = document.createElement("article");
  item.className = className;
  const heading = document.createElement("h4"); heading.textContent = label;
  const body = document.createElement("p"); body.textContent = value;
  item.append(heading, body); conversation.append(item);
  if (follow || className === "player") { conversation.scrollTop = conversation.scrollHeight; }
  return item;
}
function list(id, values) {
  element(id).replaceChildren(...values.map((value) => {
    const item = document.createElement("li"); item.textContent = value; return item;
  }));
}
function render(view) {
  currentView = view;
  Object.keys(panels).forEach((name) => { element("open-" + name).disabled = view.slot === "empty"; });
  if (view.slot === "empty") { closeInformation(); }
  renderInformation();
  text("seed", "Seed " + view.seed + " · Single local save slot");
  const empty = view.slot === "empty";
  element("start").hidden = !empty;
  element("details-title").hidden = empty;
  element("turn").hidden = empty;
  if (empty) {
    text("scene-title", view.title);
    text("description", "The save slot is empty. Start the adventure to save its opening state.");
    text("location", "Not started"); text("hp", "—"); text("time", "—"); text("deadline", "—"); text("session", "Not started");
    text("objective", ""); list("details", []); list("exits", ["Start to see exits."]); return;
  }
  const scene = view.scene;
  text("scene-title", scene.room.name); text("description", scene.room.description);
  text("objective", scene.objective); text("location", scene.room.name);
  text("hp", view.hp.current + " / " + view.hp.maximum);
  text("time", view.clocks.map((clock) => clock.name + ": " + (clock.unit === "day" ? "Day " : "") + clock.value).join("; ") || "No clock");
  text("deadline", view.deadline.name + ": Day " + view.deadline.day);
  text("session", scene.outcome);
  list("exits", scene.room.exits.map((exit) => exit.name));
  list("details", [
    ...scene.room.features.map((feature) => feature.name + ": " + feature.description),
    ...(scene.room.npcs || []).map((npc) => npc.name + (npc.condition === "dead" ? " (dead)" : "")),
    ...scene.room.items.map((item) => item.name + ": " + item.description),
    ...scene.room.opponents.map((opponent) => opponent.name + " (" + opponent.condition + ")")
  ]);
}
async function read(start = false) {
  if (pending) { return; }
  busy(true);
  text("feedback", start ? "Saving the opening…" : "Reading current state…");
  try {
    const response = await fetch(start ? "/api/start" : "/api/state", { method: start ? "POST" : "GET" });
    const view = await response.json();
    if (!response.ok) { throw new Error(view.error || "Unable to read the save slot."); }
    render(view);
    text("feedback", view.slot === "empty" ? "Ready to start." : "Saved state loaded. Conversation history is not restored in this opening.");
    if (start) { element("scene").focus(); }
  } catch (error) {
    text("feedback", error instanceof Error ? error.message : "Unable to reach the local service. Restart the launcher and open its new URL.");
  } finally { busy(false); }
}
element("message").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) { return; }
  event.preventDefault();
  if (!pending && !event.repeat) { element("turn").requestSubmit(); }
});
element("turn").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (pending) { return; }
  const message = element("message").value.trim();
  if (!message) { return; }
  busy(true);
  entry("You", message, "player");
  element("message").value = "";
  const waiting = entry("Dungeon Master", "Waiting for a complete reply…", "waiting");
  text("feedback", "Your message is pending…");
  try {
    const response = await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    const result = await response.json();
    if (!response.ok) { throw new Error(result.error || "Unable to complete the turn."); }
    waiting.remove();
    entry(result.speaker ? "NPC dialogue" : "Dungeon Master", result.reply, result.speaker ? "dialogue" : "reply");
    result.cards.forEach((card) => { entry(card.title, card.text, "result"); });
    entry("Save status", result.notice, "notice");
    render(result.view);
    text("feedback", result.notice);
  } catch (error) {
    waiting.remove();
    const message = error instanceof Error ? error.message : "Connection lost. Read current state before sending another action.";
    entry("Turn unavailable", message, "notice");
    text("feedback", message);
  } finally {
    busy(false);
    element("message").focus();
  }
});
element("start").addEventListener("click", () => { void read(true); });
element("refresh").addEventListener("click", () => { void read(); });
void read();`;
