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
<p class="note">This opening lets you start and read one save slot. Player messages and restored conversation history arrive in a later update.</p>
</section></main></body></html>`;

export const BROWSER_CSS = `:root{color-scheme:light;font-family:Georgia,serif;color:#25352f;background:#f3f1eb;font-size:18px;line-height:1.65}
*{box-sizing:border-box}body{margin:0}header{max-width:1180px;margin:auto;padding:32px 36px 24px;border-bottom:1px solid #d1d7cd}h1,h2,h3,p{margin:0 0 16px}h1{font-size:2.3rem;line-height:1.2}h2{font-size:1.45rem}h3{font-size:1.05rem}header p:last-child{margin:0}
.eyebrow,dt,button,.note,#seed{font-family:system-ui,sans-serif}.eyebrow{font-size:.7rem;letter-spacing:.13em;color:#57685d;margin-bottom:10px}
main{max-width:1180px;margin:32px auto;display:grid;grid-template-columns:280px minmax(0,1fr);gap:48px;padding:0 36px;align-items:start}
aside{position:sticky;top:24px;padding:24px;background:#e6eae0;border:1px solid #cbd2c3;border-radius:6px;max-height:calc(100vh - 48px);overflow:auto}aside h2{font-size:1.05rem}dl{margin:0 0 24px}dt{font-size:.75rem;color:#526154;margin-top:16px}dd{margin:0;line-height:1.4}ul{padding-left:22px}li{margin-bottom:8px}aside ul{font-size:.9rem;margin-bottom:0}
section{min-width:0;background:#fffdf8;padding:32px;border:1px solid #d7dbd0;border-radius:6px}#description{white-space:pre-wrap}#objective{color:#526154}.controls{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}button{cursor:pointer;font-size:.85rem;padding:12px 18px;border-radius:4px;border:1px solid #345645;background:#345645;color:#fff}button:disabled{opacity:.65;cursor:wait}button:hover{background:#234535}#refresh{background:transparent;color:#25352f}
:focus-visible{outline:3px solid #a75b20;outline-offset:4px}#feedback{font-family:system-ui,sans-serif;font-size:.85rem;margin-top:18px;min-height:1.6em}.note{font-size:.75rem;color:#59665d;border-top:1px solid #d7dbd0;padding-top:18px}.skip{position:absolute;left:12px;top:-100px;background:#fff;padding:8px}.skip:focus{top:12px}[hidden]{display:none!important}
@media(max-width:760px){header{padding:24px}main{grid-template-columns:1fr;padding:0 24px;gap:24px;margin-top:24px}aside{position:static;max-height:none}section{padding:24px}}`;

export const BROWSER_SCRIPT = `"use strict";
const element = (id) => document.getElementById(id);
const text = (id, value) => { element(id).textContent = value; };
function list(id, values) {
  element(id).replaceChildren(...values.map((value) => {
    const item = document.createElement("li"); item.textContent = value; return item;
  }));
}
function render(view) {
  text("seed", "Seed " + view.seed + " · Single local save slot");
  const empty = view.slot === "empty";
  element("start").hidden = !empty;
  element("details-title").hidden = empty;
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
  const buttons = [element("start"), element("refresh")];
  buttons.forEach((button) => { button.disabled = true; });
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
  } finally { buttons.forEach((button) => { button.disabled = false; }); }
}
element("start").addEventListener("click", () => { void read(true); });
element("refresh").addEventListener("click", () => { void read(); });
void read();`;
