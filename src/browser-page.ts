// Bundled into dist so the extracted package serves the same interface.
export const BROWSER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hollow Beacon</title><link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script></head>
<body><a class="skip" href="#scene">Skip to scene</a>
<header><p class="eyebrow">DUNGEON ONE · LOCAL ADVENTURE</p><h1>Hollow Beacon</h1><p id="seed">Reading save slot…</p></header>
<main><aside id="scene-context" aria-label="Current scene and adventure status"><p class="eyebrow">CURRENT SCENE</p>
<h2 id="scene-title">Your save slot</h2><p id="description">Checking for an existing adventure…</p><p id="objective"></p>
<div class="controls"><button id="start" hidden>Start adventure</button><button id="new-game" hidden>New game</button><button id="refresh">Read current state</button></div>
<h2>At a glance</h2><dl>
<dt>Location</dt><dd id="location">Not started</dd><dt>HP</dt><dd id="hp">—</dd>
<dt>Combat</dt><dd id="combat">No active combat.</dd><dt>Time</dt><dd id="time">—</dd><dt>Deadline</dt><dd id="deadline">—</dd><dt>Session</dt><dd id="session">—</dd></dl>
<h2>Visible exits</h2><ul id="exits"><li>Start to see exits.</li></ul></aside>
<section id="scene" tabindex="-1" aria-labelledby="conversation-title">
<h2 id="conversation-title">Conversation</h2><div id="conversation" role="log" aria-live="polite" aria-label="Adventure conversation"></div>
<form id="turn" hidden><label for="message">What do you do or ask?</label>
<textarea id="message" maxlength="1000" rows="3" required aria-describedby="message-help" placeholder="Describe one action, or ask a question."></textarea>
<p id="message-help">Enter to send · Shift+Enter for a new line</p>
<button id="send" type="submit">Send message</button></form>
<p id="feedback" role="status" aria-live="polite"></p>
<p class="note">Progress and conversation history restore after reload or restart.</p>
</section>
<aside id="information-navigation" aria-label="Interactions and player information">
<div id="context" aria-label="Selected context" hidden><div class="context-heading"><h3 id="context-title" tabindex="-1"></h3><button id="close-context">Close options</button></div><div id="context-actions"></div></div>
<h2 id="details-title" hidden>In view</h2><ul id="details"></ul>
<h2>Player information</h2><nav aria-label="Information panels">
<button id="open-inventory" aria-controls="information" aria-expanded="false" disabled>Inventory</button>
<button id="open-character" aria-controls="information" aria-expanded="false" disabled>Character</button>
<button id="open-journal" aria-controls="information" aria-expanded="false" disabled>Journal</button>
<button id="open-leads" aria-controls="information" aria-expanded="false" disabled>Known leads</button>
<button id="open-hints" aria-controls="information" aria-expanded="false" disabled>Hints</button>
</nav><section id="information" aria-labelledby="information-title" hidden>
<button id="close-information">Close information</button>
<h2 id="information-title" tabindex="-1"></h2><div id="information-body"></div>
<div id="stronger-hint" hidden><button id="request-stronger-hint" type="button" aria-describedby="stronger-hint-result">Request a stronger hint</button>
<p id="stronger-hint-result" role="status" aria-live="polite" aria-atomic="true"></p></div>
</section></aside></main>
<dialog id="new-game-confirmation" aria-labelledby="new-game-title" aria-describedby="new-game-description">
<h2 id="new-game-title">Replace this adventure?</h2><p id="new-game-description"></p>
<div class="controls"><button id="cancel-new-game" autofocus>Cancel</button><button id="confirm-new-game">Replace and start new game</button></div>
</dialog></body></html>`;

export const BROWSER_CSS = `:root{color-scheme:light;font-family:Georgia,serif;color:#25352f;background:#f3f1eb;font-size:18px;line-height:1.65}
*{box-sizing:border-box}body{margin:0}header{max-width:2400px;margin:auto;padding:20px 36px 16px;border-bottom:1px solid #d1d7cd}h1,h2,h3,p{margin:0 0 16px}h1{font-size:1.9rem;line-height:1.2}h2{font-size:1.45rem}h3{font-size:1.05rem}header p:last-child{margin:0}
.eyebrow,dt,button,.note,#seed{font-family:system-ui,sans-serif}.eyebrow{font-size:.7rem;letter-spacing:.13em;color:#57685d;margin-bottom:10px}
main{max-width:2400px;margin:24px auto;display:grid;grid-template-columns:minmax(280px,1fr) minmax(0,880px) minmax(300px,1fr);gap:28px;padding:0 36px;align-items:start}
aside{min-width:0;padding:24px;background:#e6eae0;border:1px solid #cbd2c3;border-radius:6px}aside h2{font-size:1.05rem}aside p{font-size:.9rem}dl{display:grid;grid-template-columns:90px minmax(0,1fr);gap:10px 16px;margin:0 0 24px}dt{font-size:.75rem;color:#526154}dd{margin:0;line-height:1.4}ul{padding-left:22px}li{margin-bottom:8px}
section{min-width:0;background:#fffdf8;padding:24px;border:1px solid #d7dbd0;border-radius:6px}#description{white-space:pre-wrap}#objective{color:#526154}.controls{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0 28px}button{cursor:pointer;font:.85rem system-ui,sans-serif;padding:12px 18px;border-radius:4px;border:1px solid #345645;background:#345645;color:#fff}button:disabled{opacity:.65;cursor:wait}button:hover{background:#234535}#refresh{background:transparent;color:#25352f}
:focus-visible{outline:3px solid #a75b20;outline-offset:4px}#feedback{font:.8rem system-ui,sans-serif;margin:0 0 12px;min-height:1.4em}.note{font:.75rem system-ui,sans-serif;color:#59665d;border-top:1px solid #d7dbd0;padding-top:12px;margin:0}.skip{position:absolute;left:12px;top:-100px;background:#fff;padding:8px}.skip:focus{top:12px}[hidden]{display:none!important}
#scene{position:sticky;top:24px;height:calc(100dvh - 202px);min-height:420px;display:flex;flex-direction:column}#conversation-title{flex:none;font-size:1.1rem}#conversation{flex:1;min-height:0;overflow:auto;overflow-anchor:none}#conversation:empty::before{content:"Your conversation will appear here.";color:#59665d;font-size:.9rem}#turn{flex:none;margin:16px 0 12px;padding-top:16px;border-top:1px solid #d7dbd0}label{display:block;font:600 .85rem system-ui,sans-serif}textarea{display:block;width:100%;min-height:76px;height:76px;max-height:20vh;resize:vertical;margin:8px 0;padding:12px;font:inherit;border:1px solid #83917f;border-radius:4px}#message-help{font:.75rem system-ui,sans-serif;color:#59665d;margin-bottom:8px}
article{margin:16px 0;padding:16px;border-left:3px solid #cbd2c3;background:#f3f1eb}article h4{font:600 .8rem system-ui,sans-serif;margin:0 0 8px}article p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.player{border-color:#345645}.result{background:#e6eae0}.notice,.waiting{font-size:.85rem}.dialogue{background:#eef2e9;border-left:3px solid #58734f}.dialogue p{font-style:italic}.dialogue h4{color:#345645}
#exits,#details{list-style:none;padding:0;margin:0 0 28px}#exits{display:flex;flex-wrap:wrap;gap:12px}#exits li{margin:0}#details li{margin-bottom:18px}#details li p{margin:8px 0 0}#context{margin:0 0 28px;padding:18px;background:#fffdf8;border:1px solid #cbd2c3;border-radius:6px}.context-heading{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-bottom:18px}.context-heading h3{margin:0}#close-context{flex:none;padding:6px 0;background:transparent;border:0;color:#526154;text-decoration:underline;text-underline-offset:3px}#close-context:hover{color:#25352f}#context-actions{display:flex;flex-wrap:wrap;gap:14px}#context-actions p{flex-basis:100%;margin:8px 0 0}#context-actions button{text-align:left;max-width:100%}
nav{display:flex;flex-wrap:wrap;gap:8px}nav button{padding:8px 10px}nav button[aria-expanded="true"]{background:#234535;outline:2px solid #a75b20}#information{margin-top:18px;padding:0;border:0;background:transparent}#information-title{margin-top:18px}#information-body h3{margin-top:20px}#information-body p{white-space:pre-wrap;overflow-wrap:anywhere}#information-body ul{font-size:.85rem}#close-information{background:transparent;color:#25352f}
@media(max-width:1250px){main{grid-template-columns:250px minmax(0,1fr) 280px;gap:20px;padding:0 24px}aside,section{padding:18px}dl{grid-template-columns:75px minmax(0,1fr);gap:8px}#context{padding:12px}.context-heading{flex-wrap:wrap;gap:8px}#scene{height:calc(100dvh - 202px)}}
@media(max-width:1050px){main{grid-template-columns:minmax(220px,1fr) minmax(0,2fr)}#information-navigation{grid-column:1;grid-row:2}#scene{grid-column:2;grid-row:1 / span 2}}
@media(max-width:760px){header{padding:24px}main{display:flex;flex-direction:column;gap:24px;margin-top:24px;padding:0 24px}main>*{width:100%}#scene{position:static;height:auto;min-height:0;order:3}#conversation{flex:auto;max-height:50vh}#information-navigation{order:2}textarea{max-height:none}}`;

export const BROWSER_SCRIPT = `"use strict";
const element = (id) => document.getElementById(id);
const text = (id, value) => { element(id).textContent = value; };
let pending = false;
let currentView;
let activePanel;
let contextButtons = [];
let sceneButtons = [];
let hintPollRevision;
let strongerRequestRevision;
let strongerError;
let replacementView;
function reviewing() {
  return currentView && currentView.slot === "occupied" && currentView.scene.outcome !== "playing";
}
async function currentResponseView(view) {
  const response = await fetch("/api/state");
  const latest = await response.json();
  if (!response.ok) { throw new Error("Read current state before displaying this response."); }
  return latest.revision !== view.revision ? latest : view;
}
function pollHints(view) {
  if (view.slot === "empty" || !view.hints || (view.hints.status !== "preparing" && (!view.strongerHints || view.strongerHints.status !== "preparing")) || typeof setTimeout !== "function") { return; }
  const revision = view.hints.revision;
  if (hintPollRevision === revision) { return; }
  hintPollRevision = revision;
  async function poll() {
    if (!currentView || !currentView.hints || currentView.hints.revision !== revision) { return; }
    try {
      const response = await fetch("/api/state");
      const view = await response.json();
      const hints = view.hints;
      if (response.ok && view.slot === "occupied" && view.scene.outcome !== "playing") {
        render(view); restoreHistory(view); hintPollRevision = undefined;
        return;
      }
      if (response.ok && currentView.hints.revision === revision && view.generation !== currentView.generation) {
        render(view); restoreHistory(view);
        text("feedback", "The save slot was replaced in another tab. Current new game loaded; old hints were discarded.");
        return;
      }
      if (response.ok && hints && hints.revision === revision && currentView.hints.revision === revision) {
        currentView = { ...currentView, hints, strongerHints: view.strongerHints };
        if (activePanel === "hints") { renderInformation(); }
        if (hints.status !== "preparing" && (!view.strongerHints || view.strongerHints.status !== "preparing")) { hintPollRevision = undefined; return; }
      }
    } catch { /* Reading current information remains available. */ }
    if (currentView.hints.revision === revision) { setTimeout(poll, 250); }
  }
  setTimeout(poll, 250);
}
function closeContext() {
  element("context").hidden = true;
  contextButtons = [];
}
function chooseContext(id, name) {
  if (pending || reviewing()) { return; }
  text("context-title", name);
  element("context-actions").replaceChildren();
  contextButtons = [];
  for (const action of currentView.actions.filter((action) => action.contextId === id)) {
    if (action.stakes) {
      const stakes = document.createElement("p"); stakes.textContent = action.label + ": " + action.stakes;
      element("context-actions").append(stakes);
    }
    const button = document.createElement("button"); button.textContent = action.label;
    button.addEventListener("click", () => submitTurn(action.message, { optionId: action.id }));
    contextButtons.push(button); element("context-actions").append(button);
  }
  element("context").hidden = false;
  element("context-title").focus({ preventScroll: true });
}
function contextList(id, targets) {
  element(id).replaceChildren(...targets.map((target) => {
    const item = document.createElement("li");
    const offers = (currentView.actions || []).filter((action) => action.contextId === target.contextId);
    if (!offers.length) { item.textContent = target.description || target.name; return item; }
    const button = document.createElement("button"); button.textContent = target.name;
    const travel = offers.find((action) => action.call.name === "move");
    button.addEventListener("click", () => travel ? submitTurn(travel.message, { optionId: travel.id }) : chooseContext(target.contextId, target.name));
    sceneButtons.push(button); button.disabled = pending; item.append(button);
    if (target.description) { const description = document.createElement("p"); description.textContent = target.description; item.append(description); }
    return item;
  }));
}
element("close-context").addEventListener("click", () => { closeContext(); element("scene").focus(); });
element("context").addEventListener("keydown", (event) => { if (event.key === "Escape") { closeContext(); element("scene").focus(); } });
const panels = { inventory: "Inventory", character: "Character", journal: "Journal", leads: "Known leads", hints: "Hints" };
function informationBlock(heading, values) {
  const title = document.createElement("h3"); title.textContent = heading;
  const items = document.createElement("ul");
  values.forEach((value) => { const item = document.createElement("li"); item.textContent = value; items.append(item); });
  element("information-body").append(title, items);
}
function inventoryBlock(heading, items, empty) {
  informationBlock(heading, items.length ? items.map((item) => item.name + (item.description ? ": " + item.description : "")) : [empty]);
}
function renderInformation() {
  if (!activePanel || !currentView || currentView.slot === "empty") { return; }
  const status = currentView.character;
  const journal = currentView.scene.journal;
  element("information-body").replaceChildren();
  text("information-title", panels[activePanel]);
  element("stronger-hint").hidden = activePanel !== "hints";
  if (activePanel === "hints" && reviewing()) {
    element("stronger-hint").hidden = true;
    element("request-stronger-hint").disabled = true;
    text("stronger-hint-result", "");
    informationBlock("Adventure complete", ["Review your conversation, journal and current information. Further AI interaction and hints are closed."]);
    return;
  }
  if (activePanel === "hints") {
    const hints = currentView.hints;
    informationBlock("Optional guidance", hints && hints.status === "ready" ? hints.entries : [hints && hints.status === "unavailable" ? "Hints unavailable for this position. Your progress is saved; you can keep playing and read current information." : "Preparing hints for this position…"]);
    const stronger = currentView.strongerHints;
    const requesting = strongerRequestRevision === hints.revision || (stronger && stronger.status === "preparing");
    element("request-stronger-hint").disabled = pending || hints.status !== "ready" || requesting || !!stronger;
    text("stronger-hint-result", requesting ? "Preparing a stronger hint…" : stronger ? (stronger.status === "ready" ? stronger.entries.join(" ") : "Stronger hint unavailable for this position. You can keep playing using your journal and known leads.") : strongerError && strongerError.revision === hints.revision ? strongerError.message : "A stronger hint is optional. Request it when you want more focused guidance.");
  } else if (activePanel === "inventory") {
    inventoryBlock("Equipment", status.equipment, "No equipment.");
    inventoryBlock("Carried items", status.collectedItems, "No carried items.");
    if (status.resources) { informationBlock("Local resources", status.resources); }
  } else if (activePanel === "character") {
    informationBlock("Current status", ["HP: " + status.hp + " / " + status.maxHp, "Session: " + status.outcome, ...(status.combatTurn ? ["Combat turn: " + status.combatTurn] : []), ...(status.conditions || [])]);
    if (status.resources) { informationBlock("Local resources", status.resources); }
  } else {
    if (activePanel === "journal") {
      informationBlock(journal.quest.title, ["Quest: " + journal.quest.status]);
      if (status.resources) { informationBlock("Resource record", status.resources); }
    }
    const showingLeads = activePanel === "leads";
    for (const [classification, label, leadLabel] of [["observation", "Observed evidence", "Observed evidence leads"], ["testimony", "Testimony", "Testimony leads"], ["belief", "Beliefs", "Contested claim leads"]]) {
      const entries = journal.discoveries.filter((entry) => entry.classification === classification).map((entry) => entry.title + " — " + entry.source.name + ": " + (showingLeads ? entry.actionableLead : entry.summary));
      informationBlock(showingLeads ? leadLabel : label, entries.length ? entries : ["None recorded."]);
    }
    if (showingLeads) { return; }
    const leads = [...new Set(journal.actionableLeads.filter((lead) => lead.trim()))];
    informationBlock("Current leads", leads.length ? leads : ["No current leads."]);
  }
}
element("request-stronger-hint").addEventListener("click", async () => {
  if (pending || reviewing() || !currentView || currentView.slot === "empty" || currentView.hints.status !== "ready" || currentView.strongerHints || strongerRequestRevision === currentView.hints.revision) { return; }
  const revision = currentView.hints.revision;
  strongerRequestRevision = revision;
  strongerError = undefined;
  renderInformation();
  try {
    const response = await fetch("/api/hints/stronger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision }) });
    const result = await response.json();
    if (!currentView.hints || currentView.hints.revision !== revision) { return; }
    if (!response.ok) { throw new Error(result.error || "Stronger hint unavailable. Read current state before trying again."); }
    if (result.view) {
      const latest = await currentResponseView(result.view);
      if (latest.slot === "occupied" && latest.scene.outcome !== "playing") {
        render(latest); restoreHistory(latest);
        return;
      }
      if (latest.generation !== currentView.generation) {
        render(latest); restoreHistory(latest);
        text("feedback", "The save slot was replaced in another tab. Current new game loaded; old hints were discarded.");
        return;
      }
    }
    if (!currentView.hints || currentView.hints.revision !== revision) { return; }
    if (result.view && result.view.hints.revision === revision) {
      currentView = { ...currentView, strongerHints: result.view.strongerHints };
      pollHints(currentView);
    }
  } catch {
    if (currentView.hints && currentView.hints.revision === revision) {
      strongerError = { revision, message: "Stronger hint unavailable. Read current state before trying again." };
    }
  } finally {
    if (strongerRequestRevision === revision) { strongerRequestRevision = undefined; }
    renderInformation();
  }
});
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
  ["start", "new-game", "refresh", "send", "message"].forEach((id) => { element(id).disabled = value; });
  ["send", "message"].forEach((id) => { element(id).disabled = value || !!reviewing(); });
  [...contextButtons, ...sceneButtons].forEach((button) => { button.disabled = value; });
  element("conversation").setAttribute("aria-busy", String(value));
  renderInformation();
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
function restoreHistory(view) {
  const conversation = element("conversation");
  const scrollTop = conversation.scrollTop;
  const following = conversation.scrollTop + conversation.clientHeight >= conversation.scrollHeight - 24;
  conversation.replaceChildren();
  (view.history || []).forEach((turn) => {
    entry("You", turn.message, "player");
    entry(turn.speaker ? "NPC dialogue · " + turn.speaker : "Dungeon Master", turn.reply, turn.speaker ? "dialogue" : "reply");
    turn.cards.forEach((card) => {
      // Old saves keep their full authoritative cards. Display overlapping NPC
      // speech once, while retaining any separate mechanical consequences.
      const normalize = (value) => value.replace(/\\s+/g, " ").trim();
      const reply = normalize(turn.reply);
      const text = turn.speaker ? card.text.split("\\n").filter((line) => {
        const content = normalize(line);
        return !content || !reply.includes(content);
      }).join("\\n").trim() : card.text;
      if (text) { entry(card.title, text, "result"); }
    });
    entry("Save status", turn.notice, "notice");
  });
  // A reply may arrive while the player is reading older turns. Rebuilding
  // the saved transcript must not pull them away from that reading position.
  if (!following) { conversation.scrollTop = scrollTop; }
}
function list(id, values) {
  element(id).replaceChildren(...values.map((value) => {
    const item = document.createElement("li"); item.textContent = value; return item;
  }));
}
function render(view) {
  closeContext();
  sceneButtons = [];
  if (currentView && currentView.generation !== view.generation) {
    closeInformation();
    hintPollRevision = undefined;
    strongerRequestRevision = undefined;
    strongerError = undefined;
  }
  currentView = view;
  ["send", "message"].forEach((id) => { element(id).disabled = pending || !!reviewing(); });
  pollHints(view);
  Object.keys(panels).forEach((name) => { element("open-" + name).disabled = view.slot === "empty"; });
  if (view.slot === "empty") { closeInformation(); }
  renderInformation();
  text("seed", view.title + " · Seed " + view.seed + " · Single local save slot");
  const empty = view.slot === "empty";
  element("start").hidden = !empty;
  element("new-game").hidden = empty;
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
  text("combat", scene.combatStatus || (view.character.combatTurn ? "Turn: " + view.character.combatTurn : "No active combat."));
  text("session", scene.outcome + (reviewing() ? " · Review mode" : ""));
  contextList("exits", scene.room.exits.map((exit) => ({ ...exit, contextId: "exit:" + exit.destinationId })));
  contextList("details", [
    ...scene.room.features.map((feature) => ({ ...feature, contextId: "target:" + feature.id })),
    ...(scene.room.npcs || []).map((npc) => ({ ...npc, contextId: "npc:" + npc.id })),
    ...view.character.collectedItems.map((item) => ({ ...item, contextId: "inventory:" + item.id })),
    ...scene.room.items.map((item) => ({ ...item, contextId: "target:" + item.id })),
    ...scene.room.opponents.map((opponent) => ({ ...opponent, contextId: "target:" + opponent.id })),
    ...((scene.endingChoices || []).length ? [{ name: "Ending choices", contextId: "ending" }] : [])
  ]);
}
async function read(start = false) {
  if (pending) { return; }
  busy(true);
  text("feedback", start ? "Saving the opening…" : "Reading current state…");
  try {
    const response = await fetch(start ? "/api/start" : "/api/state", { method: start ? "POST" : "GET" });
    let view = await response.json();
    if (!response.ok) { throw new Error(view.error || "Unable to read the save slot."); }
    if (view.recovery === "unsaved") {
      const recovery = await fetch("/api/recover", { method: "POST" });
      const result = await recovery.json();
      if (result.view) { view = result.view; render(view); restoreHistory(view); }
      if (!recovery.ok) { throw new Error(result.error); }
    }
    render(view);
    restoreHistory(view);
    text("feedback", view.slot === "empty" ? "Ready to start." : view.recovery === "pending" ? "A turn is pending. Read current state again before continuing; do not repeat it." : "Saved progress and conversation loaded. Position " + view.position + ".");
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
async function submitTurn(message, body = { message }) {
  if (pending || reviewing()) { return; }
  if (!message.trim()) { return; }
  busy(true);
  entry("You", message, "player");
  if (!("optionId" in body)) { element("message").value = ""; }
  const waiting = entry("Dungeon Master", "Waiting for a complete reply…", "waiting");
  text("feedback", "Your message is pending…");
  try {
    const response = await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, revision: currentView.revision }) });
    const result = await response.json();
    // Another tab may have replaced the slot after this reply was produced.
    // Read the current generation before displaying a delayed turn response.
    if (result.view) {
      const latest = await currentResponseView(result.view);
      if (latest.generation !== result.view.generation) {
        render(latest); restoreHistory(latest);
        text("feedback", "The save slot was replaced in another tab. Current new game loaded; the old reply was discarded.");
        return;
      }
      result.view = latest;
    }
    if (result.view) { render(result.view); restoreHistory(result.view); }
    if (!response.ok) { throw new Error(result.error || "Unable to complete the turn."); }
    waiting.remove();
    restoreHistory(result.view);
    render(result.view);
    text("feedback", result.notice);
  } catch (error) {
    waiting.remove();
    try {
      const response = await fetch("/api/state");
      const view = await response.json();
      if (response.ok) { render(view); restoreHistory(view); }
    } catch { /* Read current state remains available when connection returns. */ }
    const message = error instanceof Error ? error.message : "Connection lost. Read current state before sending another action.";
    if (!reviewing()) { entry("Turn unavailable", message, "notice"); }
    text("feedback", message);
  } finally {
    busy(false);
    element(reviewing() ? "scene" : "message").focus();
  }
}
element("turn").addEventListener("submit", (event) => {
  event.preventDefault();
  return submitTurn(element("message").value);
});
element("start").addEventListener("click", () => { void read(true); });
element("new-game").addEventListener("click", () => {
  if (pending || !currentView || currentView.slot !== "occupied") { return; }
  replacementView = currentView;
  text("new-game-description", "Your existing progress, conversation history, replies, result cards and both hint levels will be replaced. Start a new Hollow Beacon adventure with seed " + replacementView.newGameSeed + "?");
  element("new-game-confirmation").showModal();
  element("cancel-new-game").focus();
});
element("cancel-new-game").addEventListener("click", () => { element("new-game-confirmation").close(); });
element("new-game-confirmation").addEventListener("close", () => { element("new-game").focus({ preventScroll: true }); });
element("confirm-new-game").addEventListener("click", async () => {
  if (pending || !replacementView) { return; }
  const before = replacementView;
  element("new-game-confirmation").close();
  busy(true);
  let replaced = false;
  text("feedback", "Replacing the save slot…");
  try {
    const response = await fetch("/api/new-game", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: before.revision, seed: before.newGameSeed, confirmed: true }) });
    const result = await response.json();
    if (!response.ok) { throw new Error(result.error || "New game replacement failed. Read current state."); }
    const latest = await currentResponseView(result.view);
    element("message").value = "";
    render(latest);
    restoreHistory(latest);
    text("feedback", latest.generation === result.view.generation ? "New game saved. Seed " + latest.seed + ". Previous progress and conversation replaced." : "The save slot was replaced again in another tab. Current new game loaded.");
    replaced = true;
    element("scene").focus();
  } catch (error) {
    text("feedback", error instanceof Error ? error.message : "Connection lost during replacement. Read current state before trying again.");
  } finally {
    busy(false); replacementView = undefined;
    if (!replaced) { element("new-game").focus(); }
  }
});
element("refresh").addEventListener("click", () => { void read(); });
void read();`;
