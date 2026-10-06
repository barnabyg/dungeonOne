// The browser page: the 5e character library, the creation screen, the
// character sheet and the adventure screen. Bundled into dist so the extracted package serves the same interface. The script builds
// every element with textContent, never HTML from data.
//
// Adventure session regions (#154). Later tickets fill these containers; keep
// their ids and order so the layout holds:
// - #session-status: the status strip (#155): HP with its bar and health,
//   the round and whose turn it is (#turn), and #resources, a pip for each
//   turn resource and class feature use. It shows only what the session view
//   projects.
// - #session-scene: the room and the fight. The room lists only
//   what is there (#157); in a fight its details collapse behind #room-toggle.
//   The fight's initiative table shows totals, marks the current turn and
//   keeps each roll in #initiative-breakdown; it collapses behind
//   #initiative-toggle once the fight is over.
// - #session-actions: #adventure-error and the action bar (#156), #action-bar:
//   #attack-controls, #feature-controls (Drink in a fight, Second Wind, Action
//   Surge, End turn) and #explore-controls (Go, Examine, Take, Drink, Force,
//   Pick, Break, Unlock, Search, Disarm and Talk, grouped by target with the
//   full name as each button's accessible name) and #leave-controls (Leave
//   the adventure, in an exit room; #133). Leave asks first in #leave-confirm,
//   just after the bar, in place of the button, never in a browser dialog. It
//   shows every action the session view projects, an unavailable one disabled
//   with its reason as visible text linked by aria-describedby. Outside a
//   fight, what the character carries is acted on from the room panel's
//   #inventory, not the bar (#198): each carried item's Examine and Drink sit
//   on its entry, and the character's own gear heads the list with its
//   Unequip, Wield, Equip and Drop (#209), so a laden character's bar stays
//   short enough for a phone.
//   After an action, focus stays on the clicked control if it is still
//   enabled, and otherwise moves to the newest history entry. When the
//   adventure is over the bar is hidden and #ending (#158) takes its place: data-kind victory,
//   escape-with-loot, escape-without-loot or defeat (in words, #ending-kind,
//   and colour), the title and text, a defeat's permanence, #ending-rewards
//   (the XP, treasure and coin a surviving ending earned, #ending-coin, and a
//   level-up card, #133, #208)
//   and #ending-next back to the character sheet. Focus moves to
//   #ending-title when the ending appears or is opened again.
// - #session-history: the conversation history, #log, a live region in its own
//   scroll area, newest at the bottom; it follows new entries only while the
//   reader is at the bottom. Each entry (#159) has a data-kind (narration,
//   message or action); the newest has class "newest" and tabindex -1, and
//   focusNewestEntry() moves focus to it.
// - #session-composer: #message-form, and #dm-notice when typing to the AI DM
//   is off (#161); once the adventure is over #composer-reason says why
//   (#158). renderComposer() alone decides whether it is enabled.
// Actions, history and composer share #session-dock. DOM order (and so tab
// order) is status, scene, actions, history, composer; the dock shows history
// above actions and composer. From 900 x 560 px the session fills the window
// in two columns (status and scene left, the dock right, each scrolling on its
// own); narrower, it is one column with the dock sticky at the bottom.
//
// Busy states (#160): while a request runs, the control that started it has
// aria-busy (setBusy/clearBusy, with a label such as "Saving…") and cannot
// start it again. An action-bar button (#185) keeps its busy label in
// data-busy-label, drawn over its hidden idle label in a space sized for the
// wider of the two, so the bar never reflows; while busy, its accessible name
// is the full busy name, such as "Attacking Goblin Warrior…". A typed
// message shows at once with a client-only pending "The Dungeon Master is
// thinking…" entry (data-pending) that renderHistory replaces with the saved
// result; it is never saved. Confirmations go to
// #feedback, a polite live region that show() moves under the current panel's
// heading and route() clears on every navigation.
import { FEATURE_USES_RULE, FIGHTER_DEFAULT_CHOICES } from "./fighter-5e.js";

/** The composer's notice when the server has no AI DM (#161). */
export const FIFTH_DM_OFF_NOTICE =
  "Typing to the Dungeon Master is off. Use the buttons.";

