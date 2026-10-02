// Bundled into dist so the extracted package serves the same interface.
export const BROWSER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dungeon One</title><link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script></head>
<body><a class="skip" href="#scene">Skip to scene</a>
<header class="masthead"><div class="brand"><span class="brand-mark" aria-hidden="true">◇</span><div><p class="eyebrow">DUNGEON ONE</p><h1 id="adventure-title">Your adventure</h1></div></div>
<nav aria-label="Player tools">
<button id="open-characters" hidden>Choose character</button>
<button id="open-inventory" aria-controls="information" aria-expanded="false" disabled>Inventory</button>
<button id="open-character" aria-controls="information" aria-expanded="false" disabled>Character</button>
<button id="open-journal" aria-controls="information" aria-expanded="false" disabled>Journal</button>
<button id="open-hints" aria-controls="information" aria-expanded="false" disabled>Hints</button>
</nav><details id="game-menu"><summary>Game menu</summary><div class="menu-body"><p id="seed">Reading saved adventure…</p><p id="session"></p>
<div class="controls"><button id="new-game" hidden>New game</button><button id="refresh">Refresh adventure</button></div>
<details><summary>Character and last action details</summary><dl><dt>Defense</dt><dd id="defense">—</dd><dt>Attack</dt><dd id="attack">—</dd><dt>Conditions</dt><dd id="conditions">—</dd></dl><p id="last-consequence">No action yet.</p></details></div></details></header>
<main id="scene" tabindex="-1" aria-labelledby="scene-title">
<section id="scene-context" aria-label="Current scene and adventure status">
<div id="scene-art" class="scene-art" aria-hidden="true"><svg viewBox="0 0 640 220" preserveAspectRatio="xMidYMid slice" focusable="false"><defs><linearGradient id="ink" x2="1" y2="1"><stop stop-color="#304645"/><stop offset="1" stop-color="#182c31"/></linearGradient></defs><path fill="url(#ink)" d="M0 0h640v220H0z"/><g fill="none" stroke="#c6af79" opacity=".35"><circle cx="465" cy="110" r="85"/><circle cx="465" cy="110" r="72"/><path d="M465 16v188M371 110h188M399 44l132 132M399 176L531 44"/></g><g fill="#314845" stroke="#d6be8b" stroke-width="1.5"><path d="M465 45l60 35v70l-60 35-60-35V80z"/><path d="M465 45l-35 84 35 56 35-56z" fill="#243b3e"/><path d="M405 80l25 49-25 21m120-70l-25 49 25 21M405 80l95 49m25-49l-95 49m0 0h70" fill="none"/></g><g fill="#d6be8b" opacity=".55"><path d="M308 53l3 7 7 3-7 3-3 7-3-7-7-3 7-3zM579 151l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><circle cx="569" cy="37" r="1.5"/><circle cx="353" cy="171" r="1.5"/></g></svg></div>
<img id="location-artwork" class="scene-art" alt="" hidden>
<div class="scene-copy"><p class="eyebrow" id="scene-eyebrow">YOUR ADVENTURE</p><h2 id="scene-title">Your next adventure awaits</h2><p id="scene-summary">Reading your adventure…</p>
<details id="scene-reading"><summary>Read the scene</summary><p id="description">Checking for an existing adventure…</p><p id="objective"></p></details>
<button id="start" hidden>Start adventure</button><p id="completion" hidden></p></div>
<dl id="journey-status" aria-label="Current position and resources"><div><dt>Location</dt><dd id="location">Not started</dd></div><div class="health"><dt id="hp-label">HP</dt><dd id="hp">—</dd><progress id="health-bar" max="20" value="20" aria-hidden="true"></progress></div><div><dt>Time</dt><dd id="time">—</dd></div><div id="deadline-status" class="deadline"><dt id="deadline-label">Deadline</dt><dd id="deadline">—</dd></div></dl>
</section>
<section id="story" aria-labelledby="conversation-title"><div class="story-heading"><h2 id="conversation-title">Your adventure</h2><span id="save-indicator" role="status">Ready</span></div>
<div id="conversation" role="log" aria-live="polite" aria-label="Adventure conversation"></div>
<form id="turn" hidden><label for="message">What do you do or ask?</label><div class="composer"><textarea id="message" maxlength="1000" rows="2" required aria-describedby="message-help" placeholder="Describe one action, or ask a question."></textarea><button id="send" type="submit">Send message</button></div><p id="message-help">Enter to send · Shift+Enter for a new line</p></form><p id="feedback" role="status" aria-live="polite"></p>
</section>
<aside id="information-navigation" aria-label="Choices and player information">
<section id="information" aria-labelledby="information-title" hidden><div class="context-heading"><h2 id="information-title" tabindex="-1"></h2><button id="close-information">Close information</button></div>
<nav id="journal-tabs" aria-label="Journal views" hidden><button id="journal-evidence" aria-pressed="true">Evidence</button><button id="open-leads" aria-controls="information" aria-expanded="false" aria-pressed="false" disabled>Leads</button></nav>
<div id="information-body"></div><div id="stronger-hint" hidden><button id="request-stronger-hint" type="button" aria-describedby="stronger-hint-result">Request a stronger hint</button><p id="stronger-hint-result" role="status" aria-live="polite" aria-atomic="true"></p></div></section>
<div id="scene-options"><section id="combat-panel" aria-labelledby="combat-title" hidden><p class="eyebrow">ENCOUNTER</p><h2 id="combat-title"></h2><p id="combat-health"></p><p id="combat-turn"></p><p id="combat"></p><div id="combat-actions" class="controls"></div></section>
<div id="context" aria-label="Selected context" hidden><div class="context-heading"><h3 id="context-title" tabindex="-1"></h3><button id="close-context">Close options</button></div><p id="context-description"></p><div id="context-actions"></div></div>
<h2 id="details-title" hidden>In view</h2><ul id="details"></ul><h2 id="exits-title">Explore</h2><p id="travel-notice" hidden>Travel is unavailable during combat. You can still inspect a route.</p><ul id="exits"><li>Start to explore.</li></ul></div>
</aside></main>
<dialog id="new-game-confirmation" aria-labelledby="new-game-title" aria-describedby="new-game-description"><h2 id="new-game-title">Replace this adventure?</h2><p id="new-game-description"></p><div class="controls"><button id="cancel-new-game" autofocus>Cancel</button><button id="confirm-new-game">Replace and start new game</button></div></dialog><dialog id="character-library" aria-labelledby="library-title"><h2 id="library-title">Your characters</h2><p>Save a character independently, then choose an adventure.</p><p id="library-feedback" role="status"></p><div id="library-characters"></div><button id="show-create-character" type="button">Create character</button><form id="create-character" hidden><h3>Create a Fighter</h3><label for="character-name">Character name</label><input id="character-name" maxlength="40" required><label for="character-preset">Ability preset</label><select id="character-preset"><option value="balanced">Balanced</option><option value="stout">Stout � strength and endurance</option><option value="scout">Scout � agility and awareness</option></select><p id="preset-scores"></p><button type="submit">Save character</button><button id="cancel-create-character" type="button">Cancel creation</button></form><section id="library-sheet" hidden><h3 id="library-sheet-name"></h3><p id="library-sheet-details"></p><p id="library-sheet-abilities"></p><div id="library-adventures"></div></section><h3>Saved adventures</h3><div id="library-sessions"></div><button id="close-characters" type="button">Close character library</button></dialog></body></html>`;

export const BROWSER_CSS = `:root{color-scheme:light;font-family:Georgia,serif;color:#292b27;background:#151f23;font-size:17px;line-height:1.55;--ink:#263d3d;--gold:#d5b474;--line:#d4c9b5;--paper:#f7f0e1}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top,#304043,#151f23 75%);min-height:100dvh}h1,h2,h3,p{margin:0 0 12px}h1{font-size:1.4rem;line-height:1.1}h2{font-size:1.45rem;line-height:1.2}h3{font-size:1.05rem}button,summary,dt,.eyebrow,.story-heading,#feedback,#message-help{font-family:system-ui,sans-serif}button,summary{font-size:.8rem}button{border:1px solid var(--ink);background:var(--ink);color:#fff9e9;padding:10px 14px;border-radius:6px;cursor:pointer;line-height:1.4}button:hover{background:#3a5451}button:disabled{opacity:.55;cursor:default}button.danger{background:#fff4e9;color:#883c2d;border-color:#b57561}button.danger:hover{background:#f5ded1}button.secondary{background:transparent;color:var(--ink);border-color:var(--line)}button.secondary:hover{background:#e8dec9}:focus-visible{outline:3px solid #bb762c;outline-offset:3px}[hidden]{display:none!important}.skip{position:absolute;top:-100px;left:12px;background:var(--paper);padding:10px;z-index:20}.skip:focus{top:12px}
.masthead{max-width:1480px;margin:auto;min-height:80px;padding:14px 24px;display:flex;align-items:center;gap:24px;color:#f7edda}.brand{display:flex;align-items:center;gap:12px;margin-right:auto}.brand-mark{font-size:2rem;color:var(--gold)}.eyebrow{font-size:.62rem;letter-spacing:.18em;color:#716448;margin-bottom:6px}.brand .eyebrow{color:var(--gold);font-size:.58rem}.masthead nav{display:flex;gap:6px}.masthead nav button{background:transparent;border-color:#61706a}.masthead nav button[aria-expanded="true"]{background:var(--gold);border-color:var(--gold);color:#182b2c}.masthead nav button:hover{background:#344a48}.masthead summary{cursor:pointer;color:#f4dec0;white-space:nowrap}#game-menu{position:relative}.menu-body{position:absolute;right:0;top:34px;background:var(--paper);color:#292b27;border:1px solid var(--gold);border-radius:8px;padding:18px;width:320px;max-width:calc(100vw - 32px);max-height:70dvh;overflow:auto;z-index:10;box-shadow:0 12px 30px #0005;font-size:.8rem}.menu-body summary{color:var(--ink);white-space:normal}.menu-body dl{display:grid;grid-template-columns:80px 1fr;gap:8px}.menu-body dd{margin:0}.menu-body #last-consequence{white-space:pre-wrap;font-family:system-ui,sans-serif}.controls{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
main{max-width:1480px;margin:0 auto 20px;padding:0 24px;display:grid;grid-template-columns:minmax(0,1fr) 340px;grid-template-rows:auto minmax(0,1fr);gap:16px;height:calc(100dvh - 104px);min-height:530px}section,aside{min-width:0}#scene-context,#story,#information-navigation{background:var(--paper);border:1px solid #81785e;border-radius:10px;box-shadow:0 8px 24px #0002}#scene-context{position:relative;overflow:visible;grid-column:1;grid-row:1}.scene-art{position:absolute;right:0;top:0;width:40%;height:100%;max-height:240px;border-radius:0 9px 0 0;object-fit:cover;opacity:.9;pointer-events:none}.scene-art svg{width:100%;height:100%}.scene-copy{position:relative;padding:20px 24px 12px;max-width:66%;background:linear-gradient(90deg,var(--paper) 88%,#f7f0e100)}#scene-summary{font-size:1rem;line-height:1.5;margin-bottom:8px}#scene-title{font-size:1.85rem;letter-spacing:-.03em;margin-bottom:8px}#scene-reading summary{color:#586054;font-size:.72rem;cursor:pointer}#scene-reading[open]{background:var(--paper);position:relative;width:152%;z-index:1;padding:8px 0}#description{white-space:pre-wrap;margin-top:10px}#objective{font: .8rem/1.5 system-ui,sans-serif;color:#615f50}#completion{font:600 .8rem system-ui,sans-serif;color:#5b4323}#journey-status{position:relative;display:flex;flex-wrap:wrap;gap:10px 22px;margin:0;padding:12px 24px;background:#ebe2cf;border-top:1px solid var(--line);border-radius:0 0 9px 9px;font: .74rem/1.4 system-ui,sans-serif}#journey-status div{min-width:0}#journey-status dt,#journey-status dd{display:inline;margin:0}#journey-status dt{color:#656451;margin-right:6px}#journey-status dd{font-weight:600}#health-bar{display:block;width:100%;height:3px;border:0;margin-top:3px;appearance:none;background:#c8bfad}#health-bar::-webkit-progress-bar{background:#c8bfad}#health-bar::-webkit-progress-value{background:#466458}#health-bar::-moz-progress-bar{background:#466458}#journey-status .deadline{flex:1;overflow-wrap:anywhere}
#story{grid-column:1;grid-row:2;display:flex;flex-direction:column;padding:16px 24px;min-height:300px}.story-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;margin-bottom:8px}.story-heading h2{font-size:1rem;margin:0}#save-indicator{font-size:.68rem;color:#4c695b}#conversation{flex:1;min-height:140px;overflow:auto;overflow-anchor:none;padding-right:8px}#conversation:empty::before{content:"Choose someone to talk to, explore a route, or describe your first action.";display:block;color:#74715e;font-style:italic;padding:14px 0}article{margin:10px 0;padding:12px 14px;border-left:3px solid #bfa97e;background:#efe7d7}article h4{font:600 .72rem system-ui,sans-serif;color:#586254;margin:0 0 5px}article p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}strong.text-emphasis{font-weight:700;color:#654921;background:#dfc38455;border-radius:3px;padding:0 .12em;box-decoration-break:clone;-webkit-box-decoration-break:clone}em.text-emphasis{font-style:italic;color:#654921}.player{background:#e8e5d8;border-color:#537268}.dialogue{background:#f0e1c4;border-color:#b88846}.dialogue p{font-style:italic}.result{background:#e8eadb;border-color:#648166;font:.82rem/1.55 system-ui,sans-serif}.notice{background:#f5e2d3;border-color:#a65c3b;font:.8rem/1.5 system-ui,sans-serif}.waiting{font-size:.85rem;color:#62634e}#turn{flex:none;padding-top:10px;margin-top:10px;border-top:1px solid var(--line)}label{display:block;font:600 .78rem system-ui,sans-serif;margin-bottom:6px}.composer{display:flex;align-items:stretch;gap:8px}textarea{width:100%;min-width:0;min-height:60px;height:60px;max-height:16dvh;resize:vertical;font:1rem/1.4 Georgia,serif;padding:10px 12px;border:1px solid #9b9b83;border-radius:6px;background:#fffaf0;color:#292b27}.composer button{flex:none}#message-help{font-size:.62rem;color:#696e5d;margin:5px 0 0}#feedback{font-size:.7rem;line-height:1.4;margin:6px 0 0;overflow-wrap:anywhere}#feedback:empty{display:none}
#information-navigation{grid-column:2;grid-row:1 / span 2;overflow:auto;padding:20px;min-height:0}#information-navigation h2{font-size:1rem;margin-bottom:12px}#details,#exits{list-style:none;padding:0;margin:0 0 18px}#details li{margin:0 0 8px;min-width:0}#details button{width:100%;text-align:left;display:flex;align-items:center;gap:10px;background:#eee4ce;color:var(--ink);border-color:#c9bda4;padding:10px}#details button:hover{background:#dfd3b8}.target-name{flex:1;min-width:0;overflow-wrap:anywhere}.target-kind{display:block;font: .64rem system-ui,sans-serif;color:#6c6c56}.avatar{width:32px;height:36px;flex:none;display:grid;place-items:center;border:1px solid #a79976;border-radius:6px;color:#675231;background:#ded0af;font:600 .8rem Georgia,serif}.avatar.person{border-radius:50%;background:radial-gradient(circle at 50% 30%,#d6bc87 22%,transparent 24%),radial-gradient(ellipse at 50% 95%,#566a5f 48%,#d8ccb1 50%);color:#192d2d;text-shadow:0 1px #efe2c5}.avatar.enemy{color:#8b3a2b;border-color:#b7856c;background:#e9cdb6}#exits{display:flex;flex-wrap:wrap;gap:6px}#exits li{max-width:100%}#exits .route-stakes{font:.64rem/1.4 system-ui,sans-serif;color:#834b33;margin:5px 0 8px;max-width:220px}#exits button{font-size:.72rem;padding:8px 10px;background:transparent;color:var(--ink);border-color:#a6a78c}#exits .blocked-route{border-style:dashed;color:#736e5b}#travel-notice{font: .74rem/1.5 system-ui,sans-serif;color:#82462f}#context{border:1px solid #b6a583;border-radius:8px;background:#fff8e9;padding:14px;margin-bottom:16px}.context-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px}.context-heading h2,.context-heading h3{margin:0}#close-context,#close-information{background:transparent;border:0;color:#616657;padding:4px;font-size:.65rem;text-decoration:underline;flex:none}#context-description{font-size:.82rem}#context-actions{display:flex;flex-wrap:wrap;gap:8px}#context-actions .action-option{width:100%}.action-option p{font: .72rem/1.5 system-ui,sans-serif;margin:6px 0 0;color:#67593f}.action-option button{max-width:100%;text-align:left}#combat-panel{background:#eee0ca;border:1px solid #bd9271;border-radius:8px;padding:14px;margin-bottom:16px}#combat-title{text-transform:capitalize}#combat-health{font:600 .9rem system-ui,sans-serif}#combat-turn{font:600 .78rem system-ui,sans-serif;color:#85503a}#combat{font: .7rem/1.45 system-ui,sans-serif}#combat-actions{gap:8px}#combat-actions button{flex:1}#journal-tabs{display:flex;gap:6px;margin-bottom:14px}#journal-tabs button{background:transparent;color:var(--ink);border-color:var(--line)}#journal-tabs button[aria-pressed="true"]{background:var(--ink);color:#fff8e8}#information-body h3{font-size:.88rem;margin-top:18px}#information-body ul{padding-left:18px;font-size:.82rem}#information-body li{margin:8px 0;overflow-wrap:anywhere}#information-body p{white-space:pre-wrap;font-size:.85rem}.inventory-item button{display:inline-block;margin:5px 5px 0 0}.inventory-item p{margin:5px 0}dialog{background:var(--paper);color:#292b27;border:1px solid var(--gold);border-radius:10px;padding:24px;max-width:min(520px,calc(100vw - 32px))}dialog{max-height:85dvh;overflow:auto}#library-sheet-details,#library-sheet-abilities,#preset-scores{white-space:pre-wrap;font: .85rem/1.5 system-ui,sans-serif}#character-library input,#character-library select{width:100%;padding:8px;margin-bottom:12px}#character-library h3{margin-top:16px}#library-characters button,#library-sessions button,#library-adventures button{margin:4px}dialog::backdrop{background:#101e24b3}
@media(min-width:1800px){main{max-width:1720px;grid-template-columns:minmax(0,1fr) 380px}.masthead{max-width:1720px}#conversation{font-size:1.1rem}}
@media(max-width:1050px){main{grid-template-columns:minmax(0,1fr) 290px;padding:0 16px;gap:12px}.masthead{padding:12px 16px;gap:12px}.scene-art{width:34%}.scene-copy{max-width:76%;padding:16px 18px 10px}#scene-title{font-size:1.6rem}#story{padding:14px 18px}#information-navigation{padding:14px}.masthead nav button{padding:8px 10px}}
@media(max-width:760px){.masthead{flex-wrap:wrap;gap:10px;padding:12px 14px}.brand{flex:1}.brand-mark{font-size:1.6rem}.masthead h1{font-size:1.2rem}.masthead nav{order:3;width:100%}.masthead nav button{flex:1}main{height:auto;min-height:0;display:flex;flex-direction:column;padding:0 12px;gap:12px}.scene-copy{max-width:80%;padding:16px 16px 10px}.scene-art{width:32%;opacity:.7}#scene-title{font-size:1.5rem}#scene-summary{font-size:.92rem}#scene-reading[open]{width:124%}#journey-status{padding:10px 16px;gap:7px 14px;font-size:.69rem}#journey-status .deadline{flex-basis:100%}#information-navigation{overflow:visible;padding:12px 14px}#scene-options{display:flex;flex-direction:column}#details{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}#details li{flex:1 1 140px;margin:0}#details button{height:100%;padding:7px;font-size:.72rem}.avatar{width:26px;height:28px}.target-kind{font-size:.58rem}#exits{margin:0}#information-navigation h2{margin-bottom:8px;font-size:.85rem}#context{order:5;margin:12px 0 0}#story{height:clamp(320px,50dvh,520px);padding:12px 14px}#conversation{min-height:160px;font-size:.95rem}#turn{position:sticky;bottom:0;background:var(--paper);z-index:2}.composer{gap:6px}.composer button{font-size:.7rem;padding:8px}#message-help{font-size:.58rem}#combat-actions button{flex:none}#combat-panel{margin-bottom:10px}#context-description{font-size:.8rem}}
@media(prefers-reduced-motion:no-preference){button{transition:background .15s ease,border-color .15s ease}}`;

export const BROWSER_SCRIPT = `"use strict";
const element = (id) => document.getElementById(id);
function styledText(target, value) {
  const content = String(value ?? "");
  // Only inline emphasis is supported. Build text elements rather than
  // interpreting provider prose as HTML, links or executable markup.
  const matches = [...content.matchAll(/(?<![\\\\*])(?:\\*\\*\\*([^*\\n]+)\\*\\*\\*|\\*\\*([^*\\n]+)\\*\\*|\\*([^*\\n]+)\\*)(?!\\*)/g)].filter((match) => (match[1] || match[2] || match[3]).trim());
  if (!matches.length) { target.textContent = content; return; }
  const parts = [];
  let position = 0;
  const plain = (value) => { const span = document.createElement("span"); span.textContent = value; parts.push(span); };
  for (const match of matches) {
    plain(content.slice(position, match.index));
    const emphasis = document.createElement(match[3] ? "em" : "strong");
    emphasis.className = "text-emphasis";
    const value = (match[1] || match[2] || match[3]).trim();
    if (match[1]) { const italic = document.createElement("em"); italic.textContent = value; emphasis.append(italic); }
    else { emphasis.textContent = value; }
    parts.push(emphasis);
    position = match.index + match[0].length;
  }
  plain(content.slice(position));
  target.replaceChildren(...parts);
}
const text = (id, value) => { styledText(element(id), value); };
let pending = false;
let currentView;
let activePanel;
let contextButtons = [];
let contextOpener;
let sceneButtons = [];
let informationButtons = [];
let contextTargets = new Map();
let hintPollRevision;
let strongerRequestRevision;
let strongerError;
let replacementView;
let failedArtwork;
element("location-artwork").addEventListener("error", () => {
  failedArtwork = element("location-artwork").getAttribute("src");
  element("location-artwork").hidden = true;
  element("scene-art").hidden = false;
});
function renderArtwork(artwork) {
  const show = artwork && artwork.src !== failedArtwork;
  element("scene-art").hidden = !!show;
  element("location-artwork").hidden = !show;
  if (show) {
    element("location-artwork").setAttribute("src", artwork.src);
    element("location-artwork").setAttribute("alt", artwork.alt);
  }
}
function sceneSummary(description) {
  const sentences = (description.match(/[^.!?]+[.!?]+(?:\\s|$)|[^.!?]+$/g) || [description]).slice(0, 2);
  const summary = sentences.join(" ").trim();
  return summary.length > 128 ? sentences[0].trim() : summary;
}
function revealComposer() {
  if (typeof window !== "undefined" && window.innerWidth <= 760) {
    element("turn").scrollIntoView({ block: "end" });
  }
}
element("message").addEventListener("focus", revealComposer);
if (typeof window !== "undefined" && window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    if (document.activeElement === element("message")) { revealComposer(); }
  });
}
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
        feedback( "The save slot was replaced in another tab. Current new game loaded; old hints were discarded.");
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
function closeContext(restoreFocus = false) {
  element("context").hidden = true;
  contextButtons = [];
  if (restoreFocus && contextOpener) { contextOpener.focus({ preventScroll: true }); }
  contextOpener = undefined;
}
function actionButton(action, buttons) {
  const button = document.createElement("button");
  button.textContent = action.label;
  button.disabled = pending || !!reviewing();
  if (action.call.name === "attack" && !currentView.scene.combat) { button.className = "danger"; }
  button.addEventListener("click", () => submitTurn(action.message, { optionId: action.id }));
  buttons.push(button);
  return button;
}
function chooseContext(id, name, opener) {
  if (pending || reviewing()) { return; }
  contextOpener = opener;
  text("context-title", name);
  text("context-description", contextTargets.get(id)?.description || "");
  element("context-actions").replaceChildren();
  contextButtons = [];
  for (const action of currentView.actions.filter((action) => action.contextId === id)) {
    const option = document.createElement("div"); option.className = "action-option";
    // Stakes precede commitment, including neutral-NPC violence and endings.
    if (action.stakes) { const stakes = document.createElement("p"); stakes.textContent = action.label + ": " + action.stakes; option.append(stakes); }
    option.append(actionButton(action, contextButtons));
    element("context-actions").append(option);
  }
  element("context").hidden = false;
  element("context-title").focus({ preventScroll: true });
}
function contextList(id, targets) {
  element(id).replaceChildren(...targets.map((target) => {
    contextTargets.set(target.contextId, target);
    const item = document.createElement("li");
    const offers = (currentView.actions || []).filter((action) => action.contextId === target.contextId);
    if (!offers.length) {
      const detail = target.condition || (!reviewing() && target.description);
      item.textContent = target.name + (detail ? " — " + detail : "");
      return item;
    }
    const button = document.createElement("button");
    const travel = offers.find((action) => action.call.name === "move");
    const blocked = id === "exits" && !!currentView.scene.combat && !travel;
    button.textContent = blocked ? "Inspect route: " + target.name : target.name;
    if (blocked) { button.className = "blocked-route"; }
    if (id === "details") {
      button.setAttribute("aria-label", target.name);
      const avatar = document.createElement("span"); avatar.className = "avatar " + (target.kind || "object"); avatar.setAttribute("aria-hidden", "true"); avatar.textContent = target.kind === "person" ? target.name.split(" ").map((word) => word[0]).slice(0, 2).join("") : target.kind === "enemy" ? "⚔" : target.kind === "item" ? "◇" : "✧";
      const label = document.createElement("span"); label.className = "target-name"; label.textContent = target.name;
      const kind = document.createElement("span"); kind.className = "target-kind"; kind.textContent = target.kind === "person" ? "Talk · options" : target.kind === "enemy" ? "Opponent" : target.kind === "item" ? "Item" : "Examine · options"; kind.setAttribute("aria-hidden", "true"); label.append(kind);
      button.replaceChildren(avatar, label);
    }
    button.addEventListener("click", () => travel ? submitTurn(travel.message, { optionId: travel.id }) : chooseContext(target.contextId, target.name, button));
    sceneButtons.push(button); button.disabled = pending; item.append(button);
    if (travel && travel.stakes) { const stakes = document.createElement("p"); stakes.className = "route-stakes"; stakes.textContent = travel.stakes; item.append(stakes); }
    return item;
  }));
}
element("close-context").addEventListener("click", () => { closeContext(true); });
element("context").addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); closeContext(true); } });
const panels = { inventory: "Inventory", character: "Your character", journal: "Journal", leads: "Journal", hints: "Hints" };
function informationBlock(heading, values, id) {
  const title = document.createElement("h3"); title.textContent = heading;
  const items = document.createElement("ul");
  if (id) { items.id = id; }
  values.forEach((value) => { const item = document.createElement("li"); styledText(item, value); items.append(item); });
  element("information-body").append(title, items);
}
function inventoryBlock(heading, items, empty, actionable = false) {
  if (!actionable || !items.length) { informationBlock(heading, items.length ? items.map((item) => item.name + (item.description ? ": " + item.description : "")) : [empty]); return; }
  const title = document.createElement("h3"); title.textContent = heading;
  const list = document.createElement("ul");
  items.forEach((item) => {
    const row = document.createElement("li"); row.className = "inventory-item";
    const description = document.createElement("p"); styledText(description, item.name + (item.description ? ": " + item.description : "")); row.append(description);
    (currentView.actions || []).filter((action) => action.contextId === "inventory:" + item.id).forEach((action) => {
      if (action.stakes) { const stakes = document.createElement("p"); stakes.textContent = action.stakes; row.append(stakes); }
      row.append(actionButton(action, informationButtons));
    });
    list.append(row);
  });
  element("information-body").append(title, list);
}
function renderInformation() {
  if (!activePanel || !currentView || currentView.slot === "empty") { return; }
  const status = currentView.character;
  const information = currentView.information;
  const journal = currentView.scene.journal;
  element("information-body").replaceChildren();
  informationButtons = [];
  element("scene-options").hidden = true;
  element("journal-tabs").hidden = activePanel !== "journal" && activePanel !== "leads";
  element("journal-evidence").setAttribute("aria-pressed", String(activePanel === "journal"));
  element("open-leads").setAttribute("aria-pressed", String(activePanel === "leads"));
  text("information-title", activePanel === "character" && currentView.characterLabel ? "Your " + currentView.characterLabel : panels[activePanel]);
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
    if (status.equipment.length) { inventoryBlock("Equipment", status.equipment, ""); }
    inventoryBlock("Carried items", status.collectedItems, "No carried items.", true);
    if (information) {
      informationBlock("Items in this scene", currentView.scene.room.items.length ? currentView.scene.room.items.map((item) => item.name + " — not carried. " + item.placement.description) : ["No portable items in view."]);
      informationBlock("Spent items", information.spentItems.length ? information.spentItems : ["No spent items."]);
    }
  } else if (activePanel === "character") {
    informationBlock(currentView.characterLabel || "Character", ["HP: " + status.hp + " / " + status.maxHp, ...(status.combatTurn ? ["Combat turn: " + status.combatTurn] : []), ...(status.conditions || [])]);
    if (information && information.defense !== undefined) { informationBlock("Combat profile", ["Defense: AC " + information.defense, "Attack: " + information.attack, currentView.scene.combatStatus || "No active combat."]); }
    if (status.sheet) {
      informationBlock("Ability scores", Object.entries(status.sheet.abilities).map(([ability, score]) => ability + ": " + score + " (" + (status.modifiers && status.modifiers[ability] >= 0 ? "+" : "") + (status.modifiers ? status.modifiers[ability] : "see rules") + ")"));
      informationBlock("Career", ["XP: " + status.sheet.xp, status.profile.nextLevelXp === null ? "Level 3 is the supported maximum. Further XP remains recorded." : "Next level at " + status.profile.nextLevelXp + " XP.", "Initiative: " + status.profile.initiativeBonus, "Equipment: " + status.equipment.map((item) => item.name).join(", ")]);
    } else { informationBlock("Historical sheet", ["Ability scores, name and level were not recorded in this adventure."]); }
    if (information && information.relationships.length) { informationBlock("Relationships in view", information.relationships.map((relationship) => relationship.replace(/\\bthe player\\b/g, "you"))); }
  } else {
    if (activePanel === "journal") {
      informationBlock(journal.quest.title, ["Quest: " + journal.quest.status]);
      if (status.resources) { informationBlock("Known supplies", status.resources); }
    }
    const showingLeads = activePanel === "leads";
    const refreshed = information && information.usesFinalePresentation;
    if (showingLeads) {
      const leads = information ? information.currentLeads : [...new Set(journal.actionableLeads.filter((lead) => lead.trim()))];
      informationBlock("Current leads", leads.length ? leads : [reviewing() ? "No open leads. Review the final record." : "No current leads."], "current-leads");
      if (refreshed) { return; }
    }
    for (const [classification, label, leadLabel] of [["observation", "Observed evidence", "Observed evidence leads"], ["testimony", "Testimony", "Testimony leads"], ["belief", "Beliefs", "Contested claim leads"]]) {
      const entries = journal.discoveries.filter((entry) => entry.classification === classification && (!showingLeads || refreshed || entry.actionableLead.trim())).map((entry) => entry.title + " — " + entry.source.name + ": " + (showingLeads && !refreshed ? entry.actionableLead : entry.summary));
      informationBlock(showingLeads ? leadLabel : label, entries.length ? entries : ["None recorded."]);
    }
    if (showingLeads) { return; }
    if (journal.ending) { informationBlock("Final record", [journal.ending.narration]); }
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
        feedback( "The save slot was replaced in another tab. Current new game loaded; old hints were discarded.");
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
  const opener = element("open-" + (activePanel === "leads" ? "journal" : activePanel));
  opener.setAttribute("aria-expanded", "false");
  element("open-leads").setAttribute("aria-expanded", "false");
  activePanel = undefined;
  element("information").hidden = true;
  element("scene-options").hidden = false;
  opener.focus({ preventScroll: true });
}
function openInformation(name, toggle = true) {
    if (!currentView || currentView.slot === "empty") { return; }
    if (toggle && (activePanel === name || name === "journal" && activePanel === "leads")) { closeInformation(); return; }
    if (activePanel) { element("open-" + activePanel).setAttribute("aria-expanded", "false"); }
    element("open-journal").setAttribute("aria-expanded", String(name === "journal" || name === "leads"));
    activePanel = name;
    element("open-" + name).setAttribute("aria-expanded", "true");
    element("information").hidden = false;
    renderInformation();
    element("information-title").focus({ preventScroll: true });
}
Object.keys(panels).forEach((name) => {
  element("open-" + name).addEventListener("click", () => openInformation(name, name !== "leads"));
});
element("journal-evidence").addEventListener("click", () => openInformation("journal", false));
element("close-information").addEventListener("click", closeInformation);
element("information").addEventListener("keydown", (event) => {
  if (event.key === "Escape") { event.preventDefault(); closeInformation(); }
});
// A disabled hint button can release focus to the document. Escape still
// closes the open information view and returns to its toolbar button.
if (typeof document.addEventListener === "function") {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || element("new-game-confirmation").open) { return; }
    if (activePanel) { event.preventDefault(); closeInformation(); }
    else if (!element("context").hidden) { event.preventDefault(); closeContext(true); }
  });
}
function busy(value) {
  element("open-characters").disabled = value;
  pending = value;
  ["start", "new-game", "refresh", "send", "message"].forEach((id) => { element(id).disabled = value; });
  ["send", "message"].forEach((id) => { element(id).disabled = value || !!reviewing(); });
  [...contextButtons, ...sceneButtons, ...informationButtons].forEach((button) => { button.disabled = value; });
  element("conversation").setAttribute("aria-busy", String(value));
  renderInformation();
  updateSaveIndicator();
}
function updateSaveIndicator() {
  text("save-indicator", pending ? "Taking your turn…" : currentView?.recovery === "unsaved" ? "Not saved" : currentView?.recovery === "pending" ? "Turn interrupted" : currentView?.slot === "occupied" ? "Saved" : "Ready");
}
function feedback(value) {
  text("feedback", value);
  element("feedback").hidden = /^(Action saved\\.|No action was committed\\.|Opening saved\\.|Saved progress and conversation loaded\\.|Ready to start\\.)/.test(value);
  updateSaveIndicator();
}
function entry(label, value, className = "reply") {
  const conversation = element("conversation");
  const follow = conversation.scrollTop + conversation.clientHeight >= conversation.scrollHeight - 24;
  const item = document.createElement("article");
  item.className = className;
  const heading = document.createElement("h4"); heading.textContent = label;
  const body = document.createElement("p");
  if (["reply", "dialogue", "result"].includes(className)) { styledText(body, value); }
  else { body.textContent = value; }
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
      if (text) { entry(card.title === "Authoritative information" ? "What you learn" : card.title === "Resolved action" ? "Outcome" : card.title, text, "result"); }
    });
    if (turn.notice && turn.notice !== "Action saved." && turn.notice !== "No action was committed.") { entry("Save status", turn.notice, "notice"); }
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
function renderCombat(view) {
  const active = view.scene.outcome === "playing" && !!view.scene.combat;
  element("combat-panel").hidden = !active;
  element("combat-actions").replaceChildren();
  if (!active) { return; }
  const combat = view.information && view.information.combat;
  text("combat-title", combat ? combat.opponentName : "Combat");
  text("combat-health", combat ? "Opponent HP " + combat.hp + " / " + combat.maxHp : "");
  text("combat-turn", (combat ? combat.turn : view.scene.combat.currentTurn) === "fighter" ? "Your turn" : "Opponent's turn");
  const order = ["attack", "brace", "use_item"];
  const actions = (view.actions || []).filter((action) => order.includes(action.call.name)).sort((a, b) => order.indexOf(a.call.name) - order.indexOf(b.call.name));
  for (const action of actions) {
    element("combat-actions").append(actionButton(action, sceneButtons));
  }
}
function render(view) {
  closeContext();
  sceneButtons = [];
  contextTargets = new Map();
  if (currentView && currentView.generation !== view.generation) {
    closeInformation();
    hintPollRevision = undefined;
    strongerRequestRevision = undefined;
    strongerError = undefined;
  }
  currentView = view;
  text("adventure-title", view.title);
  document.title = view.title + " · Dungeon One";
  renderArtwork(view.artwork);
  ["send", "message"].forEach((id) => { element(id).disabled = pending || !!reviewing(); });
  pollHints(view);
  Object.keys(panels).forEach((name) => { element("open-" + name).disabled = view.slot === "empty"; });
  if (view.slot === "empty") { closeInformation(); }
  renderInformation();
  text("seed", view.title + " · Seed " + view.seed + " · Single local save slot");
  const empty = view.slot === "empty";
  element("open-characters").hidden = !view.careerMode;
  element("open-characters").disabled = pending;
  element("start").hidden = !empty || !!view.careerMode;
  element("new-game").hidden = empty || !!view.careerMode;
  element("details-title").hidden = empty;
  element("turn").hidden = empty;
  if (empty) {
    text("scene-title", view.title);
    text("scene-summary", sceneSummary(view.introduction || "Begin your adventure. Your progress will be saved after each action."));
    text("description", view.introduction || "Start a new adventure. Your progress will be saved automatically after each action.");
    text("hp-label", "HP"); element("deadline-status").hidden = true;
    text("location", "Not started"); text("hp", "—"); text("time", "—"); text("deadline", "—"); text("session", "Not started");
    ["defense", "attack", "conditions"].forEach((id) => text(id, "—")); text("combat", "No active combat."); element("combat-panel").hidden = true;
    text("last-consequence", "No action yet.");
    text("objective", ""); list("details", []); list("exits", ["Start to see exits."]); return;
  }
  const scene = view.scene;
  const description = view.information && view.information.sceneDescription ? view.information.sceneDescription : scene.room.description;
  text("scene-title", scene.room.name); text("description", description);
  text("scene-summary", sceneSummary(view.position === 0 && view.introduction ? view.introduction : description));
  text("scene-eyebrow", reviewing() ? "YOUR FINAL RECORD" : scene.combat ? "IN COMBAT" : "CURRENT SCENE");
  const roomId = scene.room.id || "";
  element("scene-context").setAttribute("data-location", roomId);
  element("completion").hidden = !reviewing();
  text("completion", reviewing() ? "Adventure complete · Review your journal and saved journey." : "");
  text("objective", reviewing() ? "Adventure complete. Review your final record and saved journey." : scene.objective); text("location", scene.room.name);
  text("hp", view.hp.current + " / " + view.hp.maximum);
  text("hp-label", (view.characterLabel ? view.characterLabel + " " : "") + "HP");
  element("health-bar").setAttribute("max", view.hp.maximum);
  element("health-bar").setAttribute("value", view.hp.current);
  const information = view.information;
  text("defense", information && information.defense !== undefined ? "AC " + information.defense : "No combat profile.");
  text("attack", information && information.attack ? information.attack : "No combat profile.");
  text("conditions", (view.character.conditions || []).join(" ") || "No active conditions.");
  const last = [...(view.history || [])].reverse().find((turn) => turn.committed && turn.cards.some((card) => card.title === "Resolved action"));
  text("last-consequence", last ? last.cards.filter((card) => card.title === "Resolved action").map((card) => card.text).join("\\n") : "No action yet.");
  text("time", view.clocks.map((clock) => (clock.unit === "day" ? "Day " : clock.name + ": ") + clock.value).join("; ") || "No clock");
  const day = view.clocks.find((clock) => clock.unit === "day");
  element("deadline-status").hidden = !view.deadline;
  if (view.deadline) {
    const remaining = day ? view.deadline.day - day.value : undefined;
    text("deadline-label", view.deadline.name);
    text("deadline", "Day " + view.deadline.day + (remaining === undefined ? "" : remaining > 0 ? " · " + remaining + (remaining === 1 ? " day" : " days") + " remaining" : remaining === 0 ? " · Deadline reached" : " · " + (-remaining) + (remaining === -1 ? " day" : " days") + " past the deadline"));
  }
  text("combat", scene.combatStatus || (view.character.combatTurn ? "Turn: " + view.character.combatTurn : "No active combat."));
  text("session", scene.outcome + (reviewing() ? " · Review mode" : ""));
  element("travel-notice").hidden = !scene.combat || reviewing();
  renderCombat(view);
  contextList("exits", scene.room.exits.map((exit) => ({ ...exit, contextId: "exit:" + exit.destinationId })));
  contextList("details", [
    ...(scene.room.npcs || []).map((npc) => ({ ...npc, kind: "person", description: npc.condition === "dead" ? "Dead; no conversation available." : npc.description && npc.description.replace(/\\bthe player\\b/g, "you"), contextId: "npc:" + npc.id })),
    ...scene.room.opponents.map((opponent) => ({ ...opponent, kind: "enemy", description: "Condition: " + opponent.condition, contextId: "target:" + opponent.id })),
    ...scene.room.features.map((feature) => ({ ...feature, kind: "object", contextId: "target:" + feature.id })),
    ...scene.room.items.map((item) => ({ ...item, kind: "item", description: "Not carried. " + item.placement.description + ". " + item.description, contextId: "target:" + item.id })),
    ...((scene.endingChoices || []).length ? [{ name: "Ending choices", contextId: "ending" }] : [])
  ]);
}
async function read(start = false) {
  if (pending) { return; }
  busy(true);
  feedback( start ? "Saving the opening…" : "Reading current state…");
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
    feedback( view.slot === "empty" ? "Ready to start." : view.recovery === "pending" ? "A turn is pending. Read current state again before continuing; do not repeat it." : view.position === 0 && !(view.history || []).length ? "Opening saved. Choose a person or object in view, or ask your first question." : "Saved progress and conversation loaded. Position " + view.position + ".");
    if (start) { element("scene").focus(); }
  } catch (error) {
    feedback( error instanceof Error ? error.message : "Unable to reach the local service. Restart the launcher and open its new URL.");
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
  feedback( "Your message is pending…");
  try {
    const response = await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, revision: currentView.revision }) });
    const result = await response.json();
    // Another tab may have replaced the slot after this reply was produced.
    // Read the current generation before displaying a delayed turn response.
    if (result.view) {
      const latest = await currentResponseView(result.view);
      if (latest.generation !== result.view.generation) {
        render(latest); restoreHistory(latest);
        feedback( "The save slot was replaced in another tab. Current new game loaded; the old reply was discarded.");
        return;
      }
      result.view = latest;
    }
    if (result.view) { render(result.view); restoreHistory(result.view); }
    if (!response.ok) { throw new Error(result.error || "Unable to complete the turn."); }
    waiting.remove();
    restoreHistory(result.view);
    render(result.view);
    feedback( result.notice);
  } catch (error) {
    waiting.remove();
    try {
      const response = await fetch("/api/state");
      const view = await response.json();
      if (response.ok) { render(view); restoreHistory(view); }
    } catch { /* Read current state remains available when connection returns. */ }
    const message = error instanceof Error ? error.message : "Connection lost. Read current state before sending another action.";
    if (!reviewing()) { entry("Turn unavailable", message, "notice"); }
    feedback( message);
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
  text("new-game-description", "Your existing progress, conversation history, replies, result cards and both hint levels will be replaced. Start a new " + replacementView.title + " adventure with seed " + replacementView.newGameSeed + "?");
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
  feedback( "Replacing the save slot…");
  try {
    const response = await fetch("/api/new-game", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: before.revision, seed: before.newGameSeed, confirmed: true }) });
    const result = await response.json();
    if (!response.ok) { throw new Error(result.error || "New game replacement failed. Read current state."); }
    const latest = await currentResponseView(result.view);
    element("message").value = "";
    render(latest);
    restoreHistory(latest);
    feedback( latest.generation === result.view.generation ? "New game saved. Seed " + latest.seed + ". Previous progress and conversation replaced." : "The save slot was replaced again in another tab. Current new game loaded.");
    replaced = true;
    element("scene").focus();
  } catch (error) {
    feedback( error instanceof Error ? error.message : "Connection lost during replacement. Read current state before trying again.");
  } finally {
    busy(false); replacementView = undefined;
    if (!replaced) { element("new-game").focus(); }
  }
});
element("refresh").addEventListener("click", () => { void read(); });
let libraryData;
let selectedCharacter;
let libraryBusy = false;
const libraryText = (id, value) => { element(id).textContent = value; };
function libraryButton(parent, label, action) {
  const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.disabled = libraryBusy;
  button.addEventListener("click", action); parent.append(button);
}
function presetScores() {
  if (!libraryData) { return; }
  libraryText("preset-scores", Object.entries(libraryData.presets[element("character-preset").value]).map(([ability, score]) => ability + ": " + score).join(" � "));
}
function renderLibrary() {
  const list = element("library-characters"); list.replaceChildren();
  if (!libraryData.characters.length) { list.textContent = "No saved characters yet."; }
  for (const record of libraryData.characters) {
    libraryButton(list, record.sheet.name + " � Fighter level " + record.sheet.level + " � " + record.availability, () => { selectedCharacter = record.sheet.id; renderLibrary(); });
  }
  const record = libraryData.characters.find((entry) => entry.sheet.id === selectedCharacter);
  element("library-sheet").hidden = !record;
  element("library-adventures").replaceChildren();
  if (record) {
    libraryText("library-sheet-name", record.sheet.name + " � Fighter level " + record.sheet.level);
    libraryText("library-sheet-details", "HP " + record.sheet.hp + "/" + record.profile.maxHp + " � XP " + record.sheet.xp + " � " + record.availability + "\\nChain mail, shield, longsword � AC " + record.profile.armorClass + " � Attack +" + record.profile.attackBonus + " � Damage 1d8 " + (record.profile.damage.modifier >= 0 ? "+" : "") + record.profile.damage.modifier + " � Initiative " + record.profile.initiativeBonus);
    libraryText("library-sheet-abilities", Object.entries(record.sheet.abilities).map(([ability, score]) => ability + ": " + score + " (" + (record.modifiers[ability] >= 0 ? "+" : "") + record.modifiers[ability] + ")").join(" � "));
    if (record.availability === "active") { libraryButton(element("library-adventures"), "Continue this adventure", () => libraryAction("continue", { sessionId: record.activeSessionId }, true)); }
    if (record.availability === "ready") {
      for (const adventure of libraryData.adventures) {
        const range = adventure.recommendedLevels;
        const warning = record.sheet.level < range.minimum || record.sheet.level > range.maximum;
        const pair = document.createElement("div");
        const description = document.createElement("p"); description.textContent = adventure.title + " � Recommended levels " + range.minimum + "�" + range.maximum + ". Fighter, one player. Chain mail, shield, longsword." + (warning ? " Warning: this character is outside the recommended range; difficulty stays fixed." : ""); pair.append(description);
        libraryButton(pair, "Start " + adventure.title + " with " + record.sheet.name, () => libraryAction("play", { characterId: record.sheet.id, adventureId: adventure.id, confirmed: true }, true));
        element("library-adventures").append(pair);
      }
    }
  }
  const sessions = element("library-sessions"); sessions.replaceChildren();
  for (const session of libraryData.sessions.filter((entry) => entry.status !== "abandoned")) {
    const owner = libraryData.characters.find((entry) => entry.sheet.id === session.characterId);
    libraryButton(sessions, (owner ? owner.sheet.name : "Character") + " � " + session.title + " � " + (session.status === "playing" ? "Continue adventure" : "Review adventure"), () => libraryAction("continue", { sessionId: session.id }, true));
  }
  presetScores();
}
async function libraryAction(action, body, enterAdventure = false) {
  if (libraryBusy || pending) { return; }
  libraryBusy = true; renderLibrary();
  try {
    const response = await fetch("/api/characters/" + action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, revision: libraryData.revision }) });
    const result = await response.json();
    if (!response.ok) { throw new Error(result.error); }
    libraryData = result.library;
    if (action === "create") { selectedCharacter = libraryData.characters.at(-1).sheet.id; element("create-character").hidden = true; libraryText("library-feedback", "Character saved. You can close this window before choosing an adventure."); }
    if (result.view) { render(result.view); restoreHistory(result.view); }
    if (enterAdventure) { element("character-library").close(); element("scene").focus(); }
  } catch (error) {
    libraryText("library-feedback", error instanceof Error ? error.message : "Character action unavailable.");
    const response = await fetch("/api/characters"); if (response.ok) { libraryData = await response.json(); }
  } finally { libraryBusy = false; renderLibrary(); }
}
element("open-characters").addEventListener("click", async () => {
  if (pending) { return; }
  try {
    const response = await fetch("/api/characters"); if (!response.ok) { throw new Error("Character library unavailable."); }
    libraryData = await response.json(); libraryText("library-feedback", ""); renderLibrary(); element("character-library").showModal();
  } catch (error) { feedback(error.message); }
});
element("show-create-character").addEventListener("click", () => { element("create-character").hidden = false; presetScores(); element("character-name").focus(); });
element("cancel-create-character").addEventListener("click", () => { element("create-character").hidden = true; });
element("character-preset").addEventListener("change", presetScores);
element("create-character").addEventListener("submit", (event) => { event.preventDefault(); void libraryAction("create", { name: element("character-name").value, preset: element("character-preset").value }); });
element("close-characters").addEventListener("click", () => { if (!libraryBusy) { element("character-library").close(); } });
void read();`;
