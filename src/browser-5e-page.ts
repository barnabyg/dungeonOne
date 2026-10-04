// The `--5e` browser page (until #137): the 5e character library, the
// creation screen, the character sheet and the adventure screen. Bundled into
// dist so the extracted package serves the same interface. The script builds
// every element with textContent, never HTML from data.
//
// Adventure session regions (#154). Later tickets fill these containers; keep
// their ids and order so the layout holds:
// - #session-status: the status strip (#155): HP with its bar and health,
//   the round and whose turn it is (#turn), and #resources, a pip for each
//   turn resource and class feature use. It shows only what the session view
//   projects.
// - #session-scene: the room, the fight and the ending.
// - #session-actions: the action buttons (#attack-controls, #feature-controls)
//   and #adventure-error; #156's action bar goes here.
// - #session-history: the conversation history, #log, a live region in its own
//   scroll area, newest at the bottom; it follows new entries only while the
//   reader is at the bottom.
// - #session-composer: #message-form.
// Actions, history and composer share #session-dock. DOM order (and so tab
// order) is status, scene, actions, history, composer; the dock shows history
// above actions and composer. From 900 x 560 px the session fills the window
// in two columns (status and scene left, the dock right, each scrolling on its
// own); narrower, it is one column with the dock sticky at the bottom.
import { FEATURE_USES_RULE } from "./fighter-5e.js";

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
<button id="open-creation" type="button" class="primary">Create a Fighter</button>
</section>
<section id="creation" class="panel" aria-labelledby="creation-title" hidden>
<h2 id="creation-title" tabindex="-1">Create a Fighter</h2>
<p class="hint">Rolled once. No rerolls. Place the six rolls on your abilities in any order, then make your other choices.</p>
<h3>Your rolls</h3>
<ol id="rolls" class="rolls"></ol>
<form id="creation-form" novalidate>
<fieldset id="ability-scores" aria-describedby="ability-hint increase-error"><legend>Ability scores</legend>
<p id="ability-hint" class="hint">Place one roll on each ability; choosing a roll that is already placed swaps the two. Your background then adds +2 and +1, or +1 to three abilities. To move a bonus, choose it on another ability. No score can exceed 20.</p>
<fieldset id="increase-mode" class="choice-row"><legend>Background increase</legend><label><input type="radio" name="increase-mode" id="increase-mode-two" value="two"> +2 and +1</label><label><input type="radio" name="increase-mode" id="increase-mode-three" value="three"> +1 to three</label></fieldset>
<div class="table-wrap"><table id="ability-table"><thead><tr><th scope="col">Ability</th><th scope="col">Roll</th><th scope="col">Back&shy;ground</th><th scope="col" class="num">Score</th><th scope="col" class="num">Modi&shy;fier</th></tr></thead><tbody id="ability-rows"></tbody></table></div>
<p id="increase-error" class="error" role="alert"></p>
</fieldset>
<fieldset id="skills" aria-describedby="skills-error"><legend>Two skill proficiencies</legend><div id="skill-fields" class="checks"></div><p id="skills-error" class="error" role="alert"></p></fieldset>
<fieldset id="styles"><legend>Fighting Style</legend><div id="style-fields" class="checks"></div></fieldset>
<label for="character-name">Name</label><input id="character-name" maxlength="40" autocomplete="off" required aria-describedby="name-error"><p id="name-error" class="error" role="alert"></p>
<section id="preview" aria-labelledby="preview-title" aria-live="polite"><h3 id="preview-title">Before you save</h3><p id="preview-status" class="hint"></p><div id="preview-body"></div></section>
<p id="creation-error" class="error" role="alert"></p>
<div class="controls"><button id="save-character" type="submit" class="primary">Save character</button><button id="close-creation" type="button" class="secondary">Cancel</button></div>
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
<div id="session-layout">
<section id="session-status" aria-label="Status"><div id="status-hp" class="status-hp"><p id="character-hp"></p><span class="hp-bar" aria-hidden="true"><span id="hp-fill" class="hp-fill"></span></span></div><p id="turn" aria-live="polite"></p><ul id="resources" class="resources"></ul></section>
<div id="session-scene">
<section id="room" aria-labelledby="room-title"><h3 id="room-title"></h3><p id="room-description"></p>
<h4 id="exits-title">Exits</h4><ul id="exits" class="things" aria-labelledby="exits-title"></ul>
<h4 id="features-title">Features</h4><ul id="features" class="things" aria-labelledby="features-title"></ul>
<h4 id="room-items-title">Items here</h4><ul id="room-items" class="things" aria-labelledby="room-items-title"></ul>
<h4 id="inventory-title">You carry</h4><ul id="inventory" class="things" aria-labelledby="inventory-title"></ul>
</section>
<section id="encounter" aria-labelledby="encounter-title"><h3 id="encounter-title">Fight</h3>
<div class="table-wrap"><table id="initiative"><caption class="hint">Initiative order: each combatant rolled d20 + its initiative bonus.</caption><thead><tr><th scope="col">Turn</th><th scope="col">Combatant</th><th scope="col">Initiative</th><th scope="col">HP</th><th scope="col">AC</th></tr></thead><tbody id="initiative-rows"></tbody></table></div>
<p id="feature-rule" class="hint"></p>
</section>
<section id="ending" aria-labelledby="ending-title" hidden><h3 id="ending-title"></h3><p id="ending-text"></p></section>
</div>
<div id="session-dock">
<section id="session-actions" aria-label="Actions"><p id="adventure-error" class="error" role="alert"></p><div id="attack-controls" class="controls"></div><div id="feature-controls" class="controls"></div></section>
<section id="session-history" aria-labelledby="history-title"><h3 id="history-title">What happened</h3>
<ol id="log" class="log" aria-live="polite" aria-labelledby="history-title" tabindex="0"></ol></section>
<div id="session-composer"><form id="message-form" novalidate><label for="message">Tell the Dungeon Master what you do</label><div class="composer-row"><input id="message" maxlength="1000" autocomplete="off"><button id="send-message" type="submit" class="primary">Send</button></div></form></div>
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
button,legend,label,.eyebrow,.hint,.error,#feedback,table,.stats,.features{font-family:var(--font-sans)}button{font-size:var(--text-sm);border:1px solid var(--color-ink);background:transparent;color:var(--color-ink);padding:10px 14px;border-radius:var(--radius-sm);cursor:pointer;line-height:1.4}button:disabled{opacity:.55;cursor:default}
button.primary{background:var(--color-ink);border-color:var(--color-ink);color:var(--color-on-ink)}button.primary:hover:not(:disabled){background:var(--color-ink-hover)}button.secondary:hover:not(:disabled){background:var(--color-surface-hover)}button.quiet{border-color:transparent;text-decoration:underline;text-underline-offset:3px}button.quiet:hover:not(:disabled){background:var(--color-surface-hover)}button.danger{border-color:var(--color-danger);color:var(--color-danger)}button.danger:hover:not(:disabled){background:var(--color-danger-soft)}button.primary.danger{background:var(--color-danger);color:var(--color-on-ink)}button.primary.danger:hover:not(:disabled){background:var(--color-danger-hover)}
:focus-visible{outline:3px solid var(--color-focus);outline-offset:3px}[tabindex="-1"]:focus{outline:none}[hidden]{display:none!important}
.skip{position:absolute;top:-100px;left:12px;background:var(--color-paper);padding:10px;z-index:20}.skip:focus{top:12px}
.masthead{max-width:860px;margin:auto;padding:var(--space-4);display:flex;align-items:center;gap:var(--space-3);color:var(--color-on-dark)}.brand-mark{font-size:2rem;color:var(--color-gold)}.eyebrow{font-size:.62rem;letter-spacing:.18em;color:var(--color-gold);margin-bottom:6px}
main{max-width:860px;margin:0 auto var(--space-6);padding:0 var(--space-4)}.panel{background:var(--color-paper);border:1px solid var(--color-panel-border);border-radius:var(--radius-lg);padding:var(--space-5);margin-bottom:var(--space-4);min-width:0}
#feedback{color:var(--color-on-dark);font-size:var(--text-sm)}#breadcrumb ol{list-style:none;display:flex;flex-wrap:wrap;padding:0;margin:0 0 var(--space-3);font:var(--text-sm) var(--font-sans);color:var(--color-on-dark);overflow-wrap:anywhere}#breadcrumb li+li::before{content:"›"/"";margin:0 var(--space-2);color:var(--color-gold)}#breadcrumb a{color:var(--color-gold)}#breadcrumb-list:empty{display:none}#feedback:empty{display:none}.hint{font-size:var(--text-sm);color:var(--color-text-muted)}.error{color:var(--color-danger);font-size:var(--text-sm);font-weight:600}.error:empty{display:none}
.list{list-style:none;padding:0;margin:0 0 14px;display:grid;gap:var(--space-2)}.character-row{display:flex;gap:var(--space-2)}.list button{background:var(--color-surface);color:var(--color-text);border-color:var(--color-control-border)}.list button:hover{background:var(--color-surface-hover)}.open-character{flex:1 1 0;min-width:0;text-align:left;display:flex;flex-direction:column}.continue-adventure{flex:0 0 auto}.character-name{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-1) var(--space-2)}.list strong{font:600 var(--text-md) var(--font-serif);overflow-wrap:anywhere}.character-stats{font-size:var(--text-xs);color:var(--color-text-muted)}.character-row .tag{color:var(--color-ink)}.character-row.defeated .open-character{background:var(--color-paper);border-style:dashed}.character-row.defeated strong,.character-row.defeated .tag{color:var(--color-text-muted)}
.rolls{padding-left:0;list-style:none;display:grid;gap:6px;font-family:var(--font-sans)}.rolls li{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.die{display:inline-grid;place-items:center;width:30px;height:30px;border:1px solid var(--color-control-border);border-radius:var(--radius-sm);background:var(--color-surface);font-weight:700}.die.dropped{color:var(--color-text-muted);text-decoration:line-through;border-style:dashed}.total{font-weight:700;margin-left:6px}.roll-name{min-width:52px;font-size:var(--text-sm)}
fieldset{border:1px solid var(--color-line);border-radius:var(--radius-md);margin:0 0 14px;padding:var(--space-3);min-width:0}legend{font-weight:600;font-size:.9rem;padding:0 var(--space-1)}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-2) 14px}.grid label{display:flex;flex-direction:column;font-size:.82rem;font-weight:600}select,input{font:var(--text-md) var(--font-sans);padding:var(--space-2);border:1px solid var(--color-control-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text);width:100%;min-width:0;margin-top:var(--space-1)}label[for=character-name]{display:block;font-weight:600;font-size:var(--text-sm)}
.checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px 14px}.checks label{display:flex;gap:var(--space-2);align-items:flex-start;font-size:var(--text-sm)}.checks input{width:auto;padding:0;margin-top:var(--space-1);flex:none;accent-color:var(--color-ink)}.checks small{display:block;color:var(--color-text-muted);font-weight:400}
#preview{border-top:1px solid var(--color-line);margin-top:var(--space-4)}.stats{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:.88rem;margin:0 0 10px;padding:0;list-style:none}.stats li strong{margin-left:var(--space-1)}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;font-size:var(--text-sm);width:100%;margin-bottom:var(--space-3)}th,td{border-bottom:1px solid var(--color-line);padding:5px 6px;text-align:left}th{font-weight:600;color:var(--color-text-label)}
dialog{background:var(--color-paper);color:var(--color-text);border:1px solid var(--color-panel-border);border-radius:var(--radius-lg);padding:var(--space-5);width:min(480px,calc(100vw - 32px));max-width:none}dialog::backdrop{background:rgba(10,16,18,.7)}dialog label{display:block;font-weight:600;font-size:var(--text-sm);overflow-wrap:anywhere}
.features{font-size:var(--text-sm);padding-left:18px}.features li{margin:6px 0}.controls{display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-3)}
.eyebrow.dark{color:var(--color-gold-text)}.adventure-choice{border:1px solid var(--color-line);border-radius:var(--radius-md);padding:10px var(--space-3);margin-bottom:var(--space-2)}.adventure-choice p{margin-bottom:var(--space-2)}
#turn{font-family:var(--font-sans);font-weight:600}tr.current{background:var(--color-highlight)}tr.defeated td,tr.defeated th{color:var(--color-text-muted);font-weight:400}.tag{display:inline-block;padding:0 6px;border:1px solid currentColor;border-radius:999px;font:600 var(--text-xs)/1.5 var(--font-sans);white-space:nowrap}
.log{list-style:none;padding:0;margin:0 0 var(--space-3);display:grid;gap:var(--space-2);font-family:var(--font-sans);font-size:.88rem}.log li{border-left:3px solid var(--color-line);padding:var(--space-1) 10px}.log .player{font-weight:600}.card{background:var(--color-surface);border:1px solid var(--color-line);border-radius:var(--radius-sm);padding:var(--space-2) 10px;margin-top:6px;white-space:pre-line}.card.rejection{border-color:var(--color-danger)}.card .dice{display:block;color:var(--color-text-muted);font-size:var(--text-xs);margin-top:var(--space-1)}
h4{font:600 var(--text-sm) var(--font-sans);margin:var(--space-3) 0 6px;color:var(--color-text-label)}.things{list-style:none;padding:0;margin:0;display:grid;gap:6px;font-family:var(--font-sans);font-size:var(--text-sm)}.things li{border:1px solid var(--color-line);border-radius:var(--radius-sm);padding:6px 10px;background:var(--color-surface)}.things li.none{border:0;background:none;padding:0;color:var(--color-text-muted)}.things p{margin:0}.things .discovery{color:var(--color-discovery);margin-top:var(--space-1)}.things .controls{margin-top:6px}.things button{padding:6px 10px}#character-hp{font-weight:600}
#ending{border:2px solid var(--color-gold);border-radius:var(--radius-md);padding:var(--space-3);margin:var(--space-3) 0}#message-form label{display:block;font-weight:600;font-size:var(--text-sm)}
#session-layout{display:flex;flex-direction:column;gap:var(--space-3)}#session-status p{margin:0}
#session-status{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-1) 6px;font:var(--text-xs) var(--font-sans)}#character-hp{font-size:var(--text-sm)}.status-hp{display:grid;justify-items:start;gap:2px;white-space:nowrap;--hp-color:var(--color-hp-healthy)}.status-hp[data-health=bloodied]{--hp-color:var(--color-hp-wounded)}.status-hp[data-health=critical]{--hp-color:var(--color-hp-critical)}.status-hp[data-health=down]{--hp-color:var(--color-hp-down)}.status-hp .tag{color:var(--hp-color)}.hp-bar{display:block;justify-self:stretch;height:6px;border:1px solid var(--color-control-border);border-radius:999px;background:var(--color-surface);overflow:hidden}.hp-fill{display:block;height:100%;width:0;background:var(--hp-color)}#turn{white-space:nowrap;font-weight:400}#turn:empty{display:none}
.resources{display:contents}.resources li{display:flex;align-items:center;gap:3px;white-space:nowrap;font-size:.72rem}.pips{display:inline-flex;gap:2px}.pip{width:9px;height:9px;border:1.5px solid var(--color-ink);border-radius:50%}.pip.full{background:var(--color-ink)}.visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}#session-scene{min-width:0}#session-scene>section:first-child h3{margin-top:0}
#session-dock{position:sticky;bottom:0;z-index:1;display:flex;flex-direction:column;gap:var(--space-2);min-width:0;background:var(--color-paper);border-top:1px solid var(--color-line);padding:var(--space-2) 0 var(--space-3)}#session-history{order:1;display:flex;flex-direction:column;min-height:0}#session-actions{order:2;display:flex;flex-wrap:wrap;gap:var(--space-2)}#session-composer{order:3}
#session-actions .controls{margin-top:0}#session-actions .controls:empty{display:none}#session-actions .error{margin:0;flex-basis:100%}#history-title{margin:0 0 var(--space-2)}#log{max-height:min(26dvh,260px);overflow-y:auto;overscroll-behavior:contain;margin:0;padding-right:var(--space-1)}.composer-row{display:flex;gap:var(--space-2);margin-top:var(--space-1)}.composer-row input{flex:1;margin:0}
html{scroll-padding-bottom:var(--session-dock-height,0px)}
@media(min-width:900px) and (min-height:560px){body:has(#adventure:not([hidden])){height:100dvh;min-height:0;display:flex;flex-direction:column}body:has(#adventure:not([hidden])) .masthead,body:has(#adventure:not([hidden])) main{max-width:1240px;width:100%}body:has(#adventure:not([hidden])) main{flex:1;min-height:0;display:flex;flex-direction:column}#adventure{flex:1;min-height:0;display:flex;flex-direction:column}#session-layout{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);grid-template-rows:auto minmax(0,1fr);grid-template-areas:"status dock" "scene dock";gap:var(--space-3) var(--space-5)}#session-status{grid-area:status}#session-scene{grid-area:scene;min-height:0;overflow-y:auto;padding-right:var(--space-2)}#session-dock{grid-area:dock;position:static;min-height:0;border-top:0;border-left:1px solid var(--color-line);padding:0 0 0 var(--space-5)}#session-history{flex:1}#log{flex:1;max-height:none}}
@media(max-width:560px){:root{--text-xl:1.25rem;--text-2xl:1.5rem}#initiative th,#initiative td{padding:5px 3px}#initiative th:first-child,#initiative td:first-child{display:none}#initiative td{white-space:nowrap}#initiative .roll-off{display:block;white-space:normal;font-size:var(--text-xs)}.panel{padding:14px}.masthead{padding:var(--space-3) var(--space-4)}.grid,.checks{grid-template-columns:1fr}.die{width:28px;height:28px}}
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
    const button = make("button", "Continue " + title, "primary");
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
    button.className = "start-adventure secondary";
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
  followHistory = true;
  element("log").scrollTop = element("log").scrollHeight;
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
    element("initiative-rows").replaceChildren(...encounter.combatants.map((combatant) => {
      const row = make("tr", undefined, (combatant.id === encounter.currentTurn ? "current" : "") + (combatant.defeated ? " defeated" : ""));
      row.dataset.combatant = combatant.id;
      if (combatant.id === encounter.currentTurn) row.setAttribute("aria-current", "true");
      const name = make("th", combatant.name + (combatant.id === encounter.playerId ? " (you)" : "") + (combatant.sapped ? " (sapped)" : ""));
      name.scope = "row";
      if (combatant.defeated) name.append(" ", make("span", "Defeated", "tag"));
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
    // One target makes attacking the fight's primary action; several are peers.
    button.className = "attack " + (session.targets.length === 1 ? "primary" : "secondary");
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
    button.className = action === "end-turn" ? "secondary" : "feature secondary";
    button.dataset.action = action;
    button.disabled = acting;
    button.addEventListener("click", () => useFeature(action));
    return button;
  }));
  element("feature-rule").textContent = features ? ${JSON.stringify(FEATURE_USES_RULE)} : "";
  renderStatus();
  element("ending").hidden = !session.ending;
  if (session.ending) {
    element("ending-title").textContent = session.ending.title;
    element("ending-text").textContent = session.ending.text;
  }
  element("message").disabled = !playing || acting;
  element("send-message").disabled = !playing || acting;
  renderHistory();
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

function historyEntry(entry) {
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
}

// History only grows, so new entries are appended: the live region announces
// just them. The log follows the newest entry only while the reader is at the
// bottom; someone who scrolled up to read older entries stays where they are.
// Only the reader's scrolling changes that, not the dock resizing around it.
let followHistory = true;

function renderHistory() {
  const log = element("log");
  if (log.dataset.session !== session.id || log.children.length > session.history.length) {
    log.dataset.session = session.id;
    log.replaceChildren();
  }
  log.append(...session.history.slice(log.children.length).map(historyEntry));
  if (followHistory) log.scrollTop = log.scrollHeight;
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
        const button = make("button", label + entry.name, "explore secondary");
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

// The creation's choices are sent to the server exactly as kept here; the
// increase's shape ("two": +2 and +1, "three": +1 to three) is kept apart.
let increaseMode = "two";

/** Which ability each roll starts on: one replaceable rule. */
function defaultPlacement() {
  return Object.fromEntries(library.abilities.map((ability, index) => [ability, index]));
}

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
    placement: defaultPlacement(),
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

/** Redraws the ability table, keeps focus on the control just used and updates the preview. */
function changeAbilities(focusId) {
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

// Score and modifier are the sums the server applies; its preview stays the
// authority for every derived number and for saving.
function renderAbilities() {
  const rolls = library.pendingCreation.rolls;
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
    roll.append(rollSelect(ability));
    const bonus = make("td", undefined, "bonus");
    bonus.append(increaseMode === "two" ? bonusSelect(ability) : bonusCheck(ability));
    const score = rolls[choices.placement[ability]].total + (choices.increase[ability] || 0);
    const scoreCell = make("td", score, "num score");
    if (score >= 20) scoreCell.append(make("span", "max 20", "cap"));
    row.append(name, roll, bonus, scoreCell, make("td", signed(Math.floor((score - 10) / 2)), "num modifier"));
    return row;
  }));
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
}

/**
 * Shows each unfinished choice's error beside it. While one is unfinished the
 * preview keeps its last numbers and saving waits; otherwise it updates.
 */
function refresh() {
  const missing = 3 - Object.keys(choices.increase).length;
  const errors = {
    "increase-error": increaseMode === "three" && missing > 0 ? "Choose " + missing + " more " + (missing === 1 ? "ability" : "abilities") + " for +1." : "",
    "skills-error": choices.skills.length === 2 ? "" : "Choose two skills; " + choices.skills.length + " chosen.",
  };
  for (const [id, message] of Object.entries(errors)) element(id).textContent = message;
  if (Object.values(errors).some(Boolean)) {
    previewRequest++;
    element("save-character").disabled = true;
    element("preview-status").textContent = element("preview-body").childElementCount ? "These numbers are from your last complete choices. Finish the choices marked above to update them." : "";
    return Promise.resolve();
  }
  return preview();
}

async function preview() {
  const ticket = ++previewRequest;
  try {
    const result = await request("/api/5e/creation/preview", choices);
    if (ticket !== previewRequest) return;
    element("creation-error").textContent = "";
    element("preview-status").textContent = "";
    element("preview-body").replaceChildren(...profileNodes(result.abilities, result.profile));
    element("save-character").disabled = false;
  } catch (error) {
    // The server stays the authority: a choice it refuses blocks saving.
    if (ticket !== previewRequest) return;
    element("creation-error").textContent = error.message;
    element("save-character").disabled = true;
  }
}

function changeIncreaseMode(event) {
  increaseMode = event.target.value;
  choices.increase = defaultIncrease(increaseMode, choices.increase);
  changeAbilities();
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
  await refresh();
}

async function saveCharacter(event) {
  event.preventDefault();
  const name = element("character-name").value.trim();
  if (!name) {
    element("name-error").textContent = "Enter a name for your Fighter.";
    element("character-name").focus();
    return;
  }
  element("name-error").textContent = "";
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
    element(/name/i.test(error.message) ? "name-error" : "creation-error").textContent = error.message;
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
for (const mode of ["two", "three"]) element("increase-mode-" + mode).addEventListener("change", changeIncreaseMode);
element("character-name").addEventListener("input", () => { element("name-error").textContent = ""; });
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
element("log").addEventListener("scroll", () => {
  const log = element("log");
  followHistory = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
});
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