export const FIFTH_BROWSER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dungeon One</title><link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script></head>
<body><a class="skip" href="#content">Skip to content</a>
<header class="masthead"><span class="brand-mark" aria-hidden="true">◇</span><div><h1>Dungeon One</h1></div></header>
<main id="content" tabindex="-1">
<nav id="breadcrumb" aria-label="Breadcrumb"><ol id="breadcrumb-list"></ol></nav>
<section id="library" class="panel" aria-labelledby="library-title">
<h2 id="library-title" tabindex="-1">Your Fighters</h2>
<p id="feedback" role="status" aria-live="polite"></p>
<ul id="characters" class="list"></ul>
<p id="no-characters" class="hint" hidden>No characters yet.</p>
<button id="open-creation" type="button" class="primary">Create a Fighter</button>
</section>
<section id="creation" class="panel" aria-labelledby="creation-title" hidden>
<h2 id="creation-title" tabindex="-1">Create a Fighter</h2>
<p class="hint">Rolled once. No rerolls. Place the six rolls on your abilities in any order, then make your other choices.</p>
<form id="creation-form" novalidate>
<fieldset id="ability-scores" aria-describedby="ability-hint increase-error"><legend>Ability scores</legend>
<p id="ability-hint" class="hint">Place one roll on each ability; choosing a roll that is already placed swaps the two. Your background then adds +2 and +1, or +1 to three abilities. To move a bonus, choose it on another ability. No score can exceed <span id="score-cap"></span>.</p>
<fieldset id="increase-mode" class="choice-row"><legend>Background increase</legend><label><input type="radio" name="increase-mode" id="increase-mode-two" value="two"> +2 and +1</label><label><input type="radio" name="increase-mode" id="increase-mode-three" value="three"> +1 to three</label></fieldset>
<div class="table-wrap"><table id="ability-table"><thead><tr><th scope="col">Ability</th><th scope="col">Roll</th><th scope="col">Back&shy;ground</th><th scope="col" class="num">Score</th><th scope="col" class="num">Modi&shy;fier</th></tr></thead><tbody id="ability-rows"></tbody></table></div>
<p id="increase-error" class="error" role="alert"></p>
</fieldset>
<fieldset id="skills" aria-describedby="skills-count skills-error"><legend id="skills-legend">Skill proficiencies</legend><p id="skills-count" class="hint" role="status"></p><div id="skill-fields" class="checks"></div><p id="skills-error" class="error" role="alert"></p></fieldset>
<fieldset id="styles"><legend>Fighting Style</legend><div id="style-fields" class="checks"></div></fieldset>
<fieldset id="kits" aria-describedby="kits-hint"><legend>Starting kit</legend><p id="kits-hint" class="hint">Common gear only, each worth about the same. Better gear is found or bought in adventures.</p><div id="kit-fields" class="checks"></div></fieldset>
<fieldset id="masteries" aria-describedby="masteries-count masteries-error"><legend id="masteries-legend">Weapon Mastery</legend><p class="hint">A mastery works only while you wield that weapon.</p><p id="masteries-count" class="hint" role="status"></p><div id="mastery-fields" class="checks"></div><p id="masteries-error" class="error" role="alert"></p></fieldset>
<label for="character-name">Name</label><input id="character-name" maxlength="40" autocomplete="off" required aria-describedby="name-error"><p id="name-error" class="error" role="alert"></p>
<section id="preview" aria-labelledby="preview-title" aria-live="polite"><h3 id="preview-title">Before you save</h3><p id="preview-status" class="hint"></p><div id="preview-body"></div></section>
<p id="creation-error" class="error" role="alert"></p>
<div class="controls"><button id="save-character" type="submit" class="primary">Save character</button><button id="close-creation" type="button" class="secondary">Cancel</button></div>
</form>
</section>
<section id="sheet" class="panel" aria-labelledby="sheet-name" hidden>
<h2 id="sheet-name" tabindex="-1"></h2>
<section id="sheet-adventures" aria-labelledby="sheet-adventures-title"><h3 id="sheet-adventures-title">Adventures</h3><p id="defeat-warning" class="hint"></p><div id="adventure-choices"></div><div id="abandon-confirm" class="confirm" hidden><p id="abandon-question"></p><div class="controls"><button id="confirm-abandon" type="button" class="primary danger">Abandon adventure</button><button id="cancel-abandon" type="button" class="secondary">Keep going</button></div></div><p id="start-error" class="error" role="alert"></p></section>
<div id="sheet-body"></div>
<div class="controls"><button id="delete-character" type="button" class="danger">Delete character</button></div>
</section>
<section id="adventure" class="panel" aria-labelledby="adventure-title" hidden>
<p id="adventure-meta" class="eyebrow dark"></p>
<h2 id="adventure-title" tabindex="-1"></h2>
<p id="adventure-objective" class="hint"></p>
<div id="session-layout">
<section id="session-status" aria-label="Status"><div id="status-hp" class="status-hp"><p id="character-hp"></p><span class="hp-bar" aria-hidden="true"><span id="hp-fill" class="hp-fill"></span></span></div><p id="turn" aria-live="polite"></p><ul id="resources" class="resources"></ul><p id="gear-numbers"></p></section>
<div id="session-scene">
<section id="room" aria-labelledby="room-title"><h3 id="room-title"></h3>
<button id="room-toggle" type="button" class="quiet disclosure" aria-expanded="false" aria-controls="room-details" hidden>Room details</button>
<div id="room-details"><p id="room-description"></p>
<div id="exits-group"><h4 id="exits-title">Exits</h4><ul id="exits" class="things" aria-labelledby="exits-title"></ul></div>
<div id="features-group"><h4 id="features-title">Features</h4><ul id="features" class="things" aria-labelledby="features-title"></ul></div>
<div id="creatures-group"><h4 id="creatures-title">Creatures</h4><ul id="creatures" class="things" aria-labelledby="creatures-title"></ul></div>
<div id="room-items-group"><h4 id="room-items-title">Items here</h4><ul id="room-items" class="things" aria-labelledby="room-items-title"></ul></div>
<p id="room-empty" class="hint" hidden>There is nothing else here.</p>
<div id="inventory-group"><h4 id="inventory-title">You carry</h4><ul id="inventory" class="things" aria-labelledby="inventory-title"></ul><p id="purse"></p></div>
</div>
</section>
<section id="encounter" aria-labelledby="encounter-title"><h3 id="encounter-title">Fight</h3>
<button id="initiative-toggle" type="button" class="quiet disclosure" aria-expanded="false" aria-controls="initiative-panel" hidden>Initiative order</button>
<div id="initiative-panel"><div class="table-wrap"><table id="initiative" aria-label="Initiative order"><thead><tr><th scope="col">Combatant</th><th scope="col">Initiative</th><th scope="col">HP</th><th scope="col">AC</th></tr></thead><tbody id="initiative-rows"></tbody></table></div>
<details id="initiative-breakdown"><summary>How initiative was rolled</summary><p class="hint">Each combatant rolled d20 + its initiative bonus; ties go to the higher Dexterity, then a roll-off.</p><ul id="initiative-rolls" class="breakdown"></ul></details></div>
<p id="feature-rule" class="hint"></p>
</section>
</div>
<div id="session-dock">
<section id="session-actions" aria-label="Actions"><p id="adventure-error" class="error" role="alert"></p><section id="ending" aria-labelledby="ending-title" hidden><h3 id="ending-title" tabindex="-1"></h3><p id="ending-kind" class="tag"></p><p id="ending-text"></p><p id="ending-consequence"></p><div id="ending-rewards"></div><button id="ending-next" type="button" class="primary"></button></section><div id="action-bar"><div id="attack-controls" class="controls"></div><div id="feature-controls" class="controls"></div><div id="explore-controls" class="controls"></div><div id="leave-controls" class="controls"></div></div><div id="leave-confirm" class="confirm" hidden><p id="leave-question"></p><div class="controls"><button id="confirm-leave" type="button" class="primary">Leave now</button><button id="cancel-leave" type="button" class="secondary">Stay</button></div></div></section>
<section id="session-history" aria-labelledby="history-title"><h3 id="history-title">What happened</h3>
<ol id="log" class="log" aria-live="polite" aria-labelledby="history-title" tabindex="0"></ol></section>
<div id="session-composer"><form id="message-form" novalidate><label for="message">Tell the Dungeon Master what you do</label><div class="composer-row"><input id="message" maxlength="1000" autocomplete="off"><button id="send-message" type="submit" class="primary">Send</button></div><p id="composer-reason" class="reason"></p><p id="dm-notice" class="hint" hidden>${FIFTH_DM_OFF_NOTICE}</p></form></div>
</div>
</div>
</section>
</main>
<dialog id="delete-dialog" aria-labelledby="delete-title" aria-describedby="delete-warning">
<form id="delete-form" novalidate>
<h2 id="delete-title">Delete <span id="delete-name"></span>?</h2>
<p id="delete-warning" class="hint">Deleting is permanent. There is no undo, archive or recycle bin.</p>
<label for="delete-confirm-name">Type <strong id="delete-name-hint"></strong> exactly to confirm</label><input id="delete-confirm-name" autocomplete="off" spellcheck="false">
<p id="delete-error" class="error" role="alert"></p>
<div class="controls"><button id="confirm-delete" type="submit" class="primary danger" disabled>Delete</button><button id="cancel-delete" type="button" class="secondary">Cancel</button></div>
</form>
</dialog></body></html>`;

// Design tokens (#152). Use these names rather than literal values:
// - Colour: --color-ink (primary fill, secondary outline), --color-paper and
//   --color-surface (backgrounds), --color-text, --color-text-muted (secondary
//   text, also dimmed rows; 4.5:1 on every light background), --color-line
//   (decorative dividers only), --color-control-border (input and card
//   boundaries; 3:1), --color-focus (keyboard focus ring), and the semantic
//   --color-danger, --color-success, --color-warning and --color-hp-healthy,
//   -wounded, -critical and -down for status displays.
// - Type: --font-serif, --font-sans and the scale --text-xs to --text-2xl;
//   h1 uses 2xl, h2 xl, h3 lg and h4 sm, so headings shrink in order.
// - Spacing: --space-1 (4px) to --space-6 (24px); radii --radius-sm/md/lg.
// - Buttons: every button takes exactly one variant class. `primary` is the
//   one main action of a region (library, creation form, sheet, room, fight,
//   composer, delete dialog); `secondary` is an outlined peer action; `quiet`
//   is a link-weight action such as going back; `danger` is an outlined
//   destructive action, and `primary danger` confirms one in a dialog.
// --ink, --gold, --line and --paper are older aliases of the colour tokens.
export const FIFTH_BROWSER_CSS = `:root{color-scheme:light;--color-ink:#263d3d;--color-ink-hover:#3a5451;--color-on-ink:#fff9e9;--color-paper:#f7f0e1;--color-surface:#fffaf0;--color-surface-hover:#efe5d0;--color-highlight:#efe2c0;--color-text:#292b27;--color-text-label:#4b4a3c;--color-text-muted:#615f50;--color-line:#d4c9b5;--color-control-border:#7a7260;--color-panel-border:#81785e;--color-gold:#d5b474;--color-gold-text:#7a6331;--color-discovery:#5b4a22;--color-on-dark:#f7edda;--color-night:#151f23;--color-night-light:#304043;--color-focus:#9a5a1c;--color-danger:#883c2d;--color-danger-hover:#9f4936;--color-danger-soft:#f3e0d8;--color-success:#2f6b3a;--color-warning:#8a5a00;--color-hp-healthy:var(--color-success);--color-hp-wounded:var(--color-warning);--color-hp-critical:var(--color-danger);--color-hp-down:var(--color-text-muted);--font-serif:Georgia,serif;--font-sans:system-ui,sans-serif;--text-xs:.78rem;--text-sm:.85rem;--text-md:1rem;--text-lg:1.15rem;--text-xl:1.45rem;--text-2xl:1.75rem;--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;--space-6:24px;--radius-sm:6px;--radius-md:8px;--radius-lg:10px;--ink:var(--color-ink);--gold:var(--color-gold);--line:var(--color-line);--paper:var(--color-paper);font-family:var(--font-serif);color:var(--color-text);background:var(--color-night);font-size:17px;line-height:1.55}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top,var(--color-night-light),var(--color-night) 75%);min-height:100dvh}h1,h2,h3,p{margin:0 0 var(--space-3)}h1{font-size:var(--text-2xl);line-height:1.1}h2{font-size:var(--text-xl);line-height:1.2}h3{font-size:var(--text-lg);margin-top:var(--space-4)}
button,legend,label,.eyebrow,.hint,.error,#feedback,table,.stats,.features{font-family:var(--font-sans)}button{font-size:var(--text-sm);border:1px solid var(--color-ink);background:transparent;color:var(--color-ink);padding:10px 14px;border-radius:var(--radius-sm);cursor:pointer;line-height:1.4}button:disabled{opacity:.55;cursor:default}button[aria-busy=true]{opacity:.8;cursor:progress}
button.primary{background:var(--color-ink);border-color:var(--color-ink);color:var(--color-on-ink)}button.primary:hover:not(:disabled){background:var(--color-ink-hover)}button.secondary:hover:not(:disabled){background:var(--color-surface-hover)}button.quiet{border-color:transparent;text-decoration:underline;text-underline-offset:3px}button.quiet:hover:not(:disabled){background:var(--color-surface-hover)}button.danger{border-color:var(--color-danger);color:var(--color-danger)}button.danger:hover:not(:disabled){background:var(--color-danger-soft)}button.primary.danger{background:var(--color-danger);color:var(--color-on-ink)}button.primary.danger:hover:not(:disabled){background:var(--color-danger-hover)}
:focus-visible{outline:3px solid var(--color-focus);outline-offset:3px}[tabindex="-1"]:focus{outline:none}[hidden]{display:none!important}
.skip{position:absolute;top:-100px;left:12px;background:var(--color-paper);padding:10px;z-index:20}.skip:focus{top:12px}
.masthead{max-width:860px;margin:auto;padding:var(--space-4);display:flex;align-items:center;gap:var(--space-3);color:var(--color-on-dark)}.brand-mark{font-size:2rem;color:var(--color-gold)}.eyebrow{font-size:.62rem;letter-spacing:.18em;color:var(--color-gold);margin-bottom:6px}
main{max-width:860px;margin:0 auto var(--space-6);padding:0 var(--space-4)}.panel{background:var(--color-paper);border:1px solid var(--color-panel-border);border-radius:var(--radius-lg);padding:var(--space-5);margin-bottom:var(--space-4);min-width:0}
#feedback{color:var(--color-text);font-size:var(--text-sm);background:var(--color-surface);border:1px solid var(--color-control-border);border-left:4px solid var(--color-ink);border-radius:var(--radius-sm);padding:var(--space-2) var(--space-3)}#breadcrumb ol{list-style:none;display:flex;flex-wrap:wrap;padding:0;margin:0 0 var(--space-3);font:var(--text-sm) var(--font-sans);color:var(--color-on-dark);overflow-wrap:anywhere}#breadcrumb li+li::before{content:"›"/"";margin:0 var(--space-2);color:var(--color-gold)}#breadcrumb a{color:var(--color-gold)}#breadcrumb-list:empty{display:none}#feedback:empty{display:none}.hint{font-size:var(--text-sm);color:var(--color-text-muted)}.error{color:var(--color-danger);font-size:var(--text-sm);font-weight:600}.error:empty{display:none}
.list{list-style:none;padding:0;margin:0 0 14px;display:grid;gap:var(--space-2)}.character-row{display:flex;gap:var(--space-2)}.list button{background:var(--color-surface);color:var(--color-text);border-color:var(--color-control-border)}.list button:hover{background:var(--color-surface-hover)}.open-character{flex:1 1 0;min-width:0;text-align:left;display:flex;flex-direction:column}.continue-adventure{flex:0 0 auto}.character-name{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-1) var(--space-2)}.list strong{font:600 var(--text-md) var(--font-serif);overflow-wrap:anywhere}.character-stats{font-size:var(--text-xs);color:var(--color-text-muted)}.character-row .tag{color:var(--color-ink)}.character-row.defeated .open-character{background:var(--color-paper);border-style:dashed}.character-row.defeated strong,.character-row.defeated .tag{color:var(--color-text-muted)}
.dice{display:flex;gap:3px;margin-top:var(--space-1)}.die{display:inline-grid;place-items:center;width:22px;height:22px;border:1px solid var(--color-control-border);border-radius:var(--radius-sm);background:var(--color-surface);font-weight:700;font-size:var(--text-xs)}.die.dropped{color:var(--color-text-muted);text-decoration:line-through;border-style:dashed}
fieldset{border:1px solid var(--color-line);border-radius:var(--radius-md);margin:0 0 14px;padding:var(--space-3);min-width:0}legend{font-weight:600;font-size:.9rem;padding:0 var(--space-1)}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-2) 14px}.grid label{display:flex;flex-direction:column;font-size:.82rem;font-weight:600}select,input{font:var(--text-md) var(--font-sans);padding:var(--space-2);border:1px solid var(--color-control-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text);width:100%;min-width:0;margin-top:var(--space-1)}label[for=character-name]{display:block;font-weight:600;font-size:var(--text-sm)}
.checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px 14px}.checks label{display:flex;gap:var(--space-2);align-items:flex-start;font-size:var(--text-sm)}.checks input{width:auto;padding:0;margin-top:var(--space-1);flex:none;accent-color:var(--color-ink)}.checks small{display:block;color:var(--color-text-muted);font-weight:400}.checks input:disabled+span{color:var(--color-text-muted)}
#preview{border-top:1px solid var(--color-line);margin-top:var(--space-4)}.stats{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:.88rem;margin:0 0 10px;padding:0;list-style:none}.stats li strong{margin-left:var(--space-1)}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;font-size:var(--text-sm);width:100%;margin-bottom:var(--space-3)}th,td{border-bottom:1px solid var(--color-line);padding:5px 6px;text-align:left}th{font-weight:600;color:var(--color-text-label)}
dialog{background:var(--color-paper);color:var(--color-text);border:1px solid var(--color-panel-border);border-radius:var(--radius-lg);padding:var(--space-5);width:min(480px,calc(100vw - 32px));max-width:none}dialog::backdrop{background:rgba(10,16,18,.7)}dialog label{display:block;font-weight:600;font-size:var(--text-sm);overflow-wrap:anywhere}
.features{font-size:var(--text-sm);padding-left:18px}.features li{margin:6px 0}.controls{display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-3)}
.eyebrow.dark{color:var(--color-gold-text)}#sheet-adventures h3{margin-top:0}#adventure-choices{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-2);margin-bottom:var(--space-3)}#adventure-choices>:not(.adventure-choice){grid-column:1/-1;justify-self:start;margin:0}.adventure-choice{display:flex;flex-direction:column;align-items:flex-start;gap:var(--space-2);border:1px solid var(--color-control-border);border-radius:var(--radius-md);background:var(--color-surface);padding:10px var(--space-3)}.adventure-choice p{margin:0}.choice-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-2);width:100%}.choice-head button{flex:0 0 auto}.tags{display:flex;flex-wrap:wrap;gap:var(--space-1)}.tag.level{color:var(--color-text-muted)}.tag.easy{color:var(--color-success)}.tag.medium{color:var(--color-warning)}.tag.hard{color:var(--color-danger)}.defeat-notice{color:var(--color-danger);font:600 var(--text-md) var(--font-sans)}
#turn{font-family:var(--font-sans);font-weight:600}tr.current{background:var(--color-highlight)}tr.defeated td,tr.defeated th{color:var(--color-text-muted);font-weight:400}.tag{display:inline-block;padding:0 6px;border:1px solid currentColor;border-radius:999px;font:600 var(--text-xs)/1.5 var(--font-sans);white-space:nowrap}
.log{position:relative;list-style:none;padding:0;margin:0 0 var(--space-3);display:grid;gap:var(--space-2);font-family:var(--font-sans);font-size:.88rem}.log li{border-left:3px solid transparent;padding:var(--space-1) 10px}.log li.newest{border-left-color:var(--color-gold)}.log li.newest:focus{outline:3px solid var(--color-focus);outline-offset:1px}.log p{margin:0}.log .reply.pending{color:var(--color-text-muted);font-style:italic}
.log .narration{font:italic var(--text-md) var(--font-serif)}.log .player{width:fit-content;max-width:90%;margin-left:auto;background:var(--color-highlight);border-radius:var(--radius-md) var(--radius-md) 0 var(--radius-md);padding:6px 10px}.log .reply{margin-top:6px;padding-left:10px;border-left:2px solid var(--color-ink)}.log .reply::before,.card.rejection::before{display:block;font-size:var(--text-xs);font-weight:600;color:var(--color-text-label)}.log .reply::before{content:"Dungeon Master"/""}
.card{background:var(--color-surface);border:1px solid var(--color-control-border);border-radius:var(--radius-sm);padding:6px 10px;margin-top:6px}.card.rejection{border-color:var(--color-danger);background:var(--color-danger-soft)}.card.rejection::before{content:"Action rejected"/"";color:var(--color-danger)}
.log .roll{color:var(--color-text-muted);font-size:var(--text-xs);margin-top:2px}.compact .who{font-weight:600}.compact .tag,.compact .roll-die{display:inline}.compact *{line-height:1}.card.has-more{position:relative;margin-top:10px}.card-more::before{content:"▸ "/""}.card-more[aria-expanded=true]::before{content:"▾ "/""}.card.has-more>.card-more{position:absolute;top:0;right:var(--space-2);transform:translateY(-50%);padding:0 4px;font-size:var(--text-xs);line-height:1.3;color:var(--color-text-label);background:inherit}.full-text{white-space:pre-line;margin-top:var(--space-1);font-size:var(--text-sm)}.roll-label{font-weight:600;color:var(--color-text-label)}.roll-die{display:inline-block;padding:0 4px;border:1px solid var(--color-control-border);border-radius:var(--radius-sm);background:var(--color-paper);color:var(--color-text);font-variant-numeric:tabular-nums;white-space:nowrap}.roll-die.dropped{border-style:dashed;color:var(--color-text-muted);text-decoration:line-through}.roll strong{color:var(--color-text);font-size:var(--text-sm)}.tag.hit,.tag.critical,.tag.success{color:var(--color-success)}.tag.miss{color:var(--color-text-muted)}.tag.failure{color:var(--color-danger)}
h4{font:600 var(--text-sm) var(--font-sans);margin:var(--space-3) 0 6px;color:var(--color-text-label)}.things{list-style:none;padding:0;margin:0;display:grid;gap:6px;font-family:var(--font-sans);font-size:var(--text-sm)}.things li{border:1px solid var(--color-line);border-radius:var(--radius-sm);padding:6px 10px;background:var(--color-surface)}.things li.none{border:0;background:none;padding:0;color:var(--color-text-muted)}.things p{margin:0}.things .discovery{color:var(--color-discovery);margin-top:var(--space-1)}.things .controls{margin-top:6px}#inventory .action{width:8.5em}#inventory .action button{width:100%}.things button{padding:6px 10px}#character-hp{font-weight:600}
#ending{flex-basis:100%;border:2px solid var(--ending-color);border-left-width:6px;border-radius:var(--radius-md);background:var(--color-surface);padding:var(--space-3);font-family:var(--font-sans)}#ending[data-kind=victory]{--ending-color:var(--color-success)}#ending[data-kind=escape-with-loot]{--ending-color:var(--color-gold-text)}#ending[data-kind=escape-without-loot]{--ending-color:var(--color-ink)}#ending[data-kind=defeat]{--ending-color:var(--color-danger)}#ending-rewards h4{margin:var(--space-2) 0 var(--space-1)}#ending-rewards ul{margin:0 0 var(--space-2);padding-left:18px;font-size:var(--text-sm)}.level-up{border:1px solid var(--color-gold);border-radius:var(--radius-md);background:var(--color-highlight);padding:var(--space-2) var(--space-3);margin:0 0 var(--space-2)}.level-up h4{margin-top:0;color:var(--color-text)}#ending .level-up p{margin:0}.confirm{flex-basis:100%;border:1px solid var(--color-control-border);border-left:4px solid var(--color-ink);border-radius:var(--radius-md);background:var(--color-surface);padding:var(--space-3);margin-bottom:var(--space-3);font-family:var(--font-sans)}.confirm p{margin:0;font-size:var(--text-sm)}#session-actions .confirm{margin-bottom:0}#ending h3{margin:0 0 var(--space-1);font-family:var(--font-serif)}#ending-kind{color:var(--ending-color);margin:0 0 var(--space-2)}#ending p:not(.tag){margin:0 0 var(--space-2);font-size:var(--text-sm)}#ending-consequence{font-weight:600;color:var(--color-danger)}#ending-consequence:empty{display:none}#ending-next{margin-top:var(--space-1)}#composer-reason{margin:var(--space-1) 0 0}#composer-reason:empty{display:none}#message-form label{display:block;font-weight:600;font-size:var(--text-sm)}
#session-layout{display:flex;flex-direction:column;gap:var(--space-3)}#session-status p{margin:0}
#gear-numbers{flex-basis:100%}#session-status{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-1) 6px;font:var(--text-xs) var(--font-sans)}#character-hp{font-size:var(--text-sm)}.status-hp{display:grid;justify-items:start;gap:2px;white-space:nowrap;--hp-color:var(--color-hp-healthy)}.status-hp[data-health=bloodied]{--hp-color:var(--color-hp-wounded)}.status-hp[data-health=critical]{--hp-color:var(--color-hp-critical)}.status-hp[data-health=down]{--hp-color:var(--color-hp-down)}.status-hp .tag{color:var(--hp-color)}.hp-bar{display:block;justify-self:stretch;height:6px;border:1px solid var(--color-control-border);border-radius:999px;background:var(--color-surface);overflow:hidden}.hp-fill{display:block;height:100%;width:0;background:var(--hp-color)}#turn{white-space:nowrap;font-weight:400}#turn:empty{display:none}
.resources{display:contents}.resources li{display:flex;align-items:center;gap:3px;white-space:nowrap;font-size:.72rem}.pips{display:inline-flex;gap:2px}.pip{width:9px;height:9px;border:1.5px solid var(--color-ink);border-radius:50%}.pip.full{background:var(--color-ink)}.visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}#session-scene{min-width:0}#session-scene>section:first-child h3{margin-top:0}
#session-dock{position:sticky;bottom:0;z-index:1;display:flex;flex-direction:column;gap:var(--space-2);min-width:0;background:var(--color-paper);border-top:1px solid var(--color-line);padding:var(--space-2) 0 var(--space-3)}#session-history{order:1;display:flex;flex-direction:column;min-height:0}#session-actions{order:2;display:flex;flex-wrap:wrap;gap:var(--space-2)}#session-composer{order:3}
#session-actions .controls{margin-top:0}#session-actions .controls:empty{display:none}#action-bar{display:contents}.action{display:inline-flex;flex-direction:column;align-items:flex-start;gap:2px;max-width:100%}.action button{max-width:100%}:is(#action-bar,#inventory) button{display:inline-grid}:is(#action-bar,#inventory) button>span,:is(#action-bar,#inventory) button::after{grid-area:1/1}:is(#action-bar,#inventory) button::after{content:attr(data-busy-label);visibility:hidden}:is(#action-bar,#inventory) button[aria-busy=true]>span{visibility:hidden}:is(#action-bar,#inventory) button[aria-busy=true]::after{visibility:visible}.reason{font:var(--text-xs) var(--font-sans);color:var(--color-text-muted)}#session-actions .error{margin:0;flex-basis:100%}#history-title{margin:0 0 var(--space-2)}#log{max-height:min(26dvh,260px);overflow-y:auto;overscroll-behavior:contain;margin:0;padding-right:var(--space-1)}.composer-row{display:flex;gap:var(--space-2);margin-top:var(--space-1)}.composer-row input{flex:1;margin:0}#dm-notice{margin:var(--space-1) 0 0}
button.disclosure{padding:6px 2px;margin-bottom:var(--space-2)}button.disclosure::before{content:"▸ "/"";display:inline-block;width:1.1em}button.disclosure[aria-expanded=true]::before{content:"▾ "/""}#initiative-breakdown{font:var(--text-sm) var(--font-sans);margin-bottom:var(--space-3)}#initiative-breakdown summary{cursor:pointer;color:var(--color-ink);text-decoration:underline;text-underline-offset:3px;padding:var(--space-1) 0}.breakdown{padding-left:18px;margin:0}.breakdown li{margin:2px 0}#explore-controls{display:grid;grid-template-columns:fit-content(40%) minmax(0,1fr);gap:var(--space-2) var(--space-4)}.thing-actions{display:grid;grid-column:1/-1;grid-template-columns:subgrid;align-items:start;font:var(--text-sm) var(--font-sans)}.thing-name{font-weight:600;color:var(--color-text-label);overflow-wrap:anywhere;line-height:1.4;padding-top:11px}.thing-verbs{display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-2);min-width:0}.thing-verbs .action{width:8.5em}.thing-verbs button{width:100%}
html{scroll-padding-bottom:var(--session-dock-height,0px)}
@media(min-width:900px) and (min-height:560px){body:has(#adventure:not([hidden])){height:100dvh;min-height:0;display:flex;flex-direction:column}body:has(#adventure:not([hidden])) .masthead,body:has(#adventure:not([hidden])) main{max-width:1240px;width:100%}body:has(#adventure:not([hidden])) main{flex:1;min-height:0;display:flex;flex-direction:column}#adventure{flex:1;min-height:0;display:flex;flex-direction:column}#session-layout{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);grid-template-rows:auto minmax(0,1fr);grid-template-areas:"status dock" "scene dock";gap:var(--space-3) var(--space-5)}#session-status{grid-area:status}#session-scene{grid-area:scene;min-height:0;overflow-y:auto;padding-right:var(--space-2)}#session-dock{grid-area:dock;position:static;min-height:0;border-top:0;border-left:1px solid var(--color-line);padding:0 0 0 var(--space-5)}#session-history{flex:1;min-height:8rem}#log{flex:1;max-height:none}#session-dock{overflow-y:auto}}
@media(max-width:560px){:root{--text-xl:1.25rem;--text-2xl:1.5rem}#initiative th,#initiative td{padding:5px 3px}#initiative td{white-space:nowrap}.panel{padding:14px}.masthead{padding:var(--space-3) var(--space-4)}.grid,.checks{grid-template-columns:1fr}.dice{gap:2px}.die{width:18px;height:18px}}
.choice-row{border:0;padding:0;margin:0 0 var(--space-2);display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-4);font-family:var(--font-sans);font-size:var(--text-sm)}.choice-row legend{float:left;width:100%;padding:0;margin-bottom:var(--space-1)}.choice-row label{display:flex;align-items:center;gap:6px}.choice-row input{width:auto;margin:0;accent-color:var(--color-ink)}
#ability-table th,#ability-table td{vertical-align:middle;padding:var(--space-1)}#ability-table select{margin:0;padding:6px var(--space-1);min-width:5.5em}#ability-table .bonus select{min-width:3.2em}.short-name{display:none}#ability-table .num{text-align:right;font-variant-numeric:tabular-nums}#ability-table td.num{white-space:nowrap}#ability-table .score{font-weight:700}#ability-table .cap{display:block;font-weight:400;font-size:var(--text-xs);color:var(--color-text-muted)}.bonus-check{display:inline-flex;align-items:center;gap:6px}.bonus-check input{width:auto;margin:0;accent-color:var(--color-ink)}#preview-status:empty{display:none}
@media(max-width:560px){#ability-scores{padding:var(--space-2) var(--space-1)}#ability-table{font-size:var(--text-xs)}#ability-table th,#ability-table td{padding:var(--space-1) 2px}#ability-table select{font-size:var(--text-sm)}.short-name{display:inline}.long-name{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}}
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

/**
 * Marks the control that started a request busy, optionally relabelled. An
 * action-bar button already shows its own busy label, so the label becomes its
 * accessible name instead.
 */
function setBusy(button, label) {
  if (!isBusy(button) && label) {
    if (button.dataset.busyLabel !== undefined) {
      button.dataset.idleAriaLabel = button.getAttribute("aria-label") ?? "";
      button.setAttribute("aria-label", label);
    } else {
      button.dataset.idleLabel = button.textContent;
      button.textContent = label;
    }
  }
  button.setAttribute("aria-busy", "true");
  button.disabled = true;
}

/** Ends a busy state; the caller decides whether the control is enabled. */
function clearBusy(button) {
  if (button.dataset.idleLabel !== undefined) {
    button.textContent = button.dataset.idleLabel;
    delete button.dataset.idleLabel;
  }
  if (button.dataset.idleAriaLabel !== undefined) {
    if (button.dataset.idleAriaLabel) button.setAttribute("aria-label", button.dataset.idleAriaLabel);
    else button.removeAttribute("aria-label");
    delete button.dataset.idleAriaLabel;
  }
  button.removeAttribute("aria-busy");
}

const isBusy = (button) => button.getAttribute("aria-busy") === "true";

// Each view has its own history entry and URL: the library is the bare page,
// the others a hash (#create, #character-<id>, #adventure-<id>), so a reload
// or Back and Forward return to the view without the server routing them.
let routeTicket = 0;

/** Shows one view, titles the page and draws its breadcrumb under Characters. */
function show(id, title, trail) {
  for (const panel of ["library", "creation", "sheet", "adventure"]) element(panel).hidden = panel !== id;
  // Confirmations show inside the current panel, under its heading.
  element(id).querySelector("h2").after(element("feedback"));
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
const adventureTitle = (adventureId) => (library.adventures.find(({ id }) => id === adventureId) || { title: "an adventure" }).title;

function feedback(message) { element("feedback").textContent = message; }

// Each row opens the character's sheet; a character with an adventure in
// progress also has Continue beside it (never inside it), which opens the
// adventure as its own history entry so Back returns to the library.
function renderLibrary() {
  const list = element("characters");
  list.replaceChildren(...library.characters.map((entry) => {
    const { sheet, profile } = entry;
    const item = make("li", undefined, "character-row" + (entry.defeated ? " defeated" : ""));
    const button = make("button", undefined, "open-character secondary");
    button.type = "button";
    const heading = make("span", undefined, "character-name");
    heading.append(make("strong", sheet.name));
    const status = characterStatus(entry);
    if (status) heading.append(" ", make("span", status, "tag"));
    button.append(heading, make("span", "Level " + sheet.level + " Fighter · HP " + sheet.hp + "/" + profile.maxHp + " · AC " + profile.armorClass, "character-stats"));
    button.addEventListener("click", () => go("#character-" + sheet.id));
    item.append(button);
    if (entry.session && !entry.defeated) {
      const resume = make("button", "Continue", "continue-adventure secondary");
      resume.type = "button";
      resume.setAttribute("aria-label", "Continue " + sheet.name + "'s adventure, " + adventureTitle(entry.session.adventureId));
      resume.addEventListener("click", () => go("#adventure-" + entry.session.id));
      item.append(resume);
    }
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

/** "+5 to hit, 1d6 + 3 bludgeoning, Sap" for one weapon attack. */
function attackText(attack) {
  return signed(attack.bonus) + " to hit, " + damageText(attack.damage) + " " + attack.damage.type + (attack.mastery ? ", " + attack.mastery : "") + attack.disadvantage.map((source) => ", disadvantage (" + source + ")").join("") + (attack.criticalRange === 19 ? ", critical on 19–20" : "");
}

function profileNodes(abilities, profile, hp) {
  const stats = make("ul", undefined, "stats");
  const entries = [
    ["HP", (hp === undefined ? profile.maxHp : hp) + "/" + profile.maxHp],
    ["AC", profile.armorClass],
    ["Initiative", signed(profile.initiative)],
    ["Proficiency bonus", signed(profile.proficiencyBonus)],
    [profile.attack.weapon, attackText(profile.attack)],
    ...(profile.lightAttack ? [[profile.lightAttack.weapon + " (extra attack)", attackText(profile.lightAttack)]] : []),
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
  const { sheet, profile, purse, stowed } = entry;
  shownSheetId = sheet.id;
  element("sheet-name").textContent = sheet.name;
  const summary = make("p", "Level " + sheet.level + " Fighter · " + sheet.xp + " XP" + (profile.nextLevelXp === undefined ? "" : " (level " + (sheet.level + 1) + " at " + profile.nextLevelXp + ")") + " · " + profile.equipment.map(({ name }) => name).join(", ") + (stowed.length ? " · Carried: " + stowed.join(", ") : ""), "hint");
  const rolls = make("p", "Rolled: " + library.abilities.map((ability) => titleCase(ability) + " " + sheet.abilityRolls[ability].join(", ")).join("; ") + ". Background: " + Object.entries(sheet.backgroundIncrease).map(([ability, amount]) => "+" + amount + " " + titleCase(ability)).join(", ") + ".", "hint");
  element("sheet-body").replaceChildren(summary, ...profileNodes(sheet.abilities, profile, sheet.hp), ...treasureNodes(sheet.treasure), ...purseNodes(sheet.purse, purse), rolls);
  renderAdventureChoices(entry);
  show("sheet", sheet.name, [{ label: sheet.name }]);
  element("sheet-name").focus();
}

// Treasure kept from adventures (#133), each with its description.
function treasureNodes(treasure) {
  const heading = make("h3", "Treasure");
  heading.id = "treasure-title";
  if (treasure.length === 0) return [heading, make("p", "No treasure yet. Treasure found on an adventure is kept only by getting out alive.", "hint")];
  const list = make("ul", undefined, "features");
  list.id = "treasure";
  list.setAttribute("aria-labelledby", "treasure-title");
  list.append(...treasure.map(treasureItem));
  return [heading, list];
}

// The coin kept from adventures (#208), in mixed denominations.
function purseNodes(copper, text) {
  const heading = make("h3", "Purse");
  heading.id = "purse-title";
  const amount = copper === 0 ? make("p", "No coin yet. Coin found on an adventure is kept only by getting out alive.", "hint") : make("p", text);
  amount.id = "sheet-purse";
  return [heading, amount];
}

/** One treasure as a list item: its name in bold, then its description. */
function treasureItem(item) {
  const entry = make("li");
  entry.append(make("strong", item.name + ". "), document.createTextNode(item.description));
  return entry;
}

function renderAdventureChoices(entry) {
  element("start-error").textContent = "";
  element("abandon-confirm").hidden = true;
  const choices = element("adventure-choices");
  const warning = element("defeat-warning");
  warning.textContent = "At 0 HP, " + entry.sheet.name + " is defeated for good and can never start another adventure.";
  warning.hidden = entry.defeated;
  // A defeated character's sheet leads with its defeat.
  if (entry.defeated) {
    choices.replaceChildren(make("p", entry.sheet.name + " was defeated and cannot start another adventure.", "defeat-notice"));
    return;
  }
  if (entry.session) {
    const title = (library.adventures.find(({ id }) => id === entry.session.adventureId) || { title: "an adventure" }).title;
    const button = make("button", "Continue " + title, "primary");
    button.type = "button";
    button.id = "continue-adventure";
    button.addEventListener("click", () => go("#adventure-" + entry.session.id));
    // Abandoning asks first (#133), inside the sheet.
    const abandon = make("button", "Abandon adventure", "danger");
    abandon.type = "button";
    abandon.id = "abandon-adventure";
    abandon.addEventListener("click", () => openAbandon(entry, title));
    const controls = make("div", undefined, "controls");
    controls.append(button, abandon);
    choices.replaceChildren(controls);
    return;
  }
  // The server lists the modules in offer order: level range, then difficulty.
  choices.replaceChildren(...library.adventures.map((adventure) => {
    const box = make("div", undefined, "adventure-choice");
    const tags = make("p", undefined, "tags");
    tags.append(make("span", levelText(adventure.recommendedLevels), "tag level"), make("span", titleCase(adventure.difficulty), "tag " + adventure.difficulty));
    const button = make("button", "Start");
    button.type = "button";
    button.className = "start-adventure secondary";
    button.setAttribute("aria-label", "Start " + adventure.title);
    button.dataset.adventure = adventure.id;
    button.addEventListener("click", () => startAdventure(entry.sheet.id, adventure.id, button));
    // The button heads the card, so every Start stays in view as the list grows (#165).
    const head = make("div", undefined, "choice-head");
    head.append(make("strong", adventure.title), button);
    box.append(head, tags, make("p", adventure.objective, "hint"));
    return box;
  }));
}

let abandoning;

function openAbandon(entry, title) {
  abandoning = entry.sheet.id;
  element("start-error").textContent = "";
  element("abandon-question").textContent = "Abandon " + title + "? " + entry.sheet.name + " keeps nothing found on it and earns no XP from it, and it cannot be continued. Treasure, coin and XP from earlier adventures are kept.";
  element("adventure-choices").hidden = true;
  element("abandon-confirm").hidden = false;
  element("confirm-abandon").focus();
}

function closeAbandon() {
  element("abandon-confirm").hidden = true;
  element("adventure-choices").hidden = false;
  const abandon = element("abandon-adventure");
  if (abandon) abandon.focus();
}

async function abandonAdventure() {
  const button = element("confirm-abandon");
  if (isBusy(button)) return;
  setBusy(button, "Abandoning…");
  try {
    const entry = findEntry(abandoning);
    const title = adventureTitle(entry.session.adventureId);
    library = await request("/api/5e/adventures/abandon", { revision: library.revision, characterId: abandoning });
    element("abandon-confirm").hidden = true;
    element("adventure-choices").hidden = false;
    openSheet(abandoning);
    feedback(entry.sheet.name + " abandoned " + title + ". Nothing found on it was kept.");
  } catch (error) {
    element("start-error").textContent = error.message;
  } finally {
    clearBusy(button);
    button.disabled = false;
  }
}

let session;
let acting = false;
// Whether Leave is asking for confirmation (#133).
let confirmingLeave = false;

const levelText = ({ min, max }) => min === max ? "Level " + min : "Levels " + min + "–" + max;

async function startAdventure(characterId, adventureId, button) {
  if (isBusy(button)) return;
  setBusy(button, "Starting…");
  try {
    const result = await request("/api/5e/adventures/start", { revision: library.revision, characterId, adventureId });
    library = result.library;
    session = result.session;
    go("#adventure-" + session.id);
  } catch (error) {
    element("start-error").textContent = error.message;
  } finally {
    clearBusy(button);
    button.disabled = false;
  }
}

async function openAdventure(sessionId, ticket) {
  const active = library.characters.some(({ session: active }) => active && active.id === sessionId);
  // An ended adventure stays viewable (#158): the server serves it read-only.
  if (!active && session && session.id === sessionId) {
    showAdventure(session);
    return;
  }
  try {
    const result = await request("/api/5e/session", { sessionId });
    if (ticket !== routeTicket) return;
    library = result.library;
    showAdventure(result.session);
  } catch (error) {
    if (ticket === routeTicket) lost(active ? error.message : "That adventure is no longer in progress.");
  }
}

function showAdventure(value) {
  session = value;
  // A draft belongs to its adventure session: opening another one clears it.
  const form = element("message-form");
  if (form.dataset.session !== session.id) {
    form.dataset.session = session.id;
    element("message").value = "";
    confirmingLeave = false;
  }
  element("adventure-error").textContent = "";
  renderAdventure();
  const entry = findEntry(session.characterId);
  const title = session.adventure.title;
  show("adventure", title, [...(entry ? [{ label: entry.sheet.name, hash: "#character-" + entry.sheet.id }] : []), { label: title }]);
  element(session.ending ? "ending-title" : "adventure-title").focus();
  followHistory = true;
  element("log").scrollTop = element("log").scrollHeight;
}

function renderAdventure() {
  const { adventure, encounter } = session;
  element("adventure-meta").textContent = levelText(adventure.recommendedLevels) + " · " + titleCase(adventure.difficulty) + " · " + session.room.name;
  element("adventure-title").textContent = adventure.title;
  element("adventure-objective").textContent = adventure.objective;
  const fighting = Boolean(encounter && encounter.currentTurn !== null);
  renderRoom(session.room, fighting);
  element("encounter").hidden = !encounter;
  if (encounter) renderInitiative(encounter, fighting);
  renderGear(session.room.gear);
  renderActions();
  element("feature-rule").textContent = session.features ? ${JSON.stringify(FEATURE_USES_RULE)} : "";
  renderStatus();
  renderEnding();
  renderComposer();
  renderHistory();
}

/**
 * Enables the composer only while the adventure is playing, the AI DM is
 * available and nothing is in flight. Without an AI DM it is off up front,
 * with a notice saying so (#161); after the ending it says why (#158).
 */
function renderComposer() {
  const playing = session.status === "playing";
  const enabled = playing && session.dmAvailable && !acting;
  element("message").disabled = !enabled;
  element("send-message").disabled = !enabled;
  element("dm-notice").hidden = !playing || session.dmAvailable;
  element("composer-reason").textContent = playing ? "" : "The adventure is over, so the Dungeon Master takes no more messages.";
  const reason = !playing ? "composer-reason" : session.dmAvailable ? "" : "dm-notice";
  if (reason) element("message").setAttribute("aria-describedby", reason);
  else element("message").removeAttribute("aria-describedby");
}

const ENDING_LABELS = { victory: "Victory", "escape-with-loot": "Escaped with loot", "escape-without-loot": "Escaped empty-handed", defeat: "Defeat" };

// The ending (#158), in place of the action bar: its kind in words and
// colour, its title and text, what a surviving ending earned with any
// level-up (#133), and one next step back to the character sheet. A defeat
// says that it is permanent.
function renderEnding() {
  const { ending } = session;
  element("ending").hidden = !ending;
  if (!ending) return;
  const entry = findEntry(session.characterId);
  const name = entry ? entry.sheet.name : "This character";
  element("ending").dataset.kind = ending.kind;
  element("ending-kind").textContent = ENDING_LABELS[ending.kind];
  element("ending-title").textContent = ending.title;
  element("ending-text").textContent = ending.text;
  element("ending-consequence").textContent = ending.kind === "defeat" ? "Defeat is permanent: " + name + " cannot start another adventure." : "";
  element("ending-rewards").replaceChildren(...rewardNodes(ending.rewards, name));
  element("ending-next").textContent = entry ? "Back to " + name + "'s sheet" : "Back to your characters";
}

/** The XP, treasure and coin a surviving ending earned, then any level-up card. */
function rewardNodes(rewards, name) {
  if (!rewards) return [];
  const nodes = [];
  const list = (id, title, items) => {
    const heading = make("h4", title);
    heading.id = id + "-title";
    const entries = make("ul");
    entries.id = id;
    entries.setAttribute("aria-labelledby", heading.id);
    entries.append(...items);
    nodes.push(heading, entries);
  };
  if (rewards.xp.length === 0 && rewards.treasure.length === 0 && !rewards.coin) {
    nodes.push(make("p", "Nothing new earned: " + name + " already has everything this adventure gives."));
  }
  if (rewards.xp.length > 0) list("ending-xp", "Experience", rewards.xp.map((award) => make("li", award.name + ": +" + award.xp + " XP")));
  if (rewards.treasure.length > 0) {
    list("ending-treasure", "Treasure kept", rewards.treasure.map(treasureItem));
  }
  if (rewards.coin) {
    const coin = make("p", "Coin kept: " + rewards.coin);
    coin.id = "ending-coin";
    nodes.push(coin);
  }
  nodes.push(make("p", name + " has " + rewards.totalXp + " XP. A rest before the next adventure restores every hit point and feature use."));
  const up = rewards.levelUp;
  if (up) {
    const card = make("section", undefined, "level-up");
    card.id = "level-up";
    const heading = make("h4", "Level up: " + name + " is now level " + up.to);
    heading.id = "level-up-title";
    card.setAttribute("aria-labelledby", heading.id);
    // Names only: the sheet explains each feature, and the dock stays short.
    const gains = make("p", "Hit points " + up.maxHp.before + " → " + up.maxHp.after + ". New: " + up.features.map((feature) => feature.name).join(", ") + ". See the sheet for what each does.");
    card.append(heading, gains);
    nodes.push(card);
  }
  return nodes;
}

const HEALTH_LABELS = { healthy: "Healthy", bloodied: "Bloodied", critical: "Critical", down: "Defeated" };

/** Text only screen readers hear, standing in for a compact visible form. */
const spoken = (text) => make("span", text, "visually-hidden");
const unspoken = (node) => {
  node.setAttribute("aria-hidden", "true");
  return node;
};

/** One resource: a short label and a pip per use, filled while left. */
function resource(id, label, left, max, words) {
  const item = make("li");
  item.dataset.resource = id;
  const pips = unspoken(make("span", undefined, "pips"));
  for (let index = 0; index < max; index += 1) pips.append(make("span", undefined, index < left ? "pip full" : "pip"));
  item.append(unspoken(make("span", label)), pips, spoken(words));
  return item;
}

const usesLeft = (name, { uses, max }) => name + ": " + uses + " of " + max + (max === 1 ? " use" : " uses") + " left";

// The status strip shows the session view as the server projects it: HP and
// its health, the round and whose turn it is, and pips for what is left.
function renderStatus() {
  const { hp, maxHp, health } = session.room.character;
  element("status-hp").dataset.health = health;
  element("character-hp").replaceChildren(spoken("HP " + hp + " of " + maxHp + ","), unspoken(make("span", "HP " + hp + "/" + maxHp)), " ", make("span", HEALTH_LABELS[health], "tag"));
  element("hp-fill").style.width = (maxHp > 0 ? (100 * hp) / maxHp : 0) + "%";
  const { encounter, turn, features } = session;
  const current = encounter && encounter.combatants.find(({ id }) => id === encounter.currentTurn);
  element("turn").textContent = !encounter ? "" : current ? "Round " + encounter.round + ": " + (current.id === encounter.playerId ? "your turn." : current.name + "'s turn.") : "The fight is over.";
  const items = [];
  if (turn) {
    const actions = turn.actions === 0 ? "used" : turn.maxActions === 1 ? "available" : turn.actions + " of " + turn.maxActions + " left";
    items.push(
      resource("action", "Action", turn.actions, turn.maxActions, "Action: " + actions),
      resource("bonus-action", "Bonus", turn.bonusAction ? 1 : 0, 1, "Bonus action: " + (turn.bonusAction ? "available" : "used")),
      resource("reaction", "Reaction", turn.reaction ? 1 : 0, 1, "Reaction: " + (turn.reaction ? "available" : "used")),
    );
  }
  if (features) {
    items.push(resource("second-wind", "Second Wind", features.secondWind.uses, features.secondWind.max, usesLeft("Second Wind", features.secondWind)));
    if (features.actionSurge) items.push(resource("action-surge", "Action Surge", features.actionSurge.uses, features.actionSurge.max, usesLeft("Action Surge", features.actionSurge)));
  }
  element("resources").replaceChildren(...items);
}

// Each kind of history entry looks different and is labelled (#159):
// narration (the opening and entering a room) is unboxed, the player's words
// are a bubble, AI DM replies are attributed, and result and rejection cards
// are boxed. A line with rolls (an attack, initiative, healing, a check or
// saving throw (#132) with its DC and outcome, or a trap's damage) shows a
// compact form built from its roll groups (#186), with the dice beside the
// roll they belong to; screen readers get the line's engine text instead, and
// the card's Full text disclosure shows it all, with what the compact form
// leaves out (the weapon, Second Wind's uses left). Other lines show their
// engine text. .log is position:relative so those visually hidden
// spans stay inside its scroll area instead of stretching the page.
const PART_LABELS = {
  narration: "Narration",
  player: "You said",
  reply: "Dungeon Master",
  result: "Resolved action",
  rejection: "Action rejected",
};

function part(tag, kind, text) {
  const node = make(tag, text, kind === "player" ? "player" : kind === "reply" || kind === "narration" ? kind : "card " + kind);
  node.setAttribute("role", "note");
  node.setAttribute("aria-label", PART_LABELS[kind]);
  return node;
}

const OUTCOME_TAGS = { hit: "Hit", critical: "Critical hit", miss: "Miss", success: "Success", failure: "Failure" };
const withSign = (value) => (value >= 0 ? " + " : " − ") + Math.abs(value);

/** A roll's dice as chips, an unkept d20 struck through; with sides false, just each value. */
const diceChips = (group, separator, sides = true) =>
  group.dice.flatMap((die, index) => [
    ...(index > 0 ? [separator] : []),
    make("span", (sides ? "d" + die.sides + " " : "") + die.value, "roll-die" + (die.dropped ? " dropped" : "")),
  ]);

/** Damage or healing: the total in bold, its dice, and the HP after, such as "7 slashing (d6 4 + 3) → 0/7 HP". */
const hpChange = (group, label) => [
  make("strong", group.total),
  label + " (",
  ...diceChips(group, " + "),
  (group.modifier === 0 ? "" : withSign(group.modifier)) + (group.halved ? ", halved" : "") + ") → " + group.hpAfter + "/" + group.maxHp + " HP",
];

/** One compact roll, such as "d20 12 + 5 = 17 vs AC 15" or "7 slashing (d6 4 + 3) → 0/7 HP". */
function compactRoll(group) {
  const node = make("span", undefined, "roll " + group.purpose);
  switch (group.purpose) {
    case "initiative":
      // Initiative is always a d20, so its chip shows just the value; with
      // "d20" the line can be wider than its engine text (#196).
      node.append(group.roller + " ", ...diceChips(group, ", ", false), withSign(group.modifier) + " = " + group.total + (group.rollOff ? " (roll-off " + group.rollOff.join(", ") + ")" : ""));
      break;
    case "target":
      node.append("target die ", ...diceChips(group));
      break;
    case "attack":
      node.append(group.mode ? group.mode + " " : "", ...diceChips(group, ", "), withSign(group.modifier) + " = " + group.total + " vs AC " + group.armorClass);
      break;
    case "damage":
      node.append(...hpChange(group, " " + group.damageType));
      break;
    case "healing":
      node.append(...hpChange(group, ""));
      break;
    case "check":
    case "save":
      node.append(group.mode ? group.mode + " " : "", ...diceChips(group, ", "), withSign(group.modifier) + (group.proficiency ? " + " + group.proficiency + " prof" : "") + " = " + group.total + " vs DC " + group.dc);
      break;
  }
  return node;
}

/** An attack, initiative or healing line built from its roll groups. */
function compactLine(line) {
  const node = unspoken(make("span", undefined, "compact"));
  const attack = line.rolls.find((group) => group.purpose === "attack");
  if (attack) {
    node.append(make("span", attack.roller + " → " + attack.target, "who"), " ", make("span", OUTCOME_TAGS[attack.outcome], "tag " + attack.outcome));
    line.rolls.forEach((group, index) => node.append(index > 0 ? " · " : " ", compactRoll(group)));
  } else if (line.rolls[0].purpose === "healing") {
    node.append(make("span", line.rolls[0].roller, "who"), " heals ", compactRoll(line.rolls[0]));
  } else if (line.rolls[0].purpose === "check" || line.rolls[0].purpose === "save") {
    // A check or saving throw (#132): its label, outcome and roll against the DC.
    const check = line.rolls[0];
    node.append(make("span", check.roller, "who"), " ", make("span", check.label, "roll-label"), " ", make("span", OUTCOME_TAGS[check.outcome], "tag " + check.outcome), " ", compactRoll(check));
  } else if (line.rolls[0].purpose === "damage") {
    node.append(make("span", line.rolls[0].roller + " → " + line.rolls[0].target, "who"), " ", compactRoll(line.rolls[0]));
  } else {
    node.append(make("span", "Initiative: ", "roll-label"));
    line.rolls.forEach((group, index) => node.append(...(index > 0 ? [" · "] : []), compactRoll(group)));
  }
  return node;
}

const compactable = (line) => line.rolls.length > 0;

function historyCard(card) {
  if (card.kind === "narration") return part("p", "narration", card.text);
  const node = part("div", card.kind);
  for (const line of card.lines) {
    const block = make("div", undefined, "card-line");
    const paragraph = make("p");
    if (compactable(line)) paragraph.append(spoken(line.text), compactLine(line));
    else paragraph.textContent = line.text;
    block.append(paragraph);
    node.append(block);
  }
  if (card.lines.some(compactable)) {
    // The toggle sits on the card's top border, like a legend, so it takes
    // no width from any line and the card is no taller than its engine text
    // (#196).
    const full = make("p", card.text, "full-text");
    full.hidden = true;
    const more = make("button", "Full text", "card-more quiet");
    more.type = "button";
    more.setAttribute("aria-expanded", "false");
    more.addEventListener("click", () => {
      full.hidden = !full.hidden;
      more.setAttribute("aria-expanded", String(!full.hidden));
    });
    node.classList.add("has-more");
    node.append(more, full);
  }
  return node;
}

function historyEntry(entry) {
  const item = make("li");
  const message = entry.player !== undefined;
  item.dataset.kind = message ? "message" : entry.reply ? "narration" : "action";
  if (message) {
    const said = part("p", "player");
    said.append(make("strong", "You:"), " " + entry.player);
    item.append(said);
  }
  if (entry.reply && !entry.cards.some(({ text }) => text === entry.reply)) item.append(part("p", message ? "reply" : "narration", entry.reply));
  item.append(...entry.cards.map(historyCard));
  return item;
}

// The newest entry is marked and can take focus, so the action bar can move
// focus to an action's result.
function markNewest(log) {
  for (const old of log.querySelectorAll(":scope > li.newest")) {
    old.removeAttribute("class");
    old.removeAttribute("tabindex");
  }
  const newest = log.lastElementChild;
  if (newest) {
    newest.classList.add("newest");
    newest.tabIndex = -1;
  }
}

/** Moves focus to the newest history entry, if there is one. */
function focusNewestEntry() {
  const newest = element("log").lastElementChild;
  if (newest) newest.focus();
}

// History only grows, so new entries are appended: the live region announces
// just them. The log follows the newest entry only while the reader is at the
// bottom; someone who scrolled up to read older entries stays where they are.
// Only the reader's scrolling decides that, not the dock resizing around it;
// while following, a resized log is scrolled back to its newest entry (#221).
let followHistory = true;

/** Scrolls the log to its newest entry while the reader follows it. */
function followNewest() {
  const log = element("log");
  if (followHistory) log.scrollTop = log.scrollHeight;
}

function renderHistory() {
  const log = element("log");
  for (const pending of log.querySelectorAll(":scope > li[data-pending]")) pending.remove();
  if (log.dataset.session !== session.id || log.children.length > session.history.length) {
    log.dataset.session = session.id;
    log.replaceChildren();
  }
  log.append(...session.history.slice(log.children.length).map(historyEntry));
  markNewest(log);
  followNewest();
}

/** Shows a typed message at once, with the Dungeon Master's reply pending. */
function showPending(message) {
  const log = element("log");
  const item = historyEntry({ player: message, cards: [] });
  item.dataset.pending = "true";
  const waiting = part("p", "reply", "The Dungeon Master is thinking…");
  waiting.classList.add("pending");
  item.append(waiting);
  log.append(item);
  markNewest(log);
  followNewest();
}

// Each list's entries; their actions are in the action bar, except a carried
// item's, which renderActions puts on its #inventory entry (#198). An empty
// list is left out, and a room with no exits, features or items says so in
// one line.
const ROOM_LISTS = [
  { id: "exits", key: "exits" },
  { id: "features", key: "features" },
  { id: "creatures", key: "creatures" },
  { id: "room-items", key: "items" },
  { id: "inventory", key: "inventory" },
];

const TRAP_STATES = { armed: "found, armed", disarmed: "disarmed", sprung: "sprung" };

// Disclosures (#157): in a fight the room's details collapse behind
// #room-toggle, and once the fight is over the initiative table collapses
// behind #initiative-toggle. Each starts collapsed whenever it appears; the
// player's choice holds until then. #initiative-breakdown, a native details
// element, holds each combatant's roll and roll-offs.
const disclosures = { room: false, initiative: false };

function disclose(name, shown) {
  const toggle = element(name + "-toggle");
  if (!shown) disclosures[name] = false;
  toggle.hidden = !shown;
  toggle.setAttribute("aria-expanded", String(disclosures[name]));
  element(toggle.getAttribute("aria-controls")).hidden = shown && !disclosures[name];
}

// The character's own gear heads what it carries (#209): what it wears, the
// weapons in hand, then its stowed gear, each kind once with a count. Each
// entry's slot says which verbs go on it: Unequip on what is equipped,
// Wield, Equip and Drop on what is stowed.
function gearEntries(gear) {
  const counted = (items, slot, describe) => {
    const counts = new Map();
    for (const { id, name } of items) counts.set(id, { name, count: (counts.get(id)?.count ?? 0) + 1 });
    return [...counts].map(([id, { name, count }]) => ({ id, slot, name: count === 1 ? name : name + " (" + count + ")", description: describe(count) }));
  };
  const held = [gear.attack, ...(gear.lightAttack ? [gear.lightAttack] : [])].map(({ weaponId, weapon }) => ({ id: weaponId, name: weapon }));
  return [
    ...counted(gear.worn, "equipped", () => "Worn."),
    ...counted(held, "equipped", () => "In hand."),
    ...counted(gear.stowed, "stowed", () => "Carried, not equipped."),
  ];
}

function renderRoom(room, fighting) {
  element("room-title").textContent = room.name;
  element("room-description").textContent = room.description;
  for (const list of ROOM_LISTS) {
    const entries = list.key === "inventory" ? [...gearEntries(room.gear), ...room.inventory] : room[list.key];
    element(list.id + "-group").hidden = entries.length === 0;
    element(list.id).replaceChildren(...entries.map((entry) => {
      const item = make("li");
      item.dataset.id = entry.id;
      if (entry.slot) item.dataset.slot = entry.slot;
      const text = make("p");
      text.append(make("strong", entry.name), document.createTextNode(" — " + entry.description));
      item.append(text);
      if (entry.discovery) item.append(make("p", "You found: " + entry.discovery, "discovery"));
      // An exit's door and found trap (#132), and what each topic drew from a creature.
      if (entry.door) item.append(make("p", entry.door.name + ": " + (entry.door.open ? "open" : "shut") + ". " + entry.door.description, "door"));
      if (entry.trap) item.append(make("p", entry.trap.name + ": " + TRAP_STATES[entry.trap.state] + ". " + entry.trap.description, "trap"));
      for (const topic of entry.topics || []) {
        if (topic.said) item.append(make("p", "About " + topic.name + ": " + topic.said, "discovery"));
      }
      return item;
    }));
  }
  // The purse shows with what the character carries, once it holds coin.
  element("purse").textContent = room.purse ? "Purse: " + room.purse : "";
  element("purse").hidden = !room.purse;
  if (room.purse) element("inventory-group").hidden = false;
  element("room-empty").hidden = room.exits.length + room.features.length + room.creatures.length + room.items.length > 0;
  disclose("room", fighting);
}

// The character's AC and attacks from its gear as it stands (#209), in the
// status strip so a swap in a fight shows at once. Stowed gear is listed
// with what the character carries.
function renderGear(gear) {
  const worn = gear.worn.map(({ name }) => name.toLowerCase()).join(", ");
  element("gear-numbers").textContent = "AC " + gear.armorClass + (worn ? " (" + worn + ")" : "") + " · " + gear.attack.weapon + " " + attackText(gear.attack) + (gear.attack.grip === "two-handed" ? ", two-handed" : "") + (gear.lightAttack ? "; " + gear.lightAttack.weapon + " " + attackText(gear.lightAttack) + " as an extra attack" : "") + (gear.strengthShortfall ? "; speed −10 ft (Strength below " + gear.strengthShortfall.strength + ")" : "") + ".";
}

const rollText = (roll) => "d20 " + roll.d20 + withSign(roll.bonus) + " = " + roll.total + (roll.tieBreaks.length ? ", roll-off " + roll.tieBreaks.join(", ") : "");
const combatantName = (encounter, combatant) => combatant.name + (combatant.id === encounter.playerId ? " (you)" : "");

// The initiative table shows each total; the current turn's row is
// highlighted and its name tagged. The rolls behind the totals are on demand.
function renderInitiative(encounter, fighting) {
  element("initiative-rows").replaceChildren(...encounter.combatants.map((combatant) => {
    const current = combatant.id === encounter.currentTurn;
    const row = make("tr", undefined, (current ? "current" : "") + (combatant.defeated ? " defeated" : ""));
    row.dataset.combatant = combatant.id;
    if (current) row.setAttribute("aria-current", "true");
    const name = make("th", combatantName(encounter, combatant) + (combatant.sapped ? " (sapped)" : ""));
    name.scope = "row";
    if (current) name.append(" ", make("span", "Now", "tag now"));
    if (combatant.defeated) name.append(" ", make("span", "Defeated", "tag"));
    row.append(name, make("td", combatant.initiative.total), make("td", combatant.hp + "/" + combatant.maxHp), make("td", combatant.armorClass));
    return row;
  }));
  element("initiative-rolls").replaceChildren(...encounter.combatants.map((combatant) => {
    const item = make("li", combatantName(encounter, combatant) + ": " + rollText(combatant.initiative));
    item.dataset.combatant = combatant.id;
    return item;
  }));
  disclose("initiative", !fighting);
}

// One action at a time: every action control is disabled while one is in
// flight, and the one that started it (found by the control selector after
// the controls are redrawn) is busy.
async function act(path, body, control, busyLabel, pendingMessage) {
  if (acting) return false;
  acting = true;
  renderAdventure();
  element("adventure-error").textContent = "";
  if (pendingMessage !== undefined) showPending(pendingMessage);
  const button = document.querySelector(control);
  if (button) setBusy(button, busyLabel);
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
    if (button) clearBusy(button);
    acting = false;
    renderAdventure();
  }
}

// The action bar (#156): every action the session view projects, in its
// order. In a fight that is the character's whole toolkit; exploring, each
// move, examination, take and drink. An action the engine would refuse stays
// in place, disabled, with the engine's reason beside it.
// Each action's words. A label or busy name is followed by its target's name.
// Exploring, each target's name is shown once beside its short verbs (#157);
// each button's accessible name is still the full "Examine Iron-Bound Chest".
// Each target takes its own row (#214): names share a column and the verbs,
// all one width, start at the same x on every row. A name lines up with its
// first button's label: 11px is the button's border and top padding. 8.5em
// fits the widest busy label ("Examining…") even in CI's wider fonts.
// While its request runs (#185) a button shows its busy label ("Attacking…")
// and is named in full ("Attacking Goblin Warrior…"). Each button is sized for
// the wider of its labels, so a fight button's busy label must be no wider
// than its idle one: the fight row has no width to spare at 375 px.
const ACTIONS = {
  attack: { label: "Attack ", busy: "Attacking ", busyLabel: "Attacking…" },
  "light-attack": { label: "Extra attack ", busy: "Extra attack on ", busyLabel: "Attacking…" },
  use: { label: "Drink ", short: "Drink", busy: "Drinking ", busyLabel: "Drinking…" },
  move: { label: "Go to ", short: "Go", busy: "Going to ", busyLabel: "Going…" },
  examine: { label: "Examine ", short: "Examine", busy: "Examining ", busyLabel: "Examining…" },
  take: { label: "Take ", short: "Take", busy: "Taking ", busyLabel: "Taking…" },
  force: { label: "Force ", short: "Force", busy: "Forcing ", busyLabel: "Forcing…" },
  pick: { label: "Pick ", short: "Pick", busy: "Picking ", busyLabel: "Picking…" },
  break: { label: "Break ", short: "Break", busy: "Breaking ", busyLabel: "Breaking…" },
  unlock: { label: "Unlock ", short: "Unlock", busy: "Unlocking ", busyLabel: "Unlocking…" },
  search: { label: "Search ", short: "Search", busy: "Searching ", busyLabel: "Searching…" },
  disarm: { label: "Disarm ", short: "Disarm", busy: "Disarming ", busyLabel: "Disarming…" },
  talk: { label: "Talk to ", short: "Talk", busy: "Talking to ", busyLabel: "Talking…" },
  equip: { label: "Equip ", short: "Equip", busy: "Equipping ", busyLabel: "Equipping…" },
  unequip: { label: "Unequip ", short: "Unequip", busy: "Stowing ", busyLabel: "Stowing…" },
  swap: { label: "Wield ", short: "Wield", busy: "Wielding ", busyLabel: "Wielding…" },
  drop: { label: "Drop ", short: "Drop", busy: "Dropping ", busyLabel: "Dropping…" },
  "second-wind": { label: "Second Wind", busy: "Using Second Wind", busyLabel: "Using Second Wind…" },
  "action-surge": { label: "Action Surge", busy: "Using Action Surge", busyLabel: "Using Action Surge…" },
  "end-turn": { label: "End turn", busy: "Ending turn", busyLabel: "Ending" },
  leave: { label: "Leave the adventure", busy: "Leaving the adventure", busyLabel: "Leaving…" },
};
// Leave names the adventure, not the room it is taken from.
const named = (action, target) => target && action !== "leave" ? target.name : "";
const busyName = ({ action, target }) => ACTIONS[action].busy + named(action, target) + "…";
const FIGHT_FEATURES = ["second-wind", "action-surge", "end-turn"];
const GEAR = ["equip", "unequip", "swap", "drop"];
const EXPLORING = ["move", "examine", "take", "force", "pick", "break", "unlock", "search", "disarm", "talk"];

function renderActions() {
  // The ending (#158) takes the bar's place; an ended adventure projects no actions.
  element("action-bar").hidden = session.status !== "playing";
  const { encounter, features } = session;
  const fighting = Boolean(encounter && encounter.currentTurn !== null);
  const attacks = session.actions.filter(({ action }) => action === "attack").length;
  const ATTACKS = ["attack", "light-attack"];
  const left = (feature) => " (" + feature.uses + " of " + feature.max + " left)";
  const groups = { attack: [], feature: [], explore: [], leave: [], carried: [] };
  const carried = new Set(session.room.inventory.map(({ id }) => id));
  session.actions.forEach((option, index) => {
    const { action, target } = option;
    const exploring = EXPLORING.includes(action) || (action === "use" && !fighting);
    // Gear changes go on the gear's entry in "You carry" (#209), or in a
    // fight with the turn's other options, as Drink does.
    const group = ATTACKS.includes(action) ? "attack" : action === "leave" ? "leave" : GEAR.includes(action) ? (fighting ? "feature" : "carried") : exploring && carried.has(target.id) ? "carried" : exploring ? "explore" : "feature";
    const label = ACTIONS[action].label + named(action, target) + (action === "second-wind" ? left(features.secondWind) : action === "action-surge" ? left(features.actionSurge) : "");
    const short = group === "explore" || group === "carried";
    const button = make("button");
    button.append(make("span", short ? ACTIONS[action].short : label));
    button.dataset.busyLabel = ACTIONS[action].busyLabel;
    button.type = "button";
    if (short) button.setAttribute("aria-label", label);
    // One opponent makes attacking the fight's primary action; several are peers.
    button.className = action === "attack" ? "attack " + (attacks === 1 ? "primary" : "secondary") : action === "light-attack" ? "attack secondary" : action === "end-turn" ? "secondary" : group + " secondary";
    // "act" marks an action control, in the bar or on a carried item.
    button.classList.add("act");
    button.dataset.action = action;
    if (target) button.dataset.target = target.id;
    button.disabled = acting || !option.available;
    button.addEventListener("click", () => action === "leave" ? openLeave() : perform(option));
    const wrap = make("span", undefined, "action");
    wrap.append(button);
    if (!option.available) {
      const reason = make("span", option.reason, "reason");
      reason.id = "action-reason-" + index;
      button.setAttribute("aria-describedby", reason.id);
      wrap.append(reason);
    }
    if (group === "carried") {
      wrap.dataset.target = target.id;
      if (GEAR.includes(action)) wrap.dataset.slot = action === "unequip" ? "equipped" : "stowed";
      groups.carried.push(wrap);
      return;
    }
    if (!short) {
      groups[group].push(wrap);
      return;
    }
    let thing = groups[group].find((node) => node.dataset.target === target.id);
    if (!thing) {
      thing = make("span", undefined, "thing-actions");
      thing.dataset.target = target.id;
      thing.append(unspoken(make("span", target.name, "thing-name")), make("span", undefined, "thing-verbs"));
      groups[group].push(thing);
    }
    thing.lastChild.append(wrap);
  });
  element("attack-controls").replaceChildren(...groups.attack);
  element("feature-controls").replaceChildren(...groups.feature);
  element("explore-controls").replaceChildren(...groups.explore);
  element("leave-controls").replaceChildren(...groups.leave);
  // A carried item's verbs go on its entry in the room panel's list (#198).
  for (const entry of element("inventory").children) {
    const verbs = groups.carried.filter((wrap) => wrap.dataset.target === entry.dataset.id && wrap.dataset.slot === entry.dataset.slot);
    const controls = entry.querySelector(".controls") || entry.appendChild(make("div", undefined, "controls"));
    controls.replaceChildren(...verbs);
    controls.hidden = verbs.length === 0;
  }
  // While Leave asks for confirmation, the question stands in its place.
  const asking = confirmingLeave && groups.leave.length > 0;
  element("leave-controls").hidden = asking;
  element("leave-confirm").hidden = !asking;
  element("leave-question").textContent = "Leave " + session.adventure.title + "? This ends the adventure here. Any treasure or coin you carry out is yours to keep; you cannot come back to this adventure.";
  element("confirm-leave").disabled = acting;
  element("cancel-leave").disabled = acting;
}

function openLeave() {
  confirmingLeave = true;
  renderActions();
  element("confirm-leave").focus();
}

function cancelLeave() {
  confirmingLeave = false;
  renderActions();
  const leave = element("leave-controls").querySelector("button");
  if (leave) leave.focus();
}

async function leaveAdventure() {
  const option = session.actions.find(({ action }) => action === "leave");
  if (!option) return;
  await act("/api/5e/session/explore", { action: "leave", target: option.target.id }, "#confirm-leave", "Leaving…");
  // A refused or failed request leaves the question open to try again.
  if (session.ending) confirmingLeave = false;
  renderActions();
  element(session.ending ? "ending-title" : "confirm-leave").focus();
}

async function perform({ action, target }) {
  const targetId = target ? target.id : "";
  // The clicked control, found again after the bar re-renders, shows busy.
  const control = "button.act[data-action=" + JSON.stringify(action) + "]" + (targetId ? "[data-target=" + JSON.stringify(targetId) + "]" : ":not([data-target])");
  const busy = busyName({ action, target });
  if (action === "attack" || action === "light-attack") await act("/api/5e/session/" + action, { actorId: session.encounter.playerId, targetId }, control, busy);
  else if (FIGHT_FEATURES.includes(action)) await act("/api/5e/session/action", { action }, control, busy);
  else await act("/api/5e/session/explore", { action, target: targetId }, control, busy);
  keepFocus(action, targetId);
}

// After an action, focus stays on the clicked control while it is still
// enabled; otherwise it moves to the newest history entry, the action's
// result, and never to an unrelated action. An action that ends the
// adventure moves focus to the ending's heading.
function keepFocus(action, targetId) {
  if (session.ending) {
    element("ending-title").focus();
    return;
  }
  const same = [...document.querySelectorAll("button.act")].find((button) => button.dataset.action === action && (button.dataset.target || "") === targetId);
  if (same && !same.disabled) same.focus();
  else focusNewestEntry();
}

async function sendMessage(event) {
  event.preventDefault();
  const message = element("message").value.trim();
  if (!message || acting) return;
  if (await act("/api/5e/session/message", { message }, "#send-message", "Sending…", message)) element("message").value = "";
  element(session.ending ? "ending-title" : "message").focus();
}

// The creation's choices are sent to the server exactly as kept here; the
// increase's shape ("two": +2 and +1, "three": +1 to three) is kept apart.
let increaseMode = "two";
// The server projects every score, modifier, cap and the skill limit (#184).
// This is its projection of the current choices, cleared when they change.
let projection;


/**
 * The increase on switching shape: abilities already given a bonus keep one,
 * the larger first, then the rest of the table in order fill the shape.
 */
function defaultIncrease(mode, current) {
  const given = library.abilities.filter((ability) => current[ability]).sort((a, b) => current[b] - current[a]);
  const order = [...given, ...library.abilities.filter((ability) => !current[ability])];
  return mode === "two" ? { [order[0]]: 2, [order[1]]: 1 } : Object.fromEntries(order.slice(0, 3).map((ability) => [ability, 1]));
}

function defaultChoices() {
  increaseMode = "two";
  return {
    placement: { ...library.pendingCreation.defaultPlacement },
    ...structuredClone(${JSON.stringify(FIGHTER_DEFAULT_CHOICES)}),
  };
}

/** Redraws the ability table, keeps focus on the control just used and updates the preview. */
function changeAbilities(focusId) {
  projection = undefined;
  renderAbilities();
  if (focusId) element(focusId).focus();
  refresh();
}

/** Gives one ability a value held by another, which takes this one's old value. */
function swap(record, ability, chosen, empty) {
  const other = library.abilities.find((candidate) => candidate !== ability && (record[candidate] ?? empty) === chosen);
  const old = record[ability] ?? empty;
  if (other) {
    if (old === empty) delete record[other]; else record[other] = old;
  }
  if (chosen === empty) delete record[ability]; else record[ability] = chosen;
}

function rollSelect(ability) {
  const select = make("select");
  select.id = "place-" + ability;
  select.setAttribute("aria-label", titleCase(ability) + " roll");
  select.setAttribute("aria-describedby", "dice-" + ability);
  library.pendingCreation.rolls.forEach((roll, index) => {
    const holder = library.abilities.find((candidate) => choices.placement[candidate] === index);
    const option = make("option", roll.total + " (roll " + (index + 1) + ")" + (holder === ability ? "" : ", swaps with " + titleCase(holder)));
    option.value = String(index);
    select.append(option);
  });
  select.value = String(choices.placement[ability]);
  select.addEventListener("change", () => {
    swap(choices.placement, ability, Number(select.value));
    changeAbilities(select.id);
  });
  return select;
}

// +2 and +1: each bonus moves by swapping, so the shape is always legal. A
// bonus cannot be dropped to +0 here; choosing it on another ability moves it.
function bonusSelect(ability) {
  const select = make("select");
  select.id = "increase-" + ability;
  select.setAttribute("aria-label", titleCase(ability) + " background bonus");
  const current = choices.increase[ability] || 0;
  for (const amount of [0, 1, 2]) {
    const holder = amount === 0 ? undefined : library.abilities.find((candidate) => choices.increase[candidate] === amount);
    const option = make("option", "+" + amount + (amount === current || !holder ? "" : ", swaps with " + titleCase(holder)));
    option.value = String(amount);
    option.disabled = amount === 0 && current !== 0;
    select.append(option);
  }
  select.value = String(current);
  select.addEventListener("change", () => {
    swap(choices.increase, ability, Number(select.value), 0);
    changeAbilities(select.id);
  });
  return select;
}

// +1 to three: a tick per ability, and no fourth once three are ticked.
function bonusCheck(ability) {
  const label = make("label", undefined, "bonus-check");
  const box = make("input");
  box.type = "checkbox";
  box.id = "increase-" + ability;
  box.setAttribute("aria-label", titleCase(ability) + " background bonus");
  box.checked = Boolean(choices.increase[ability]);
  box.disabled = !box.checked && Object.keys(choices.increase).length >= 3;
  box.addEventListener("change", () => {
    if (box.checked) choices.increase[ability] = 1; else delete choices.increase[ability];
    changeAbilities(box.id);
  });
  const text = make("span", "+1");
  text.setAttribute("aria-hidden", "true");
  label.append(box, text);
  return label;
}

/** The four dice of the roll placed on an ability, the dropped one marked. */
function placedDice(ability) {
  const roll = library.pendingCreation.rolls[choices.placement[ability]];
  const dice = make("span", undefined, "dice");
  dice.id = "dice-" + ability;
  dice.append(spoken("Dice " + roll.dice.map((die, position) => die + (position === roll.dropped ? " dropped" : "")).join(", ")));
  roll.dice.forEach((die, position) => {
    const node = make("span", die, "die" + (position === roll.dropped ? " dropped" : ""));
    node.setAttribute("aria-hidden", "true");
    if (position === roll.dropped) node.title = "Dropped";
    dice.append(node);
  });
  return dice;
}

function renderAbilities() {
  element("increase-mode-" + increaseMode).checked = true;
  element("ability-rows").replaceChildren(...library.abilities.map((ability) => {
    const row = make("tr");
    row.dataset.ability = ability;
    // Phones show the sheet's three-letter abbreviation; the full name stays
    // the row's accessible name.
    const name = make("th");
    name.scope = "row";
    const short = make("span", ability.slice(0, 3).toUpperCase(), "short-name");
    short.setAttribute("aria-hidden", "true");
    name.append(make("span", titleCase(ability), "long-name"), short);
    const roll = make("td");
    roll.append(rollSelect(ability), placedDice(ability));
    const bonus = make("td", undefined, "bonus");
    bonus.append(increaseMode === "two" ? bonusSelect(ability) : bonusCheck(ability));
    const score = make("td", undefined, "num score");
    score.id = "score-" + ability;
    const modifier = make("td", undefined, "num modifier");
    modifier.id = "modifier-" + ability;
    row.append(name, roll, bonus, score, modifier);
    return row;
  }));
  renderScores();
}

/** Each row's score, cap and modifier as the server projected them; "…" until it has. */
function renderScores() {
  for (const ability of library.abilities) {
    const row = projection && projection.rows.find((candidate) => candidate.ability === ability);
    const score = element("score-" + ability);
    score.replaceChildren(row ? String(row.score) : "…");
    if (row && row.atCap) score.append(make("span", "max " + library.pendingCreation.rules.scoreCap, "cap"));
    element("modifier-" + ability).textContent = row ? signed(row.modifier) : "…";
  }
}

function renderChoices() {
  renderAbilities();
  element("skill-fields").replaceChildren(...library.skills.map((skill) => {
    const label = make("label");
    const box = make("input");
    box.type = "checkbox";
    box.id = "skill-" + skill.id;
    box.checked = choices.skills.includes(skill.id);
    box.addEventListener("change", () => {
      choices.skills = library.skills.map(({ id }) => id).filter((id) => element("skill-" + id).checked);
      refresh();
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
    radio.addEventListener("change", () => { choices.fightingStyle = style.id; refresh(); });
    const text = make("span", style.name);
    text.append(make("small", style.text));
    label.append(radio, text);
    return label;
  }));
  element("kit-fields").replaceChildren(...library.kits.map((kit) => {
    const label = make("label");
    const radio = make("input");
    radio.type = "radio";
    radio.name = "kit";
    radio.id = "kit-" + kit.id;
    radio.checked = choices.kit === kit.id;
    radio.addEventListener("change", () => { choices.kit = kit.id; refresh(); });
    const text = make("span", kit.name);
    const numbers = make("small", "…");
    numbers.id = "kit-numbers-" + kit.id;
    text.append(numbers);
    label.append(radio, text);
    return label;
  }));
  element("mastery-fields").replaceChildren(...library.masteryWeapons.map((weapon) => {
    const label = make("label");
    const box = make("input");
    box.type = "checkbox";
    box.id = "mastery-" + weapon.id;
    box.checked = choices.masteries.includes(weapon.id);
    box.addEventListener("change", () => {
      choices.masteries = library.masteryWeapons.map(({ id }) => id).filter((id) => element("mastery-" + id).checked);
      refresh();
    });
    const text = make("span", weapon.name + " (" + weapon.mastery + ")");
    text.append(make("small", weapon.text));
    label.append(box, text);
    return label;
  }));
}

/** Each kit's items and value, with the AC and attacks the server projected for it. */
function renderKits() {
  for (const kit of library.kits) {
    const shown = projection && projection.kits.find(({ id }) => id === kit.id);
    element("kit-numbers-" + kit.id).textContent = shown
      ? shown.items.join(", ") + " (" + shown.value + "). AC " + shown.armorClass + "; " + shown.attack.weapon + " " + attackText(shown.attack) + (shown.lightAttack ? "; then " + shown.lightAttack.weapon + " " + attackText(shown.lightAttack) + " as an extra attack" : "") + "."
      : "…";
  }
}

/** Like the skills: once the masteries are full, the unticked rest are disabled. */
function renderMasteryLimit() {
  const { chosen, limit, full } = projection.masteries;
  for (const { id } of library.masteryWeapons) {
    const box = element("mastery-" + id);
    box.disabled = full && !box.checked;
  }
  const count = chosen + " of " + limit + " chosen";
  if (element("masteries-count").textContent !== count) element("masteries-count").textContent = count;
}

/** Once the server says the skills are full, the unticked rest are disabled; the count is announced. */
function renderSkillLimit() {
  const { chosen, limit, full } = projection.skills;
  for (const { id } of library.skills) {
    const box = element("skill-" + id);
    box.disabled = full && !box.checked;
  }
  const count = chosen + " of " + limit + " chosen";
  if (element("skills-count").textContent !== count) element("skills-count").textContent = count;
}

/**
 * Asks the server to project the current choices. Saving waits for it. An
 * unfinished choice's error shows beside it, and the preview keeps its last
 * numbers until every choice is finished.
 */
function refresh() {
  projection = undefined;
  renderScores();
  element("save-character").disabled = true;
  return preview();
}

async function preview() {
  const ticket = ++previewRequest;
  try {
    const result = await request("/api/5e/creation/preview", choices);
    if (ticket !== previewRequest) return;
    projection = result;
    renderScores();
    renderSkillLimit();
    renderMasteryLimit();
    renderKits();
    element("increase-error").textContent = result.unfinished.increase || "";
    element("skills-error").textContent = result.unfinished.skills || "";
    element("masteries-error").textContent = result.unfinished.masteries || "";
    element("creation-error").textContent = "";
    if (result.sheet) {
      element("preview-status").textContent = "";
      element("preview-body").replaceChildren(...profileNodes(result.sheet.abilities, result.sheet.profile));
      element("save-character").disabled = isBusy(element("save-character"));
    } else {
      element("preview-status").textContent = element("preview-body").childElementCount ? "These numbers are from your last complete choices. Finish the choices marked above to update them." : "";
    }
  } catch (error) {
    // The server stays the authority: a choice it refuses blocks saving.
    if (ticket !== previewRequest) return;
    element("creation-error").textContent = error.message;
  }
}

function changeIncreaseMode(event) {
  increaseMode = event.target.value;
  choices.increase = defaultIncrease(increaseMode, choices.increase);
  changeAbilities();
}

async function openCreation(ticket) {
  const opener = element("open-creation");
  setBusy(opener, "Opening…");
  try {
    library = await request("/api/5e/creation", {});
  } catch (error) {
    if (ticket === routeTicket) lost(error.message);
    return;
  } finally {
    clearBusy(opener);
    opener.disabled = false;
  }
  if (ticket !== routeTicket) return;
  choices = choices || defaultChoices();
  projection = undefined;
  const rules = library.pendingCreation.rules;
  element("score-cap").textContent = rules.scoreCap;
  element("skills-legend").textContent = "Skill proficiencies: choose " + rules.skillCount;
  element("masteries-legend").textContent = "Weapon Mastery: choose " + rules.masteryCount;
  renderChoices();
  show("creation", "Create a Fighter", [{ label: "Create a Fighter" }]);
  element("creation-title").focus();
  await refresh();
}

async function saveCharacter(event) {
  event.preventDefault();
  const save = element("save-character");
  if (isBusy(save)) return;
  const name = element("character-name").value.trim();
  if (!name) {
    element("name-error").textContent = "Enter a name for your Fighter.";
    element("character-name").focus();
    return;
  }
  element("name-error").textContent = "";
  setBusy(save, "Saving…");
  try {
    library = await request("/api/5e/characters", { revision: library.revision, name, ...choices });
    clearBusy(save);
    save.disabled = false;
    choices = undefined;
    element("character-name").value = "";
    // The library appends the new character. Its sheet replaces the finished
    // creation in the history, so Back cannot reopen it and roll new dice.
    go("#character-" + library.characters[library.characters.length - 1].sheet.id, true);
    feedback(name + " is saved.");
  } catch (error) {
    element(/name/i.test(error.message) ? "name-error" : "creation-error").textContent = error.message;
    clearBusy(save);
    save.disabled = false;
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
  const confirm = element("confirm-delete");
  if (!nameMatches() || isBusy(confirm)) return;
  const { id, name } = shownSheet();
  setBusy(confirm, "Deleting…");
  try {
    library = await request("/api/5e/characters/delete", { revision: library.revision, characterId: id, name });
  } catch (error) {
    element("delete-error").textContent = error.message;
    clearBusy(confirm);
    confirm.disabled = !nameMatches();
    return;
  }
  clearBusy(confirm);
  restoreFocusOnClose = false;
  element("delete-dialog").close();
  go("", true);
  feedback(name + " was permanently deleted.");
}

element("open-creation").addEventListener("click", () => go("#create"));
element("creation-form").addEventListener("submit", saveCharacter);
element("close-creation").addEventListener("click", () => go(""));
for (const mode of ["two", "three"]) element("increase-mode-" + mode).addEventListener("change", changeIncreaseMode);
element("character-name").addEventListener("input", () => { element("name-error").textContent = ""; });
element("delete-character").addEventListener("click", openDelete);
element("delete-confirm-name").addEventListener("input", () => { element("confirm-delete").disabled = !nameMatches() || isBusy(element("confirm-delete")); });
element("delete-form").addEventListener("submit", deleteCharacter);
element("cancel-delete").addEventListener("click", () => element("delete-dialog").close());
element("delete-dialog").addEventListener("close", () => { if (restoreFocusOnClose) element("delete-character").focus(); });
element("message-form").addEventListener("submit", sendMessage);
element("ending-next").addEventListener("click", () => go(findEntry(session.characterId) ? "#character-" + session.characterId : ""));
element("confirm-leave").addEventListener("click", leaveAdventure);
element("cancel-leave").addEventListener("click", cancelLeave);
element("confirm-abandon").addEventListener("click", abandonAdventure);
element("cancel-abandon").addEventListener("click", closeAbandon);
for (const name of Object.keys(disclosures)) {
  element(name + "-toggle").addEventListener("click", () => {
    disclosures[name] = !disclosures[name];
    disclose(name, true);
  });
}
// The skip link moves focus without adding a history entry.
document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  element("content").focus();
});
element("log").addEventListener("scroll", () => {
  const log = element("log");
  followHistory = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
});
// When the dock around the log changes, as the Leave question opens or closes,
// the log changes size: a following reader stays on the newest entry (#221).
new ResizeObserver(followNewest).observe(element("log"));
// On a phone the dock is sticky: keep focused controls clear of it.
new ResizeObserver(() => {
  const dock = element("session-dock");
  document.documentElement.style.setProperty("--session-dock-height", getComputedStyle(dock).position === "sticky" ? dock.offsetHeight + "px" : "0px");
}).observe(element("session-dock"));
window.addEventListener("popstate", () => { if (library) route(true); });
request("/api/5e/library").then((value) => {
  library = value;
  // A reload returns to the view the URL names.
  route(false);
}, (error) => feedback(error.message));
`;
