// The `--5e` browser page (until #137): the 5e character library, the
// creation screen, the character sheet and the adventure screen. Bundled into
// dist so the extracted package serves the same interface. The script builds
// every element with textContent, never HTML from data.
export const FIFTH_BROWSER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dungeon One</title><link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script></head>
<body><a class="skip" href="#content">Skip to content</a>
<header class="masthead"><span class="brand-mark" aria-hidden="true">◇</span><div><p class="eyebrow">5E PREVIEW</p><h1>Dungeon One</h1></div></header>
<main id="content" tabindex="-1">
<nav id="breadcrumb" aria-label="Breadcrumb"><ol id="breadcrumb-list"></ol></nav>
<p id="feedback" role="status" aria-live="polite"></p>
<section id="library" class="panel" aria-labelledby="library-title">
<h2 id="library-title" tabindex="-1">Your Fighters</h2>
<ul id="characters" class="list"></ul>
<p id="no-characters" class="hint" hidden>No characters yet.</p>
<button id="open-creation" type="button">Create a Fighter</button>
</section>
<section id="creation" class="panel" aria-labelledby="creation-title" hidden>
<h2 id="creation-title" tabindex="-1">Create a Fighter</h2>
<p class="hint">Your six ability rolls are 4d6, dropping the lowest die. They were rolled once and saved before you saw them: reloading, restarting or leaving this screen shows the same dice, and there are no rerolls. Until you save, you can place the rolls on any abilities and change your other choices.</p>
<h3>Your rolls</h3>
<ol id="rolls" class="rolls"></ol>
<form id="creation-form" novalidate>
<fieldset id="placement"><legend>Place the rolls</legend><p class="hint">Choosing a roll that is already placed swaps the two abilities.</p><div id="placement-fields" class="grid"></div></fieldset>
<fieldset id="increase"><legend>Background ability increase</legend><p class="hint">Give +2 to one ability and +1 to another, or +1 to three. No score can exceed 20.</p><div id="increase-fields" class="grid"></div></fieldset>
<fieldset id="skills"><legend>Two skill proficiencies</legend><div id="skill-fields" class="checks"></div></fieldset>
<fieldset id="styles"><legend>Fighting Style</legend><div id="style-fields" class="checks"></div></fieldset>
<label for="character-name">Name</label><input id="character-name" maxlength="40" autocomplete="off" required>
<section id="preview" aria-labelledby="preview-title" aria-live="polite"><h3 id="preview-title">Before you save</h3><div id="preview-body"></div></section>
<p id="creation-error" class="error" role="alert"></p>
<div class="controls"><button id="save-character" type="submit">Save character</button><button id="close-creation" type="button" class="secondary">Cancel</button></div>
</form>
</section>
<section id="sheet" class="panel" aria-labelledby="sheet-name" hidden>
<h2 id="sheet-name" tabindex="-1"></h2>
<div id="sheet-body"></div>
<section id="sheet-adventures" aria-labelledby="sheet-adventures-title"><h3 id="sheet-adventures-title">Adventures</h3><div id="adventure-choices"></div><p id="start-error" class="error" role="alert"></p></section>
<div class="controls"><button id="delete-character" type="button" class="danger">Delete character</button></div>
</section>
<section id="adventure" class="panel" aria-labelledby="adventure-title" hidden>
<p id="adventure-meta" class="eyebrow dark"></p>
<h2 id="adventure-title" tabindex="-1"></h2>
<p id="adventure-objective" class="hint"></p>
<section id="room" aria-labelledby="room-title"><h3 id="room-title"></h3><p id="room-description"></p><p id="character-hp" class="hint"></p>
<h4 id="exits-title">Exits</h4><ul id="exits" class="things" aria-labelledby="exits-title"></ul>
<h4 id="features-title">Features</h4><ul id="features" class="things" aria-labelledby="features-title"></ul>
<h4 id="room-items-title">Items here</h4><ul id="room-items" class="things" aria-labelledby="room-items-title"></ul>
<h4 id="inventory-title">You carry</h4><ul id="inventory" class="things" aria-labelledby="inventory-title"></ul>
</section>
<section id="encounter" aria-labelledby="encounter-title"><h3 id="encounter-title">Fight</h3>
<p id="turn" aria-live="polite"></p><p id="economy" class="hint"></p>
<div class="table-wrap"><table id="initiative"><caption class="hint">Initiative order: each combatant rolled d20 + its initiative bonus.</caption><thead><tr><th scope="col">Turn</th><th scope="col">Combatant</th><th scope="col">Initiative</th><th scope="col">HP</th><th scope="col">AC</th></tr></thead><tbody id="initiative-rows"></tbody></table></div>
<div id="attack-controls" class="controls"></div><div id="feature-controls" class="controls"></div>
</section>
<section id="ending" aria-labelledby="ending-title" hidden><h3 id="ending-title"></h3><p id="ending-text"></p></section>
<h3>What happened</h3>
<ol id="log" class="log" aria-live="polite"></ol>
<p id="adventure-error" class="error" role="alert"></p>
<form id="message-form" novalidate><label for="message">Tell the Dungeon Master what you do</label><input id="message" maxlength="1000" autocomplete="off"><div class="controls"><button id="send-message" type="submit">Send</button></div></form>
</section>
</main>
<dialog id="delete-dialog" aria-labelledby="delete-title" aria-describedby="delete-warning">
<form id="delete-form" novalidate>
<h2 id="delete-title">Delete <span id="delete-name"></span>?</h2>
<p id="delete-warning" class="hint">Deleting is permanent. There is no undo, archive or recycle bin. Your pending creation, if you have one, keeps its dice.</p>
<label for="delete-confirm-name">Type <strong id="delete-name-hint"></strong> exactly to confirm</label><input id="delete-confirm-name" autocomplete="off" spellcheck="false">
<p id="delete-error" class="error" role="alert"></p>
<div class="controls"><button id="confirm-delete" type="submit" class="danger" disabled>Delete</button><button id="cancel-delete" type="button" class="secondary">Cancel</button></div>
</form>
</dialog></body></html>`;

export const FIFTH_BROWSER_CSS = `:root{color-scheme:light;font-family:Georgia,serif;color:#292b27;background:#151f23;font-size:17px;line-height:1.55;--ink:#263d3d;--gold:#d5b474;--line:#d4c9b5;--paper:#f7f0e1}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top,#304043,#151f23 75%);min-height:100dvh}h1,h2,h3,p{margin:0 0 12px}h1{font-size:1.4rem;line-height:1.1}h2{font-size:1.45rem;line-height:1.2}h3{font-size:1.05rem;margin-top:16px}
button,legend,label,.eyebrow,.hint,.error,#feedback,table,.stats,.features{font-family:system-ui,sans-serif}button{font-size:.85rem;border:1px solid var(--ink);background:var(--ink);color:#fff9e9;padding:10px 14px;border-radius:6px;cursor:pointer;line-height:1.4}button:hover{background:#3a5451}button:disabled{opacity:.55;cursor:default}button.secondary{background:transparent;color:var(--ink);border-color:var(--line)}button.secondary:hover{background:#e8dec9}:focus-visible{outline:3px solid #bb762c;outline-offset:3px}[hidden]{display:none!important}
.skip{position:absolute;top:-100px;left:12px;background:var(--paper);padding:10px;z-index:20}.skip:focus{top:12px}
.masthead{max-width:860px;margin:auto;padding:16px;display:flex;align-items:center;gap:12px;color:#f7edda}.brand-mark{font-size:2rem;color:var(--gold)}.eyebrow{font-size:.62rem;letter-spacing:.18em;color:var(--gold);margin-bottom:6px}
main{max-width:860px;margin:0 auto 24px;padding:0 16px}.panel{background:var(--paper);border:1px solid #81785e;border-radius:10px;padding:20px;margin-bottom:16px;min-width:0}
#feedback{color:#f7edda;font-size:.85rem}#breadcrumb ol{list-style:none;display:flex;flex-wrap:wrap;padding:0;margin:0 0 12px;font:.85rem system-ui,sans-serif;color:#f7edda;overflow-wrap:anywhere}#breadcrumb li+li::before{content:"›"/"";margin:0 8px;color:var(--gold)}#breadcrumb a{color:var(--gold)}#breadcrumb-list:empty{display:none}#feedback:empty{display:none}.hint{font-size:.85rem;color:#615f50}.error{color:#883c2d;font-size:.85rem;font-weight:600}.error:empty{display:none}
.list{list-style:none;padding:0;margin:0 0 14px;display:grid;gap:8px}.list button{width:100%;text-align:left;background:#fffaf0;color:#292b27;border-color:var(--line);display:flex;flex-direction:column}.list button:hover{background:#efe5d0}.list strong{font:600 1rem Georgia,serif}.list span{font-size:.78rem;color:#615f50}
.rolls{padding-left:0;list-style:none;display:grid;gap:6px;font-family:system-ui,sans-serif}.rolls li{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.die{display:inline-grid;place-items:center;width:30px;height:30px;border:1px solid #8a7d5e;border-radius:6px;background:#fffaf0;font-weight:700}.die.dropped{opacity:.55;text-decoration:line-through;border-style:dashed}.total{font-weight:700;margin-left:6px}.roll-name{min-width:52px;font-size:.85rem}
fieldset{border:1px solid var(--line);border-radius:8px;margin:0 0 14px;padding:12px;min-width:0}legend{font-weight:600;font-size:.9rem;padding:0 4px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px 14px}.grid label{display:flex;flex-direction:column;font-size:.82rem;font-weight:600}select,input{font:1rem system-ui,sans-serif;padding:8px;border:1px solid #9b9b83;border-radius:6px;background:#fffaf0;color:#292b27;width:100%;min-width:0;margin-top:4px}label[for=character-name]{display:block;font-weight:600;font-size:.85rem}
.checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px 14px}.checks label{display:flex;gap:8px;align-items:flex-start;font-size:.85rem}.checks input{width:auto;padding:0;margin-top:4px;flex:none}.checks small{display:block;color:#615f50;font-weight:400}
#preview{border-top:1px solid var(--line);margin-top:16px}.stats{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:.88rem;margin:0 0 10px;padding:0;list-style:none}.stats li strong{margin-left:4px}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;font-size:.85rem;width:100%;margin-bottom:12px}th,td{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left}th{font-weight:600;color:#4b4a3c}
button.danger{background:#883c2d;border-color:#883c2d}button.danger:hover{background:#9f4936}
dialog{background:var(--paper);color:#292b27;border:1px solid #81785e;border-radius:10px;padding:20px;width:min(480px,calc(100vw - 32px));max-width:none}dialog::backdrop{background:rgba(10,16,18,.7)}dialog label{display:block;font-weight:600;font-size:.85rem;overflow-wrap:anywhere}
.features{font-size:.85rem;padding-left:18px}.features li{margin:6px 0}.controls{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.eyebrow.dark{color:#7a6331}.adventure-choice{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:8px}.adventure-choice p{margin-bottom:8px}
#turn{font-family:system-ui,sans-serif;font-weight:600}tr.current{background:#efe2c0}tr.defeated td,tr.defeated th{color:#8b8576;text-decoration:line-through}
.log{list-style:none;padding:0;margin:0 0 12px;display:grid;gap:8px;font-family:system-ui,sans-serif;font-size:.88rem}.log li{border-left:3px solid var(--line);padding:4px 10px}.log .player{font-weight:600}.card{background:#fffaf0;border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin-top:6px;white-space:pre-line}.card.rejection{border-color:#883c2d}.card .dice{display:block;color:#615f50;font-size:.78rem;margin-top:4px}
h4{font:600 .85rem system-ui,sans-serif;margin:12px 0 6px;color:#4b4a3c}.things{list-style:none;padding:0;margin:0;display:grid;gap:6px;font-family:system-ui,sans-serif;font-size:.85rem}.things li{border:1px solid var(--line);border-radius:6px;padding:6px 10px;background:#fffaf0}.things li.none{border:0;background:none;padding:0;color:#615f50}.things p{margin:0}.things .discovery{color:#5b4a22;margin-top:4px}.things .controls{margin-top:6px}.things button{padding:6px 10px}#character-hp{font-weight:600}
#ending{border:2px solid var(--gold);border-radius:8px;padding:12px;margin:12px 0}#message-form label{display:block;font-weight:600;font-size:.85rem}
@media(max-width:560px){#initiative th,#initiative td{padding:5px 3px}#initiative th:first-child,#initiative td:first-child{display:none}#initiative td{white-space:nowrap}#initiative .roll-off{display:block;white-space:normal;font-size:.78rem}.panel{padding:14px}.masthead{padding:12px 16px}h2{font-size:1.25rem}.grid,.checks{grid-template-columns:1fr}.die{width:28px;height:28px}}
@media(prefers-reduced-motion:no-preference){button{transition:background .15s ease,border-color .15s ease}}`;

export const FIFTH_BROWSER_SCRIPT = String.raw`"use strict";
const element = (id) => document.getElementById(id);
const make = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
};
const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const signed = (value) => (value >= 0 ? "+" : "") + value;
const damageText = (damage) => damage.dice + "d" + damage.sides + (damage.modifier === 0 ? "" : " " + (damage.modifier > 0 ? "+ " : "− ") + Math.abs(damage.modifier));
let library;
let choices;
let previewRequest = 0;
let shownSheetId;
let restoreFocusOnClose = true;

async function request(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Request failed.");
  return value;
}

// Each view has its own history entry and URL: the library is the bare page,
// the others a hash (#create, #character-<id>, #adventure-<id>), so a reload
// or Back and Forward return to the view without the server routing them.
let routeTicket = 0;

/** Shows one view, titles the page and draws its breadcrumb under Characters. */
function show(id, title, trail) {
  for (const panel of ["library", "creation", "sheet", "adventure"]) element(panel).hidden = panel !== id;
  document.title = title + " · Dungeon One";
  const items = [{ label: "Characters", hash: "" }, ...trail];
  element("breadcrumb-list").replaceChildren(...items.map((item, index) => {
    const entry = make("li");
    if (index === items.length - 1) {
      const current = make("span", item.label);
      current.setAttribute("aria-current", "page");
      entry.append(current);
      return entry;
    }
    const link = make("a", item.label);
    link.href = item.hash || location.pathname;
    link.dataset.view = item.hash ? "sheet" : "library";
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      go(item.hash);
    });
    entry.append(link);
    return entry;
  }));
}

/** Opens a view as a new history entry, or in place of the current one. */
function go(hash, replace) {
  const url = hash || location.pathname;
  if (replace) history.replaceState(null, "", url);
  else if (url !== location.pathname + location.hash) history.pushState(null, "", url);
  route(true);
}

/** Shows the view the URL names; one that no longer exists falls back to the library. */
function route(focus) {
  const ticket = ++routeTicket;
  feedback("");
  if (element("delete-dialog").open) {
    restoreFocusOnClose = false;
    element("delete-dialog").close();
  }
  const hash = location.hash;
  const character = /^#character-([a-f0-9]{32})$/.exec(hash);
  const adventure = /^#adventure-([a-f0-9]{32})$/.exec(hash);
  if (hash === "#create") openCreation(ticket);
  else if (character) {
    if (findEntry(character[1])) openSheet(character[1]); else lost("That character no longer exists.");
  } else if (adventure) openAdventure(adventure[1], ticket);
  else if (hash) lost("There is no such page.");
  else showLibrary(focus);
}

function lost(message) {
  history.replaceState(null, "", location.pathname);
  showLibrary(true);
  feedback(message);
}

function showLibrary(focus) {
  renderLibrary();
  show("library", "Characters", []);
  if (focus) element("library-title").focus();
}

const characterStatus = (entry) => entry.defeated ? "Defeated" : entry.session ? "On an adventure" : "";

function feedback(message) { element("feedback").textContent = message; }

function renderLibrary() {
  const list = element("characters");
  list.replaceChildren(...library.characters.map((entry) => {
    const { sheet, profile } = entry;
    const button = make("button");
    button.type = "button";
    const status = characterStatus(entry);
    button.append(make("strong", sheet.name), make("span", "Level " + sheet.level + " Fighter · HP " + sheet.hp + "/" + profile.maxHp + " · AC " + profile.armorClass + (status ? " · " + status : "")));
    button.addEventListener("click", () => go("#character-" + sheet.id));
    const item = make("li");
    item.append(button);
    return item;
  }));
  element("no-characters").hidden = library.characters.length > 0;
  element("open-creation").textContent = library.pendingCreation ? "Continue creating your Fighter" : "Create a Fighter";
}

function abilityTable(abilities, profile, caption) {
  const wrap = make("div", undefined, "table-wrap");
  const table = make("table");
  table.append(make("caption", caption, "hint"));
  const head = make("tr");
  for (const label of ["Ability", "Score", "Modifier", "Saving throw"]) {
    const cell = make("th", label);
    cell.scope = "col";
    head.append(cell);
  }
  table.append(head);
  for (const ability of library.abilities) {
    const row = make("tr");
    const name = make("th", titleCase(ability));
    name.scope = "row";
    const save = profile.savingThrows[ability];
    row.append(name, make("td", abilities[ability]), make("td", signed(profile.modifiers[ability])), make("td", signed(save.bonus) + (save.proficient ? " (proficient)" : "")));
    table.append(row);
  }
  wrap.append(table);
  return wrap;
}

function profileNodes(abilities, profile, hp) {
  const stats = make("ul", undefined, "stats");
  const entries = [
    ["HP", (hp === undefined ? profile.maxHp : hp) + "/" + profile.maxHp],
    ["AC", profile.armorClass],
    ["Initiative", signed(profile.initiative)],
    ["Proficiency bonus", signed(profile.proficiencyBonus)],
    ["Mace", signed(profile.attack.bonus) + " to hit, " + damageText(profile.attack.damage) + " " + profile.attack.damage.type + ", " + profile.attack.mastery + (profile.attack.criticalRange === 19 ? ", critical on 19–20" : "")],
  ];
  for (const [label, value] of entries) {
    const item = make("li", label + ": ");
    item.append(make("strong", value));
    stats.append(item);
  }
  const skills = make("p", "Skills: " + profile.skills.filter((skill) => skill.proficient).map((skill) => skill.name + " " + signed(skill.bonus)).join(", ") + ".", "hint");
  const features = make("ul", undefined, "features");
  for (const feature of profile.features) {
    const item = make("li");
    item.append(make("strong", feature.name + ". "), document.createTextNode(feature.text));
    features.append(item);
  }
  return [stats, abilityTable(abilities, profile, "Ability scores and saving throws"), skills, make("h3", "Features"), features];
}

const findEntry = (id) => library.characters.find(({ sheet }) => sheet.id === id);

function openSheet(id) {
  const entry = findEntry(id);
  if (!entry) return;
  const { sheet, profile } = entry;
  shownSheetId = sheet.id;
  element("sheet-name").textContent = sheet.name;
  const summary = make("p", "Level " + sheet.level + " Fighter · " + sheet.xp + " XP" + (profile.nextLevelXp === undefined ? "" : " (level " + (sheet.level + 1) + " at " + profile.nextLevelXp + ")") + " · Chain shirt, shield and mace", "hint");
  const rolls = make("p", "Rolled: " + library.abilities.map((ability) => titleCase(ability) + " " + sheet.abilityRolls[ability].join(", ")).join("; ") + ". Background: " + Object.entries(sheet.backgroundIncrease).map(([ability, amount]) => "+" + amount + " " + titleCase(ability)).join(", ") + ".", "hint");
  element("sheet-body").replaceChildren(summary, ...profileNodes(sheet.abilities, profile, sheet.hp), rolls);
  renderAdventureChoices(entry);
  show("sheet", sheet.name, [{ label: sheet.name }]);
  element("sheet-name").focus();
}

function renderAdventureChoices(entry) {
  element("start-error").textContent = "";
  const choices = element("adventure-choices");
  if (entry.defeated) {
    choices.replaceChildren(make("p", entry.sheet.name + " was defeated and cannot start another adventure.", "hint"));
    return;
  }
  if (entry.session) {
    const title = (library.adventures.find(({ id }) => id === entry.session.adventureId) || { title: "an adventure" }).title;
    const button = make("button", "Continue " + title);
    button.type = "button";
    button.id = "continue-adventure";
    button.addEventListener("click", () => go("#adventure-" + entry.session.id));
    choices.replaceChildren(button);
    return;
  }
  choices.replaceChildren(...library.adventures.map((adventure) => {
    const box = make("div", undefined, "adventure-choice");
    box.append(make("strong", adventure.title), make("p", adventure.objective + " " + levelText(adventure.recommendedLevels) + " · " + titleCase(adventure.difficulty) + ".", "hint"));
    const button = make("button", "Start " + adventure.title);
    button.type = "button";
    button.className = "start-adventure";
    button.dataset.adventure = adventure.id;
    button.addEventListener("click", () => startAdventure(entry.sheet.id, adventure.id, button));
    box.append(button);
    return box;
  }));
}

let session;
let acting = false;

const levelText = ({ min, max }) => min === max ? "Level " + min : "Levels " + min + "–" + max;

async function startAdventure(characterId, adventureId, button) {
  button.disabled = true;
  try {
    const result = await request("/api/5e/adventures/start", { revision: library.revision, characterId, adventureId });
    library = result.library;
    session = result.session;
    go("#adventure-" + session.id);
  } catch (error) {
    element("start-error").textContent = error.message;
    button.disabled = false;
  }
}

async function openAdventure(sessionId, ticket) {
  if (!library.characters.some(({ session: active }) => active && active.id === sessionId)) {
    // An adventure that just ended stays viewable until the page reloads.
    if (session && session.id === sessionId) showAdventure(session);
    else lost("That adventure is no longer in progress.");
    return;
  }
  try {
    const result = await request("/api/5e/session", { sessionId });
    if (ticket !== routeTicket) return;
    library = result.library;
    showAdventure(result.session);
  } catch (error) {
    if (ticket === routeTicket) lost(error.message);
  }
}

function showAdventure(value) {
  session = value;
  element("adventure-error").textContent = "";
  renderAdventure();
  const entry = findEntry(session.characterId);
  const title = session.adventure.title;
  show("adventure", title, [...(entry ? [{ label: entry.sheet.name, hash: "#character-" + entry.sheet.id }] : []), { label: title }]);
  element("adventure-title").focus();
}

const diceText = (rolls) => "Dice: " + rolls.map(({ sides, value }) => "d" + sides + " " + value).join(", ");

function renderAdventure() {
  const { adventure, encounter } = session;
  element("adventure-meta").textContent = levelText(adventure.recommendedLevels) + " · " + titleCase(adventure.difficulty) + " · " + session.room.name;
  element("adventure-title").textContent = adventure.title;
  element("adventure-objective").textContent = adventure.objective;
  const playing = session.status === "playing";
  renderRoom(session.room);
  element("encounter").hidden = !encounter;
  if (encounter) {
    const current = encounter.combatants.find(({ id }) => id === encounter.currentTurn);
    element("turn").textContent = current ? "Round " + encounter.round + ": " + (current.id === encounter.playerId ? "your turn." : current.name + "'s turn.") : "The fight is over.";
    element("initiative-rows").replaceChildren(...encounter.combatants.map((combatant) => {
      const row = make("tr", undefined, (combatant.id === encounter.currentTurn ? "current" : "") + (combatant.defeated ? " defeated" : ""));
      row.dataset.combatant = combatant.id;
      if (combatant.id === encounter.currentTurn) row.setAttribute("aria-current", "true");
      const name = make("th", combatant.name + (combatant.id === encounter.playerId ? " (you)" : "") + (combatant.defeated ? " (defeated)" : "") + (combatant.sapped ? " (sapped)" : ""));
      name.scope = "row";
      const roll = combatant.initiative;
      const initiative = make("td", roll.d20 + " " + (roll.bonus >= 0 ? "+ " : "− ") + Math.abs(roll.bonus) + " = " + roll.total);
      if (roll.tieBreaks.length) initiative.append(make("span", " (roll-off " + roll.tieBreaks.join(", ") + ")", "roll-off"));
      row.append(
        make("td", combatant.id === encounter.currentTurn ? "▶ Now" : ""),
        name,
        initiative,
        make("td", combatant.hp + "/" + combatant.maxHp),
        make("td", combatant.armorClass),
      );
      return row;
    }));
  }
  element("attack-controls").replaceChildren(...session.targets.map((target) => {
    const button = make("button", "Attack " + target.name);
    button.type = "button";
    button.className = "attack";
    button.dataset.target = target.id;
    button.disabled = acting;
    button.addEventListener("click", () => attack(target.id));
    return button;
  }));
  const options = session.turn ? session.turn.options : [];
  const features = session.features;
  const left = (feature) => " (" + feature.uses + " of " + feature.max + " left)";
  element("feature-controls").replaceChildren(...FEATURE_BUTTONS.filter(({ action }) => options.includes(action)).map(({ action, label }) => {
    const button = make("button", label + (action === "second-wind" ? left(features.secondWind) : action === "action-surge" ? left(features.actionSurge) : ""));
    button.type = "button";
    button.className = action === "end-turn" ? "secondary" : "feature";
    button.dataset.action = action;
    button.disabled = acting;
    button.addEventListener("click", () => useFeature(action));
    return button;
  }));
  const turn = session.turn;
  element("economy").textContent = [
    turn ? "This turn: " + (turn.actions > 0 ? turn.actions + (turn.actions === 1 ? " action" : " actions") : "no action") + " left, bonus action " + (turn.bonusAction ? "available" : "used") + ", reaction " + (turn.reaction ? "available" : "used") + "." : "",
    features ? "Second Wind: " + features.secondWind.uses + " of " + features.secondWind.max + " uses left." + (features.actionSurge ? " Action Surge: " + features.actionSurge.uses + " of " + features.actionSurge.max + " left." : "") + " Uses return after the adventure." : "",
  ].filter(Boolean).join(" ");
  element("ending").hidden = !session.ending;
  if (session.ending) {
    element("ending-title").textContent = session.ending.title;
    element("ending-text").textContent = session.ending.text;
  }
  element("message").disabled = !playing || acting;
  element("send-message").disabled = !playing || acting;
  element("log").replaceChildren(...session.history.map((entry) => {
    const item = make("li");
    if (entry.player !== undefined) item.append(make("p", "You: " + entry.player, "player"));
    if (entry.reply && !entry.cards.some(({ text }) => text === entry.reply)) item.append(make("p", entry.reply, "reply"));
    for (const card of entry.cards) {
      const node = make("div", card.text, "card " + card.kind);
      node.setAttribute("role", "note");
      node.setAttribute("aria-label", card.kind === "result" ? "Resolved action" : "Action rejected");
      if (card.rolls.length) node.append(make("span", diceText(card.rolls), "dice"));
      item.append(node);
    }
    return item;
  }));
}

// Each list's entries, with a button for each action the engine accepts now.
const ROOM_LISTS = [
  { id: "exits", key: "exits", actions: [["move", "Go to "]] },
  { id: "features", key: "features", actions: [["examine", "Examine "]] },
  { id: "room-items", key: "items", actions: [["take", "Take "], ["examine", "Examine "]] },
  { id: "inventory", key: "inventory", actions: [["use", "Drink "], ["examine", "Examine "]] },
];

function renderRoom(room) {
  element("room-title").textContent = room.name;
  element("room-description").textContent = room.description;
  element("character-hp").textContent = "Your HP: " + room.character.hp + "/" + room.character.maxHp;
  for (const list of ROOM_LISTS) {
    const entries = room[list.key];
    element(list.id).replaceChildren(...(entries.length === 0 ? [make("li", "None.", "none")] : entries.map((entry) => {
      const item = make("li");
      item.dataset.id = entry.id;
      const text = make("p");
      text.append(make("strong", entry.name), document.createTextNode(" — " + entry.description));
      item.append(text);
      if (entry.discovery) item.append(make("p", "You found: " + entry.discovery, "discovery"));
      const buttons = list.actions.filter(([action]) => room.options[action].includes(entry.id)).map(([action, label]) => {
        const button = make("button", label + entry.name, "explore");
        button.type = "button";
        button.dataset.action = action;
        button.dataset.target = entry.id;
        button.disabled = acting;
        button.addEventListener("click", () => explore(action, entry.id));
        return button;
      });
      if (buttons.length) {
        const controls = make("div", undefined, "controls");
        controls.append(...buttons);
        item.append(controls);
      }
      return item;
    })));
  }
}

async function act(path, body) {
  acting = true;
  renderAdventure();
  element("adventure-error").textContent = "";
  try {
    const result = await request(path, { sessionId: session.id, sequence: session.sequence, ...body });
    library = result.library;
    session = result.session;
    if (result.rejection) element("adventure-error").textContent = result.rejection;
    return true;
  } catch (error) {
    element("adventure-error").textContent = error.message;
    return false;
  } finally {
    acting = false;
    renderAdventure();
  }
}

const FEATURE_BUTTONS = [
  { action: "second-wind", label: "Second Wind" },
  { action: "action-surge", label: "Action Surge" },
  { action: "end-turn", label: "End turn" },
];

function focusNextControl() {
  const next = document.querySelector("#attack-controls button, #feature-controls button, #room button.explore");
  (next || element("adventure-title")).focus();
}

async function attack(targetId) {
  await act("/api/5e/session/attack", { actorId: session.encounter.playerId, targetId });
  focusNextControl();
}

async function explore(action, target) {
  await act("/api/5e/session/explore", { action, target });
  focusNextControl();
}

async function useFeature(action) {
  await act("/api/5e/session/action", { action });
  focusNextControl();
}

async function sendMessage(event) {
  event.preventDefault();
  const message = element("message").value.trim();
  if (!message) return;
  if (await act("/api/5e/session/message", { message })) element("message").value = "";
  element("message").focus();
}

function defaultChoices() {
  return {
    placement: Object.fromEntries(library.abilities.map((ability, index) => [ability, index])),
    increase: { strength: 2, constitution: 1 },
    skills: ["athletics", "perception"],
    fightingStyle: "defense",
  };
}

function renderRolls() {
  const rolls = library.pendingCreation.rolls;
  element("rolls").replaceChildren(...rolls.map((roll, index) => {
    const item = make("li");
    item.setAttribute("aria-label", "Roll " + (index + 1) + ": " + roll.dice.map((die, position) => die + (position === roll.dropped ? " dropped" : "")).join(", ") + ", total " + roll.total);
    const name = make("span", "Roll " + (index + 1), "roll-name");
    name.setAttribute("aria-hidden", "true");
    item.append(name);
    roll.dice.forEach((die, position) => {
      const node = make("span", die, "die" + (position === roll.dropped ? " dropped" : ""));
      node.setAttribute("aria-hidden", "true");
      if (position === roll.dropped) node.title = "Dropped";
      item.append(node);
    });
    const total = make("span", "= " + roll.total, "total");
    total.setAttribute("aria-hidden", "true");
    item.append(total);
    return item;
  }));
}

function renderChoices() {
  const rolls = library.pendingCreation.rolls;
  element("placement-fields").replaceChildren(...library.abilities.map((ability) => {
    const label = make("label", titleCase(ability));
    const select = make("select");
    select.id = "place-" + ability;
    rolls.forEach((roll, index) => {
      const option = make("option", "Roll " + (index + 1) + ": " + roll.total);
      option.value = String(index);
      select.append(option);
    });
    select.value = String(choices.placement[ability]);
    select.addEventListener("change", () => {
      const chosen = Number(select.value);
      const other = library.abilities.find((candidate) => choices.placement[candidate] === chosen);
      choices.placement[other] = choices.placement[ability];
      choices.placement[ability] = chosen;
      renderChoices();
      element("place-" + ability).focus();
      preview();
    });
    label.append(select);
    return label;
  }));
  element("increase-fields").replaceChildren(...library.abilities.map((ability) => {
    const label = make("label", titleCase(ability));
    const select = make("select");
    select.id = "increase-" + ability;
    for (const amount of [0, 1, 2]) {
      const option = make("option", "+" + amount);
      option.value = String(amount);
      select.append(option);
    }
    select.value = String(choices.increase[ability] || 0);
    select.addEventListener("change", () => {
      const amount = Number(select.value);
      if (amount === 0) delete choices.increase[ability]; else choices.increase[ability] = amount;
      preview();
    });
    label.append(select);
    return label;
  }));
  element("skill-fields").replaceChildren(...library.skills.map((skill) => {
    const label = make("label");
    const box = make("input");
    box.type = "checkbox";
    box.id = "skill-" + skill.id;
    box.checked = choices.skills.includes(skill.id);
    box.addEventListener("change", () => {
      choices.skills = library.skills.map(({ id }) => id).filter((id) => element("skill-" + id).checked);
      preview();
    });
    const text = make("span", skill.name);
    text.append(make("small", titleCase(skill.ability)));
    label.append(box, text);
    return label;
  }));
  element("style-fields").replaceChildren(...library.fightingStyles.map((style) => {
    const label = make("label");
    const radio = make("input");
    radio.type = "radio";
    radio.name = "fighting-style";
    radio.id = "style-" + style.id;
    radio.checked = choices.fightingStyle === style.id;
    radio.addEventListener("change", () => { choices.fightingStyle = style.id; preview(); });
    const text = make("span", style.name);
    text.append(make("small", style.text));
    label.append(radio, text);
    return label;
  }));
}

async function preview() {
  const ticket = ++previewRequest;
  try {
    const result = await request("/api/5e/creation/preview", choices);
    if (ticket !== previewRequest) return;
    element("creation-error").textContent = "";
    element("preview-body").replaceChildren(...profileNodes(result.abilities, result.profile));
    element("save-character").disabled = false;
  } catch (error) {
    if (ticket !== previewRequest) return;
    element("creation-error").textContent = error.message;
    element("preview-body").replaceChildren(make("p", "Fix the choice above to see your numbers.", "hint"));
    element("save-character").disabled = true;
  }
}

async function openCreation(ticket) {
  try {
    library = await request("/api/5e/creation", {});
  } catch (error) {
    if (ticket === routeTicket) lost(error.message);
    return;
  }
  if (ticket !== routeTicket) return;
  choices = choices || defaultChoices();
  renderRolls();
  renderChoices();
  show("creation", "Create a Fighter", [{ label: "Create a Fighter" }]);
  element("creation-title").focus();
  await preview();
}

async function saveCharacter(event) {
  event.preventDefault();
  const name = element("character-name").value.trim();
  if (!name) {
    element("creation-error").textContent = "Enter a name for your Fighter.";
    element("character-name").focus();
    return;
  }
  element("save-character").disabled = true;
  try {
    library = await request("/api/5e/characters", { revision: library.revision, name, ...choices });
    choices = undefined;
    element("character-name").value = "";
    // The library appends the new character. Its sheet replaces the finished
    // creation in the history, so Back cannot reopen it and roll new dice.
    go("#character-" + library.characters[library.characters.length - 1].sheet.id, true);
    feedback(name + " is saved.");
  } catch (error) {
    element("creation-error").textContent = error.message;
    element("save-character").disabled = false;
  }
}

// The delete dialog opens only from a shown sheet, which is in the library.
const shownSheet = () => findEntry(shownSheetId).sheet;

// Deleting needs the exact name typed; Escape, Cancel and closing change nothing.
function openDelete() {
  const { name } = shownSheet();
  restoreFocusOnClose = true;
  element("delete-name").textContent = name;
  element("delete-name-hint").textContent = name;
  element("delete-confirm-name").value = "";
  element("delete-error").textContent = "";
  element("confirm-delete").disabled = true;
  element("delete-dialog").showModal();
  element("delete-confirm-name").focus();
}

function nameMatches() {
  return element("delete-confirm-name").value === shownSheet().name;
}

async function deleteCharacter(event) {
  event.preventDefault();
  if (!nameMatches()) return;
  const { id, name } = shownSheet();
  element("confirm-delete").disabled = true;
  try {
    library = await request("/api/5e/characters/delete", { revision: library.revision, characterId: id, name });
  } catch (error) {
    element("delete-error").textContent = error.message;
    element("confirm-delete").disabled = !nameMatches();
    return;
  }
  restoreFocusOnClose = false;
  element("delete-dialog").close();
  go("", true);
  feedback(name + " was permanently deleted.");
}

element("open-creation").addEventListener("click", () => go("#create"));
element("creation-form").addEventListener("submit", saveCharacter);
element("close-creation").addEventListener("click", () => go(""));
element("delete-character").addEventListener("click", openDelete);
element("delete-confirm-name").addEventListener("input", () => { element("confirm-delete").disabled = !nameMatches(); });
element("delete-form").addEventListener("submit", deleteCharacter);
element("cancel-delete").addEventListener("click", () => element("delete-dialog").close());
element("delete-dialog").addEventListener("close", () => { if (restoreFocusOnClose) element("delete-character").focus(); });
element("message-form").addEventListener("submit", sendMessage);
// The skip link moves focus without adding a history entry.
document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  element("content").focus();
});
window.addEventListener("popstate", () => { if (library) route(true); });
request("/api/5e/library").then((value) => {
  library = value;
  // A reload returns to the view the URL names.
  route(false);
}, (error) => feedback(error.message));
`;
