// The browser page: the 5e character library, the creation screen, the
// character sheet and the adventure screen. Bundled into dist so the extracted package serves the same interface. The script builds
// every element with textContent, never HTML from data.
//
// Adventure session regions (#154). Later tickets fill these containers; keep
// their ids and order so the layout holds:
// - #session-status: the status strip (#155): HP with its bar and health,
//   the round and whose turn it is (#turn), the character's conditions in a
//   fight (#conditions, #232), and #resources, a pip for each
//   turn resource and class feature use, and outside a fight's turns for
//   each hit die (#333). It shows only what the session view projects.
// - #session-scene: the room and the fight. The room lists only
//   what is there (#157); in a fight its details collapse behind #room-toggle.
//   The fight's initiative table shows totals, marks the current turn, tags
//   fleeing and fled opponents (#237) and surrendering and surrendered ones
//   (#238), and
//   keeps each roll in #initiative-breakdown; it collapses behind
//   #initiative-toggle once the fight is over.
// - #session-actions: #adventure-error and the action bar (#156), #action-bar:
//   #attack-controls, #feature-controls (Drink in a fight, Second Wind, Action
//   Surge, End turn; only Wait, with why, while paralysed, #234; Tactical
//   Mind right after a failed check, #315) and
//   #explore-controls (Go, Examine, Take, Drink, Force, Pick, Break, Unlock,
//   Search, Disarm and Talk, grouped by target with the
//   full name as each button's accessible name) and #leave-controls (Leave
//   the adventure, in an exit room; #133). Leave asks first in #leave-confirm,
//   just after the bar, in place of the button, never in a browser dialog. It
//   shows every action the session view projects, an unavailable one disabled
//   with its reason as visible text linked by aria-describedby. Outside a
//   fight, what the character carries is acted on from the room panel's
//   #inventory, not the bar (#198): each carried item's Examine and Drink sit
//   on its entry, and the character's own gear heads the list with its
//   Unequip, Wield, Equip and Drop (#209), so a laden character's bar stays
//   short enough for a phone. A short rest (#334) sits in the room panel's
//   #rest-group, never the bar: the short rests and hit dice left, a choice
//   of how many hit dice to spend (#rest-dice) and its Rest button, disabled
//   with its reason when the engine would refuse it. Rest and its choice show
//   only while a rest would restore something. At a rest site (#335) the
//   group's #long-rest part shows the long rests left and, while one would
//   restore something, its Long rest button, disabled with its reason when
//   the engine would refuse it. Where a merchant is (#210), Buy sits on each of
//   its wares in #creatures and Sell on each "You carry" entry; selling
//   equipped gear asks first in #sale-confirm, inside that entry. Gems and
//   art objects (#239) show their value on their entry and sell for it in
//   full, found here or brought in. Arrows and bolts (#230) have an entry
//   each with their count, and sell there by the bundle of 20. Facing a
//   reaction (#304), the bar holds only its options: a parley (#305) has a
//   button per skill with the skill and DC under it, and a toll names its
//   price; while the band offers trade, the reacting opponents are a
//   merchant in #creatures, traded with as above.
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
// A level-4 character's sheet (#286) leads with #level-choice, the level-up
// card that asks for its Ability Score Improvement (#asi-mode-two or
// #asi-mode-split, then #asi-<ability>) and, for a Fighter, its fourth weapon
// mastery (#new-mastery-<id>; a Rogue's level 4 brings none, #308). The
// server projects every score and lists every change in
// #level-choice-changes; #confirm-level-choice makes the choice.
// Until it is made the sheet offers no adventure.
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
import { FEATURE_USES_RULE } from "./class-5e.js";
import { DEFAULT_CLASS } from "./character-5e.js";
import { DAMAGE_ADJUSTMENT_TEXT } from "./runtime-5e.js";

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
<h2 id="library-title" tabindex="-1">Your characters</h2>
<p id="feedback" role="status" aria-live="polite"></p>
<ul id="characters" class="list"></ul>
<p id="no-characters" class="hint" hidden>No characters yet.</p>
<button id="open-creation" type="button" class="primary">Create a character</button>
</section>
<section id="creation" class="panel" aria-labelledby="creation-title" hidden>
<h2 id="creation-title" tabindex="-1">Create a character</h2>
<p class="hint">Rolled once. No rerolls. Choose a class, place the six rolls on your abilities in any order, then make your other choices.</p>
<form id="creation-form" novalidate>
<fieldset id="classes" aria-describedby="class-hint"><legend>Class</legend><div id="class-fields" class="choice-row"></div><p id="class-hint" class="hint"></p></fieldset>
<fieldset id="ability-scores" aria-describedby="ability-hint increase-error"><legend>Ability scores</legend>
<p id="ability-hint" class="hint">Place one roll on each ability; choosing a roll that is already placed swaps the two. Your background then adds +2 and +1, or +1 to three abilities. To move a bonus, choose it on another ability. No score can exceed <span id="score-cap"></span>.</p>
<fieldset id="increase-mode" class="choice-row"><legend>Background increase</legend><label><input type="radio" name="increase-mode" id="increase-mode-two" value="two"> +2 and +1</label><label><input type="radio" name="increase-mode" id="increase-mode-three" value="three"> +1 to three</label></fieldset>
<div class="table-wrap"><table id="ability-table"><thead><tr><th scope="col">Ability</th><th scope="col">Roll</th><th scope="col">Back&shy;ground</th><th scope="col" class="num">Score</th><th scope="col" class="num">Modi&shy;fier</th></tr></thead><tbody id="ability-rows"></tbody></table></div>
<p id="increase-error" class="error" role="alert"></p>
</fieldset>
<fieldset id="skills" aria-describedby="skills-count skills-error"><legend id="skills-legend">Skill proficiencies</legend><p id="skills-count" class="hint" role="status"></p><div id="skill-fields" class="checks"></div><p id="skills-error" class="error" role="alert"></p></fieldset>
<fieldset id="expertise" aria-describedby="expertise-count expertise-error" hidden><legend id="expertise-legend">Expertise</legend><p id="expertise-hint" class="hint"></p><p id="expertise-count" class="hint" role="status"></p><div id="expertise-fields" class="checks"></div><p id="expertise-error" class="error" role="alert"></p></fieldset>
<fieldset id="divine-order" hidden><legend>Divine Order</legend><div id="order-fields" class="checks"></div></fieldset>
<fieldset id="spells" aria-describedby="spells-count spells-error" hidden><legend>Spells</legend><p class="hint">Cantrips are cast at will; prepared spells use spell slots. Prepared spells change only between adventures, on the character sheet.</p><p id="spells-count" class="hint" role="status"></p><fieldset class="spell-group"><legend id="cantrips-legend">Cantrips</legend><div id="cantrip-fields" class="checks"></div></fieldset><fieldset id="spellbook-group" class="spell-group" hidden><legend id="spellbook-legend">Spellbook</legend><p class="hint">You prepare spells only from your spellbook.</p><div id="spellbook-fields" class="checks"></div></fieldset><fieldset class="spell-group"><legend id="prepared-legend">Prepared spells</legend><div id="prepared-fields" class="checks"></div></fieldset><p id="spells-error" class="error" role="alert"></p></fieldset>
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
<section id="level-choice" class="level-up" aria-labelledby="level-choice-title" hidden><h3 id="level-choice-title"></h3><ul id="level-up-changes"></ul>
<fieldset id="asi" aria-describedby="asi-error"><legend>Ability Score Improvement</legend><fieldset class="choice-row"><legend>How to improve</legend><label><input type="radio" name="asi-mode" id="asi-mode-two" value="two"> +2 to one ability</label><label><input type="radio" name="asi-mode" id="asi-mode-split" value="split"> +1 to two abilities</label></fieldset><div id="asi-fields" class="checks"></div><p id="asi-error" class="error" role="alert"></p></fieldset>
<fieldset id="new-mastery" aria-describedby="new-mastery-error"><legend>Fourth weapon mastery</legend><p class="hint">A mastery works only while you wield that weapon.</p><div id="new-mastery-fields" class="checks"></div><p id="new-mastery-error" class="error" role="alert"></p></fieldset>
<h4 id="level-choice-changes-title">What these choices change</h4><p id="level-choice-status" class="hint"></p><ul id="level-choice-changes" aria-labelledby="level-choice-changes-title"></ul>
<p id="level-choice-error" class="error" role="alert"></p><div class="controls"><button id="confirm-level-choice" type="button" class="primary">Confirm level choices</button></div></section>
<section id="sheet-adventures" aria-labelledby="sheet-adventures-title"><h3 id="sheet-adventures-title">Adventures</h3><p id="defeat-warning" class="hint"></p><div id="adventure-choices"></div><div id="abandon-confirm" class="confirm" hidden><p id="abandon-question"></p><div class="controls"><button id="confirm-abandon" type="button" class="primary danger">Abandon adventure</button><button id="cancel-abandon" type="button" class="secondary">Keep going</button></div></div><p id="start-error" class="error" role="alert"></p></section>
<div id="sheet-body"></div>
<div class="controls"><button id="delete-character" type="button" class="danger">Delete character</button></div>
</section>
<section id="adventure" class="panel" aria-labelledby="adventure-title" hidden>
<p id="adventure-meta" class="eyebrow dark"></p>
<h2 id="adventure-title" tabindex="-1"></h2>
<p id="adventure-objective" class="hint"></p>
<div id="session-layout">
<section id="session-status" aria-label="Status"><div id="status-hp" class="status-hp"><p id="character-hp"></p><span class="hp-bar" aria-hidden="true"><span id="hp-fill" class="hp-fill"></span></span></div><p id="turn" aria-live="polite"></p><ul id="conditions" class="conditions" aria-label="Conditions"></ul><ul id="effects" class="conditions" aria-label="Spell effects"></ul><ul id="resources" class="resources"></ul><p id="gear-numbers"></p></section>
<div id="session-scene">
<section id="room" aria-labelledby="room-title"><h3 id="room-title"></h3>
<button id="room-toggle" type="button" class="quiet disclosure" aria-expanded="false" aria-controls="room-details" hidden>Room details</button>
<div id="room-details"><p id="room-description"></p>
<div id="exits-group"><h4 id="exits-title">Exits</h4><ul id="exits" class="things" aria-labelledby="exits-title"></ul></div>
<div id="features-group"><h4 id="features-title">Features</h4><ul id="features" class="things" aria-labelledby="features-title"></ul></div>
<div id="creatures-group"><h4 id="creatures-title">Creatures</h4><ul id="creatures" class="things" aria-labelledby="creatures-title"></ul></div>
<div id="room-items-group"><h4 id="room-items-title">Items here</h4><ul id="room-items" class="things" aria-labelledby="room-items-title"></ul></div>
<p id="room-empty" class="hint" hidden>There is nothing else here.</p>
<div id="inventory-group"><h4 id="inventory-title">You carry</h4><ul id="inventory" class="things" aria-labelledby="inventory-title"></ul><p id="purse"></p><p id="carrying"></p></div>
<div id="rest-group" hidden><h4 id="rest-title">Short rest</h4><p id="rest-summary" class="hint"></p><div id="rest-controls" class="controls rest-panel"></div><div id="long-rest" hidden><h4 id="long-rest-title">Long rest</h4><p id="long-rest-summary" class="hint"></p><div id="long-rest-controls" class="controls rest-panel"></div></div></div>
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
.log .roll{color:var(--color-text-muted);font-size:var(--text-xs);margin-top:2px}.compact .who{font-weight:600}.compact .tag,.compact .roll-die{display:inline}.compact *{line-height:1}.card.has-more{position:relative;margin-top:10px}.card-more::before{content:"▸ "/""}.card-more[aria-expanded=true]::before{content:"▾ "/""}.card.has-more>.card-more{position:absolute;top:0;right:var(--space-2);transform:translateY(-50%);padding:0 4px;font-size:var(--text-xs);line-height:1.3;color:var(--color-text-label);background:inherit}.full-text{white-space:pre-line;margin-top:var(--space-1);font-size:var(--text-sm)}.roll-label{font-weight:600;color:var(--color-text-label)}.roll-die{display:inline-block;padding:0 4px;border:1px solid var(--color-control-border);border-radius:var(--radius-sm);background:var(--color-paper);color:var(--color-text);font-variant-numeric:tabular-nums;white-space:nowrap}.roll-die.dropped{border-style:dashed;color:var(--color-text-muted);text-decoration:line-through}.roll strong{color:var(--color-text);font-size:var(--text-sm)}.tag.hit,.tag.critical,.tag.success{color:var(--color-success)}.tag.miss{color:var(--color-text-muted)}.tag.failure{color:var(--color-danger)}.roll-die.counted{font-weight:700}.tag.applies{color:var(--color-success)}.tag.no-effect{color:var(--color-text-muted)}.style-use-line{font:var(--text-sm) var(--font-sans)}
h4{font:600 var(--text-sm) var(--font-sans);margin:var(--space-3) 0 6px;color:var(--color-text-label)}.things{list-style:none;padding:0;margin:0;display:grid;gap:6px;font-family:var(--font-sans);font-size:var(--text-sm)}.things li{border:1px solid var(--color-line);border-radius:var(--radius-sm);padding:6px 10px;background:var(--color-surface)}.things li.none{border:0;background:none;padding:0;color:var(--color-text-muted)}.things p{margin:0}.things .discovery{color:var(--color-discovery);margin-top:var(--space-1)}.things .controls{margin-top:6px}#inventory .action{width:8.5em}#inventory .action button{width:100%}.things .wares{list-style:none;padding:0;margin:6px 0 0;display:grid;gap:6px}.things .wares li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--space-1) var(--space-2);border:0;padding:0;background:none}.things .wares .controls{margin-top:0}.wares .action{width:8.5em}.wares .action button{width:100%}#sale-confirm{margin:6px 0 0}.things button{padding:6px 10px}#character-hp{font-weight:600}
#ending{flex-basis:100%;border:2px solid var(--ending-color);border-left-width:6px;border-radius:var(--radius-md);background:var(--color-surface);padding:var(--space-3);font-family:var(--font-sans)}#ending[data-kind=victory]{--ending-color:var(--color-success)}#ending[data-kind=escape-with-loot]{--ending-color:var(--color-gold-text)}#ending[data-kind=escape-without-loot]{--ending-color:var(--color-ink)}#ending[data-kind=defeat]{--ending-color:var(--color-danger)}#ending-rewards h4{margin:var(--space-2) 0 var(--space-1)}#ending-rewards ul{margin:0 0 var(--space-2);padding-left:18px;font-size:var(--text-sm)}.level-up{border:1px solid var(--color-gold);border-radius:var(--radius-md);background:var(--color-highlight);padding:var(--space-2) var(--space-3);margin:0 0 var(--space-2)}.level-up h4{margin-top:0;color:var(--color-text)}#level-choice{margin:var(--space-3) 0}#level-choice h3{margin-top:0}#level-choice ul{padding-left:18px;font-size:var(--text-sm)}#level-choice h4{margin-top:var(--space-3)}#level-choice fieldset{background:var(--color-surface)}#level-choice .choice-row{background:none}#ending .level-up p{margin:0}#level-up-features{list-style:none;margin:var(--space-1) 0 0;padding:0;font-size:var(--text-sm)}#level-up-features summary{cursor:pointer;padding:var(--space-1) 0;font-weight:600}#ending #level-up-features p{margin:0 0 var(--space-1) 1.1em}.confirm{flex-basis:100%;border:1px solid var(--color-control-border);border-left:4px solid var(--color-ink);border-radius:var(--radius-md);background:var(--color-surface);padding:var(--space-3);margin-bottom:var(--space-3);font-family:var(--font-sans)}.confirm p{margin:0;font-size:var(--text-sm)}#session-actions .confirm{margin-bottom:0}#ending h3{margin:0 0 var(--space-1);font-family:var(--font-serif)}#ending-kind{color:var(--ending-color);margin:0 0 var(--space-2)}#ending p:not(.tag){margin:0 0 var(--space-2);font-size:var(--text-sm)}#ending-consequence{font-weight:600;color:var(--color-danger)}#ending-consequence:empty{display:none}#ending-next{margin-top:var(--space-1)}#composer-reason{margin:var(--space-1) 0 0}#composer-reason:empty{display:none}#message-form label{display:block;font-weight:600;font-size:var(--text-sm)}
#session-layout{display:flex;flex-direction:column;gap:var(--space-3)}#session-status p{margin:0}
#gear-numbers{flex-basis:100%}#session-status{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-1) 6px;font:var(--text-xs) var(--font-sans)}#character-hp{font-size:var(--text-sm)}.status-hp{display:grid;justify-items:start;gap:2px;white-space:nowrap;--hp-color:var(--color-hp-healthy)}.status-hp[data-health=bloodied]{--hp-color:var(--color-hp-wounded)}.status-hp[data-health=critical]{--hp-color:var(--color-hp-critical)}.status-hp[data-health=down]{--hp-color:var(--color-hp-down)}.status-hp .tag{color:var(--hp-color)}.hp-bar{display:block;justify-self:stretch;height:6px;border:1px solid var(--color-control-border);border-radius:999px;background:var(--color-surface);overflow:hidden}.hp-fill{display:block;height:100%;width:0;background:var(--hp-color)}#turn{white-space:nowrap;font-weight:400}#turn:empty{display:none}.conditions{display:contents}.conditions li{display:flex}.tag.effect{color:var(--color-text-label)}.effect-until{color:var(--color-text-muted)}.action.cast-choice{flex-direction:row;flex-wrap:wrap;align-items:center;gap:var(--space-1)}.cast-choice select{width:auto;max-width:100%;margin:0}.cast-targets{display:inline-flex;flex-wrap:wrap;align-items:center;gap:var(--space-1) var(--space-2)}.cast-targets label{display:inline-flex;align-items:center;gap:var(--space-1);font-size:var(--text-sm)}.cast-targets input{width:auto;margin:0}.tag.condition{color:var(--color-danger)}
.resources{display:contents}.resources li{display:flex;align-items:center;gap:3px;white-space:nowrap;font-size:.72rem}.pips{display:inline-flex;gap:2px}.pip{width:9px;height:9px;border:1.5px solid var(--color-ink);border-radius:50%}.pip.full{background:var(--color-ink)}.visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}#session-scene{min-width:0}#session-scene>section:first-child h3{margin-top:0}
#session-dock{position:sticky;bottom:0;z-index:1;display:flex;flex-direction:column;gap:var(--space-2);min-width:0;background:var(--color-paper);border-top:1px solid var(--color-line);padding:var(--space-2) 0 var(--space-3)}#session-history{order:1;display:flex;flex-direction:column;min-height:0}#session-actions{order:2;display:flex;flex-wrap:wrap;gap:var(--space-2)}#session-composer{order:3}
.controls.rest-panel{align-items:flex-end}#rest-controls label{display:inline-flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm)}#rest-controls select{width:auto;margin:0}#session-actions .controls{margin-top:0;min-width:0;max-width:100%}#session-actions .controls:empty{display:none}#action-bar{display:contents}.action{display:inline-flex;flex-direction:column;align-items:flex-start;gap:2px;max-width:100%;min-width:0}.action button{max-width:100%}:is(#action-bar,#inventory,.wares,.rest-panel) button{display:inline-grid}:is(#action-bar,#inventory,.wares,.rest-panel) button>span,:is(#action-bar,#inventory,.wares,.rest-panel) button::after{grid-area:1/1}:is(#action-bar,#inventory,.wares,.rest-panel) button::after{content:attr(data-busy-label);visibility:hidden}:is(#action-bar,#inventory,.wares,.rest-panel) button[aria-busy=true]>span{visibility:hidden}:is(#action-bar,#inventory,.wares,.rest-panel) button[aria-busy=true]::after{visibility:visible}.reason{font:var(--text-xs) var(--font-sans);color:var(--color-text-muted)}.approach,.retry{font:var(--text-xs) var(--font-sans);color:var(--color-text-label)}#session-actions .error{margin:0;flex-basis:100%}#history-title{margin:0 0 var(--space-2)}#log{max-height:min(26dvh,260px);overflow-y:auto;overscroll-behavior:contain;margin:0;padding-right:var(--space-1)}.composer-row{display:flex;gap:var(--space-2);margin-top:var(--space-1)}.composer-row input{flex:1;margin:0}#dm-notice{margin:var(--space-1) 0 0}
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

const characterStatus = (entry) => entry.defeated ? "Defeated" : entry.session ? "On an adventure" : entry.levelChoice ? "Level choice to make" : "";
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
    button.append(heading, make("span", "Level " + sheet.level + " " + entry.className + " · HP " + sheet.hp + "/" + profile.maxHp + " · AC " + profile.armorClass, "character-stats"));
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
  element("open-creation").textContent = library.pendingCreation ? "Continue creating your character" : "Create a character";
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

/**
 * "+5 to hit, 1d6 + 3 bludgeoning, Sap" for one weapon attack; a ranged one
 * says what it shoots and when it has disadvantage (#230).
 */
function attackText(attack) {
  return signed(attack.bonus) + " to hit, " + damageText(attack.damage) + " " + attack.damage.type + (attack.mastery ? ", " + attack.mastery : "") + (attack.ammunition ? ", ranged (" + attack.ammunition + "; disadvantage from round 2)" : "") + attack.disadvantage.map((source) => ", disadvantage (" + source + ")").join("") + (attack.criticalRange === 19 ? ", critical on 19–20" : "");
}

/**
 * "; disadvantage on Strength and Dexterity rolls (untrained in chain mail);
 * the shield adds no AC (untrained)" for armour or a shield worn without the
 * class's training (SRD 5.2), or "".
 */
const untrainedText = (gear) => (gear.untrainedArmour ? "; disadvantage on Strength and Dexterity rolls (untrained in " + gear.untrainedArmour.toLowerCase() + ")" : "") + (gear.untrainedShield ? "; the shield adds no AC (untrained)" : "");

/** "17 arrows", "1 bolt". */
const ammunitionText = ({ id, count }) => count + " " + (count === 1 ? id.slice(0, -1) : id);

function profileNodes(abilities, profile, hp, carrying) {
  const stats = make("ul", undefined, "stats");
  const entries = [
    ["HP", (hp === undefined ? profile.maxHp : hp) + "/" + profile.maxHp],
    ["AC", profile.armorClass + untrainedText(profile)],
    // The engine weighs what is carried against Strength × 15 lb (#224).
    ["Carrying", carrying.weight + " of " + carrying.capacity + " lb"],
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
  const skills = make("p", "Skills: " + profile.skills.filter((skill) => skill.proficient).map((skill) => skill.name + " " + signed(skill.bonus) + (skill.expertise ? " (Expertise)" : "")).join(", ") + "." + (profile.tools ? " Tools: " + profile.tools.join(", ") + "." : ""), "hint");
  const features = make("ul", undefined, "features");
  for (const feature of profile.features) {
    const item = make("li");
    item.append(make("strong", feature.name + ". "), document.createTextNode(feature.text));
    features.append(item);
  }
  return [stats, abilityTable(abilities, profile, "Ability scores and saving throws"), skills, ...spellcastingNodes(profile.spellcasting), make("h3", "Features"), features];
}

/** A spell by id, from the classes' lists (#339). */
const spellInfo = (id) => library.classes.flatMap(({ spellcasting }) => spellcasting ? spellcasting.spells : []).find((spell) => spell.id === id) || { id, name: id, summary: "" };

/**
 * A caster's spellcasting (#339): its spell attack bonus and save DC, its
 * slots, and its cantrips and prepared spells, each with what it does.
 */
function spellcastingNodes(casting) {
  if (!casting) return [];
  const heading = make("h3", "Spellcasting");
  heading.id = "spellcasting-title";
  const numbers = make("p", "Spell attack " + signed(casting.attackBonus) + " · Spell save DC " + casting.saveDc + " · " + titleCase(casting.ability) + " · Spell slots: " + casting.slots.map((count, index) => count + " " + ORDINALS[index + 1] + "-level").join(", ") + ".");
  numbers.id = "spellcasting-numbers";
  const list = (title, id, ids) => {
    const node = make("ul", undefined, "features");
    node.id = id;
    node.setAttribute("aria-label", title);
    node.append(...ids.map((spellId) => {
      const spell = spellInfo(spellId);
      const item = make("li");
      item.append(make("strong", spell.name + ". "), document.createTextNode(spell.summary + "."));
      return item;
    }));
    return [make("h4", title), node];
  };
  // A Wizard's spellbook (#340), whose spells it prepares from; the Life
  // Domain's always-prepared spells (#341).
  return [heading, numbers, ...list("Cantrips", "sheet-cantrips", casting.cantrips), ...(casting.spellbook ? list("Spellbook", "sheet-spellbook", casting.spellbook) : []), ...list("Prepared spells", "sheet-prepared", casting.prepared), ...(casting.alwaysPrepared ? list("Always prepared", "sheet-always-prepared", casting.alwaysPrepared) : [])];
}

// The cantrips being learned on a sheet (#342), by character.
let learning;

/**
 * Learning a new level's cantrips (#342): between adventures, while some
 * are owed, a tick for each cantrip on the class's list not yet known and
 * Learn.
 */
function learnNodes(entry) {
  if (!entry.spells || entry.defeated || entry.session || !entry.spells.cantripsOwed) return [];
  const owed = entry.spells.cantripsOwed;
  if (!learning || learning.characterId !== entry.sheet.id) learning = { characterId: entry.sheet.id, cantrips: [] };
  const heading = make("h3", "Learn " + (owed === 1 ? "a cantrip" : owed + " cantrips"));
  heading.id = "learn-title";
  const group = make("fieldset");
  group.id = "learn-cantrips";
  group.append(make("legend", "Level " + entry.sheet.level + " lets you learn " + (owed === 1 ? "a new cantrip: choose it" : owed + " new cantrips: choose them") + " before the next adventure."));
  const fields = make("div", undefined, "checks");
  const button = make("button", owed === 1 ? "Learn cantrip" : "Learn cantrips", "secondary");
  button.type = "button";
  button.id = "save-cantrips";
  const error = make("p", "", "error");
  error.id = "learn-error";
  error.setAttribute("role", "alert");
  const update = () => {
    for (const box of fields.querySelectorAll("input")) box.disabled = !box.checked && learning.cantrips.length >= owed;
    button.disabled = isBusy(button) || learning.cantrips.length !== owed;
  };
  fields.append(...entry.spells.learnable.map((spell) => spellBox("learn-" + spell.id, spell, learning.cantrips.includes(spell.id), (event) => {
    learning.cantrips = event.target.checked ? [...learning.cantrips, spell.id] : learning.cantrips.filter((id) => id !== spell.id);
    update();
  })));
  button.addEventListener("click", async () => {
    if (isBusy(button)) return;
    setBusy(button, "Learning…");
    try {
      library = await request("/api/5e/characters/learn-cantrips", { revision: library.revision, characterId: entry.sheet.id, cantrips: learning.cantrips });
      learning = undefined;
      clearBusy(button);
      openSheet(entry.sheet.id);
      feedback(entry.sheet.name + " learned " + (owed === 1 ? "a new cantrip." : owed + " new cantrips."));
    } catch (error) {
      clearBusy(button);
      element("learn-error").textContent = error.message;
      update();
    }
  });
  group.append(fields, error);
  const controls = make("div", undefined, "controls");
  controls.append(button);
  update();
  return [heading, group, controls];
}

// The prepared spells being chosen on a sheet (#339), by character.
let preparing;

/**
 * Preparing spells (#339, D8): between adventures a tick for each levelled
 * spell on the class's list and Prepare spells; on an adventure, why not.
 */
function prepareNodes(entry) {
  if (!entry.spells || entry.defeated) return [];
  const heading = make("h3", "Prepare spells");
  heading.id = "prepare-title";
  if (entry.session) return [heading, make("p", "Prepared spells change only between adventures. Finish or abandon the adventure first.", "hint")];
  // A draft starts again when the sheet's own choice changed under it: a
  // new level (#341) may have freed spells now always prepared.
  const base = entry.sheet.spells.prepared.join(",");
  if (!preparing || preparing.characterId !== entry.sheet.id || preparing.base !== base) preparing = { characterId: entry.sheet.id, base, prepared: entry.sheet.spells.prepared.slice() };
  // The level's count (#341): a new level may leave some to choose.
  const limit = entry.spells.limit;
  const group = make("fieldset");
  group.id = "prepare-spells";
  // A Wizard prepares from its spellbook (#340).
  group.append(make("legend", "Choose " + limit + " spells to prepare" + (entry.spells.spellbook ? " from your spellbook" : "")));
  if (entry.spells.owed) {
    const owed = make("p", "Level " + entry.sheet.level + " lets you prepare " + entry.spells.owed + " more: choose " + (entry.spells.owed === 1 ? "it" : "them") + " before the next adventure.", "hint level-choice-notice");
    owed.id = "prepare-owed";
    group.append(owed);
  }
  const fields = make("div", undefined, "checks");
  const button = make("button", "Prepare spells", "secondary");
  button.type = "button";
  button.id = "save-prepared";
  const count = make("p", "", "hint");
  count.setAttribute("role", "status");
  const error = make("p", "", "error");
  error.id = "prepare-error";
  error.setAttribute("role", "alert");
  const update = () => {
    for (const box of fields.querySelectorAll("input")) box.disabled = !box.checked && preparing.prepared.length >= limit;
    count.textContent = preparing.prepared.length + " of " + limit + " chosen";
    const same = preparing.prepared.length === limit && preparing.prepared.every((id) => entry.sheet.spells.prepared.includes(id));
    button.disabled = isBusy(button) || preparing.prepared.length !== limit || same;
  };
  fields.append(...entry.spells.preparable.map((spell) => spellBox("prepared-" + spell.id, spell, preparing.prepared.includes(spell.id), (event) => {
    preparing.prepared = event.target.checked ? [...preparing.prepared, spell.id] : preparing.prepared.filter((id) => id !== spell.id);
    update();
  })));
  button.addEventListener("click", async () => {
    if (isBusy(button)) return;
    setBusy(button, "Preparing…");
    try {
      library = await request("/api/5e/characters/prepare-spells", { revision: library.revision, characterId: entry.sheet.id, prepared: preparing.prepared });
      preparing = undefined;
      clearBusy(button);
      openSheet(entry.sheet.id);
      feedback(entry.sheet.name + "'s prepared spells are changed.");
    } catch (error) {
      clearBusy(button);
      element("prepare-error").textContent = error.message;
      update();
    }
  });
  group.append(fields, count, error);
  const controls = make("div", undefined, "controls");
  controls.append(button);
  update();
  return [heading, group, controls];
}

/** "Fighting Style: Defense [Applies] Applies: you wear armour." for the sheet (#144). */
function styleUseNode(use) {
  const node = make("p", "Fighting Style: " + use.name + " ", "style-use-line");
  node.id = "sheet-style-use";
  node.append(make("span", use.applies ? "Applies" : "No effect", "tag style-use " + (use.applies ? "applies" : "no-effect")), " " + use.note);
  return node;
}

const findEntry = (id) => library.characters.find(({ sheet }) => sheet.id === id);

function openSheet(id) {
  const entry = findEntry(id);
  if (!entry) return;
  const { sheet, profile, purse, stowed, ammunition, carrying, treasure } = entry;
  shownSheetId = sheet.id;
  element("sheet-name").textContent = sheet.name;
  const summary = make("p", "Level " + sheet.level + " " + entry.className + " · " + sheet.xp + " XP" + (profile.nextLevelXp === undefined ? "" : " (level " + (sheet.level + 1) + " at " + profile.nextLevelXp + ")") + " · " + profile.equipment.map(({ name }) => name).join(", ") + (stowed.length ? " · Carried: " + stowed.join(", ") : "") + (ammunition.length ? " · Ammunition: " + ammunition.join(", ") : ""), "hint");
  const rolls = make("p", "Rolled: " + library.abilities.map((ability) => titleCase(ability) + " " + sheet.abilityRolls[ability].join(", ")).join("; ") + ". Background: " + Object.entries(sheet.backgroundIncrease).map(([ability, amount]) => "+" + amount + " " + titleCase(ability)).join(", ") + "." + (sheet.abilityScoreImprovements.length ? " Ability Score Improvement: " + sheet.abilityScoreImprovements.map(increaseText).join("; ") + "." : ""), "hint");
  renderLevelChoice(entry);
  element("sheet-body").replaceChildren(summary, ...(profile.fightingStyle ? [styleUseNode(profile.fightingStyle)] : []), ...profileNodes(sheet.abilities, profile, sheet.hp, carrying), ...learnNodes(entry), ...prepareNodes(entry), ...treasureNodes(treasure), ...purseNodes(sheet.purse, purse), rolls);
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
  entry.append(make("strong", item.name + " (" + item.value + "). "), document.createTextNode(item.description));
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
  if (entry.levelChoice) {
    choices.replaceChildren(make("p", "Choose " + entry.sheet.name + "'s level " + entry.levelChoice.levelUp.to + " " + choiceWords(entry.levelChoice.levelUp) + " above before starting another adventure.", "hint level-choice-notice"));
    return;
  }
  // A new level's cantrips (#342) and spells (#341) are chosen first.
  if (entry.spells && (entry.spells.owed || entry.spells.cantripsOwed) && !entry.session) {
    const learn = entry.spells.cantripsOwed ? ["learn " + entry.spells.cantripsOwed + " more " + (entry.spells.cantripsOwed === 1 ? "cantrip" : "cantrips")] : [];
    const prepare = entry.spells.owed ? ["prepare " + entry.spells.owed + " more " + (entry.spells.owed === 1 ? "spell" : "spells")] : [];
    const words = [...learn, ...prepare].join(" and ");
    choices.replaceChildren(make("p", words[0].toUpperCase() + words.slice(1) + " above before starting another adventure.", "hint level-choice-notice"));
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
// The equipped item whose sale is asking for confirmation, if any (#210).
let confirmingSale = null;
// The Cunning Strike effect chosen for the next attack (#308), or "".
let cunningStrike = "";
// How many hit dice the next short rest spends (#334), or null for the most.
let restDice = null;
// The spell and slot level chosen to cast (#337), as "spell:slot", and its
// target's id; "" until chosen.
let castChoice = "";
let castTarget = "";
// An area spell's chosen targets (#338), in the order ticked, and the
// spell they were chosen for.
let castTargets = [];
let castTargetsOf = "";

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
    confirmingSale = null;
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
  // Coin found may have been spent; the purse is what is kept.
  if (rewards.purse) {
    const purse = make("p", (rewards.coin ? "Coin found: " + rewards.coin + ". " : "") + "Purse: " + rewards.purse + ".");
    purse.id = "ending-coin";
    nodes.push(purse);
  }
  nodes.push(make("p", name + " has " + rewards.totalXp + " XP. A rest before the next adventure restores every hit point and feature use."));
  const up = rewards.levelUp;
  if (up) {
    const card = make("section", undefined, "level-up");
    card.id = "level-up";
    const heading = make("h4", "Level up: " + name + " is now level " + up.to);
    heading.id = "level-up-title";
    card.setAttribute("aria-labelledby", heading.id);
    const wind = !up.secondWind || up.secondWind.before.uses === up.secondWind.after.uses ? "" : " Second Wind uses " + up.secondWind.before.uses + " → " + up.secondWind.after.uses + ".";
    const sneak = up.sneakAttack ? " Sneak Attack " + up.sneakAttack.before + "d6 → " + up.sneakAttack.after + "d6." : "";
    // A level with no new feature names none.
    const gains = make("p", "Hit points " + up.maxHp.before + " → " + up.maxHp.after + "." + wind + sneak + (up.features.length ? " New features:" : ""));
    card.append(heading, gains);
    // #319: each name opens to the sheet's text, so the dock stays short until asked.
    if (up.features.length) {
      const features = make("ul");
      features.id = "level-up-features";
      features.setAttribute("aria-label", "New features");
      features.append(...up.features.map((feature) => {
        const disclosure = make("details");
        disclosure.append(make("summary", feature.name), make("p", feature.text));
        const item = make("li");
        item.append(disclosure);
        return item;
      }));
      card.append(features);
    }
    // A caster's spells (#341): its slots, the spells now always prepared,
    // the new slot level's spells (each opening to what it does) and the
    // spells to prepare on the sheet before the next adventure.
    if (up.spells) card.append(...levelUpSpellNodes(up.spells, name));
    // Level 4 (#286): the choices wait on the sheet, and block the next adventure.
    if (up.choices.length) {
      const owed = make("p", "Choose " + (up.choices.includes("weapon-mastery") ? "an Ability Score Improvement and a fourth weapon mastery" : "an Ability Score Improvement") + " on " + name + "'s sheet before the next adventure.");
      owed.id = "level-up-choices";
      card.append(owed);
    }
    nodes.push(card);
  }
  return nodes;
}

/** "4 1st-level, 2 2nd-level": spell slots in words (#341). */
const slotWords = (slots) => slots.map((count, index) => count + " " + ORDINALS[index + 1] + "-level").join(", ");

/** The level-up card's spell lines (#341), from the server's level-up view. */
function levelUpSpellNodes(spells, name) {
  const nodes = [];
  // A new cantrip (#342) shows beside the prepared count.
  const cantrips = spells.cantrips.after > spells.cantrips.before ? " Cantrips: " + spells.cantrips.before + " → " + spells.cantrips.after + "." : "";
  const slots = make("p", "Spell slots: " + slotWords(spells.slots.before) + " → " + slotWords(spells.slots.after) + ". Prepared spells: " + spells.prepared.before + " → " + spells.prepared.after + "." + cantrips);
  slots.id = "level-up-slots";
  nodes.push(slots);
  const list = (title, id, ids) => {
    const heading = make("p", title);
    const items = make("ul");
    items.id = id;
    items.setAttribute("aria-label", title.replace(/:$/u, ""));
    items.append(...ids.map((spellId) => {
      const spell = spellInfo(spellId);
      const disclosure = make("details");
      disclosure.append(make("summary", spell.name), make("p", spell.summary + "."));
      const item = make("li");
      item.append(disclosure);
      return item;
    }));
    return [heading, items];
  };
  if (spells.alwaysPrepared.length) nodes.push(...list("Always prepared, beside the spells you choose:", "level-up-always", spells.alwaysPrepared));
  if (spells.newSpells.length) nodes.push(...list("New spells you may prepare:", "level-up-spells", spells.newSpells));
  if (spells.cantripsOwed) {
    const learn = make("p", "Learn " + spells.cantripsOwed + " more " + (spells.cantripsOwed === 1 ? "cantrip" : "cantrips") + " on " + name + "'s sheet before the next adventure.");
    learn.id = "level-up-learn";
    nodes.push(learn);
  }
  if (spells.owed) {
    const owed = make("p", "Prepare " + spells.owed + " more " + (spells.owed === 1 ? "spell" : "spells") + " on " + name + "'s sheet before the next adventure.");
    owed.id = "level-up-prepare";
    nodes.push(owed);
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
  // A hit waiting for Uncanny Dodge (#308) says so.
  element("turn").textContent = !encounter ? "" : current ? "Round " + encounter.round + ": " + (current.id === encounter.playerId ? "your turn." : encounter.pendingReaction ? encounter.pendingReaction.attacker + " hits you." : current.name + "'s turn.") : "The fight is over.";
  // The character's conditions in the fight (#232), each a tag with its
  // source and how it ends for screen readers.
  const self = encounter && encounter.combatants.find(({ id }) => id === encounter.playerId);
  element("conditions").replaceChildren(...(self ? self.conditions : []).map((condition) => {
    const item = make("li");
    item.dataset.condition = condition.kind;
    item.append(conditionTag(condition));
    return item;
  }));
  // The character's ongoing spell effects (#337): the spell, whether it
  // holds concentration, and when it ends; what it does for screen readers.
  element("effects").replaceChildren(...session.effects.map((effect) => {
    const item = make("li");
    item.dataset.effect = effect.spellId;
    const tag = make("span", effect.spell, "tag effect");
    tag.append(spoken(": " + effect.text));
    item.append(tag, make("span", (effect.concentration ? "concentration, " : "") + effect.until, "effect-until"));
    return item;
  }));
  const items = [];
  if (turn) {
    // Extra Attack (#287): the Attack action under way still has an attack.
    const pending = turn.attacks > 0 ? "; second attack to make" : "";
    const actions = (turn.actions === 0 ? "used" : turn.maxActions === 1 ? "available" : turn.actions + " of " + turn.maxActions + " left") + pending;
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
  // The hit-dice pool (#333), outside a fight's turns: they can't be spent
  // in a fight, and the strip there holds the turn's resources.
  if (!turn) {
    const { available, total, sides } = session.hitDice;
    items.push(resource("hit-dice", "Hit dice", available, total, "Hit dice: " + available + " of " + total + " d" + sides + " left"));
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
// An authored check's failure or success by 5 or more (#281), shortened for
// the compact line; the engine text names it in full.
const BAND_TAGS = { "failure-by-5": "Failure by 5+", "success-by-5": "Success by 5+" };
// A reaction roll's band (#304).
const REACTION_TAGS = { hostile: "Hostile", unfriendly: "Unfriendly", uncertain: "Uncertain", indifferent: "Indifferent", friendly: "Friendly" };
const ADJUSTMENTS = ${JSON.stringify(DAMAGE_ADJUSTMENT_TEXT)};
const withSign = (value) => (value >= 0 ? " + " : " − ") + Math.abs(value);

/**
 * A roll's dice as chips, an unkept d20 struck through and a Great Weapon
 * Fighting 1 or 2 shown as rolled and counted ("d10 2→3"); with sides false,
 * just each value.
 */
const diceChips = (group, separator, sides = true) =>
  group.dice.flatMap((die, index) => [
    ...(index > 0 ? [separator] : []),
    make("span", (sides ? "d" + die.sides + " " : "") + die.value + (die.countsAs ? "→" + die.countsAs : ""), "roll-die" + (die.dropped ? " dropped" : "") + (die.countsAs ? " counted" : "")),
  ]);

/**
 * Damage or healing: the total in bold, its dice, and the HP after, such as
 * "7 slashing (d6 4 + 3) → 0/7 HP" or, against a vulnerability (#233),
 * "14 bludgeoning (d6 4 + 3, doubled (vulnerable)) → 0/13 HP".
 */
const hpChange = (group, label) => [
  make("strong", group.total),
  label + " (",
  ...diceChips(group, " + "),
  // A hit's weapon damage before a rider's extra damage (#232) leaves the HP to the rider's.
  (group.modifier === 0 ? "" : withSign(group.modifier)) + (group.halved ? ", halved" : "") + (group.adjustment ? ", " + ADJUSTMENTS[group.adjustment] : "") + ")" + (group.hpAfter === undefined ? "" : " → " + group.hpAfter + "/" + group.maxHp + " HP"),
];

/** One compact roll, such as "d20 12 + 5 = 17 vs AC 15" or "7 slashing (d6 4 + 3) → 0/7 HP". */
function compactRoll(group) {
  const node = make("span", undefined, "roll " + group.purpose);
  switch (group.purpose) {
    case "initiative":
      // Initiative is always a d20, so its chip shows just the value; with
      // "d20" the line can be wider than its engine text (#196).
      node.append(group.roller + " " + (group.mode ? group.mode + " " : ""), ...diceChips(group, ", ", false), withSign(group.modifier) + " = " + group.total + (group.rollOff ? " (roll-off " + group.rollOff.join(", ") + ")" : ""));
      break;
    case "target":
      node.append("target die ", ...diceChips(group));
      break;
    case "weapon":
      // Multiattack's choice of attack (#235).
      node.append("attack die ", ...diceChips(group));
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
    case "reaction":
      // 2d6 + the Charisma modifier (#304).
      node.append(...diceChips(group, ", "), withSign(group.modifier) + " Cha = " + group.total);
      break;
    case "reduction":
      // Resistance's die off damage (#339).
      node.append(group.roller + " ", ...diceChips(group), " off");
      break;
    case "wandering":
      // A rest's d100 against the wandering encounter's chance (#335).
      node.append(...diceChips(group), " vs " + group.dc + " or less");
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
    // A check or saving throw (#132): its label, outcome (or band, #281) and roll against the DC.
    const check = line.rolls[0];
    node.append(make("span", check.roller, "who"), " ", make("span", check.label, "roll-label"), " ", make("span", check.band ? BAND_TAGS[check.band] : OUTCOME_TAGS[check.outcome], "tag " + check.outcome), " ", compactRoll(check));
  } else if (line.rolls[0].purpose === "reaction") {
    // A reaction roll (#304): its band and the dice with the Charisma modifier.
    const reaction = line.rolls[0];
    node.append(make("span", reaction.roller, "who"), " ", make("span", reaction.label, "roll-label"), " ", make("span", REACTION_TAGS[reaction.reaction], "tag reaction " + reaction.reaction), " ", compactRoll(reaction));
  } else if (line.rolls[0].purpose === "wandering") {
    // A rest's d100 (#335): whether the wandering encounter came.
    const watch = line.rolls[0];
    node.append(make("span", watch.label, "roll-label"), " ", make("span", watch.outcome === "success" ? "Interrupted" : "Undisturbed", "tag " + watch.outcome), " ", compactRoll(watch));
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
// weapons in hand, then its stowed gear, each kind once with a count, then
// its arrows and bolts (#230). Each entry's slot says which verbs go on it:
// Unequip on what is equipped, Wield, Equip and Drop on what is stowed, and
// Sell on ammunition.
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
    ...gear.ammunition.map(({ id, name, count }) => ({ id, slot: "stowed", name: name + " (" + count + ")", description: "Ammunition: each shot spends one." })),
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
      // A gem or art object shows its value (#239).
      text.append(make("strong", entry.name + (entry.value ? " (" + entry.value + ")" : "")), document.createTextNode(" — " + entry.description));
      item.append(text);
      if (entry.discovery) item.append(make("p", "You found: " + entry.discovery, "discovery"));
      // An exit's door and found trap (#132), a way a check opened or closed
      // (#282), and what each topic drew from a creature.
      if (entry.route) item.append(make("p", entry.route === "closed" ? "The way is closed." : "A way you found.", "route"));
      if (entry.door) item.append(make("p", entry.door.name + ": " + (entry.door.open ? "open" : "shut") + ". " + entry.door.description, "door"));
      if (entry.trap) item.append(make("p", entry.trap.name + ": " + TRAP_STATES[entry.trap.state] + ". " + entry.trap.description, "trap"));
      for (const topic of entry.topics || []) {
        if (topic.said) item.append(make("p", "About " + topic.name + ": " + topic.said, "discovery"));
      }
      // A merchant's wares, each with its price and its Buy (#210).
      if (entry.wares) {
        item.append(make("p", "Each trade takes " + entry.tradeMinutes + (entry.tradeMinutes === 1 ? " minute." : " minutes."), "trade"));
        const wares = make("ul", undefined, "wares");
        wares.setAttribute("aria-label", entry.name + "'s wares");
        wares.append(...entry.wares.map((ware) => {
          const line = make("li");
          line.dataset.ware = ware.id;
          const text = make("p");
          text.append(make("strong", ware.name), document.createTextNode(" — " + ware.price));
          line.append(text, make("div", undefined, "controls"));
          return line;
        }));
        item.append(wares);
        if (entry.salePrices.length) item.append(make("p", "Pays half price: " + entry.salePrices.map(({ name, price }) => name + " " + price).join(", ") + ".", "trade"));
        item.append(make("p", "Pays full value for gems and art objects.", "trade"));
      }
      return item;
    }));
  }
  // The purse shows with what the character carries, once it holds coin.
  element("purse").textContent = room.purse ? "Purse: " + room.purse : "";
  element("purse").hidden = !room.purse;
  if (room.purse) element("inventory-group").hidden = false;
  element("carrying").textContent = "Carrying " + room.carrying.weight + " lb of the " + room.carrying.capacity + " lb your Strength allows.";
  element("room-empty").hidden = room.exits.length + room.features.length + room.creatures.length + room.items.length > 0;
  disclose("room", fighting);
}

// The character's AC and attacks from its gear as it stands (#209), in the
// status strip so a swap in a fight shows at once. Stowed gear is listed
// with what the character carries. The arrows and bolts held follow (#230),
// and a ranged weapon's own kind shows even when none are left.
function renderGear(gear) {
  const worn = gear.worn.map(({ name }) => name.toLowerCase()).join(", ");
  const shooting = gear.attack.ammunition;
  const ammunition = [...(shooting && !gear.ammunition.some(({ id }) => id === shooting) ? [{ id: shooting, count: 0 }] : []), ...gear.ammunition];
  element("gear-numbers").textContent = "AC " + gear.armorClass + (worn ? " (" + worn + ")" : "") + " · " + gear.attack.weapon + " " + attackText(gear.attack) + (gear.attack.grip === "two-handed" ? ", two-handed" : "") + (gear.lightAttack ? "; " + gear.lightAttack.weapon + " " + attackText(gear.lightAttack) + " as an extra attack" : "") + (ammunition.length ? "; " + ammunition.map(ammunitionText).join(", ") : "") + (gear.strengthShortfall ? "; speed −10 ft (Strength below " + gear.strengthShortfall.strength + ")" : "") + untrainedText(gear) + ".";
}

// A surprised combatant (#301), or one in armour it isn't trained with,
// rolled two d20s and kept the lower.
// Initiative's advantage (#315) and disadvantage (#301) name their sources; together they cancel.
const initiativeMode = ({ d20s, advantage, disadvantage }) =>
  advantage.length && disadvantage.length
    ? "(" + advantage.join(", ") + ": advantage, and " + disadvantage.join(", ") + ": disadvantage, cancel) "
    : d20s.join(" and ") + " (" + (advantage.length ? advantage.join(", ") + ": advantage" : disadvantage.join(", ") + ": disadvantage") + "), kept ";
const rollText = (roll) => "d20 " + (roll.mode ? initiativeMode(roll.mode) : "") + roll.d20 + withSign(roll.bonus) + " = " + roll.total + (roll.tieBreaks.length ? ", roll-off " + roll.tieBreaks.join(", ") : "");
/** A condition (#232) as a tag, such as "Prone", with its source and how it ends spoken. */
const conditionTag = (condition) => {
  const tag = make("span", condition.name, "tag condition");
  tag.dataset.condition = condition.kind;
  tag.append(spoken(": " + condition.text));
  return tag;
};
const combatantName = (encounter, combatant) => combatant.name + (combatant.id === encounter.playerId ? " (you)" : "");

// The initiative table shows each total; the current turn's row is
// highlighted and its name tagged. The rolls behind the totals are on demand.
const MORALE_TAGS = { fleeing: "Fleeing", fled: "Fled", surrendering: "Surrendering", surrendered: "Surrendered" };
function renderInitiative(encounter, fighting) {
  element("initiative-rows").replaceChildren(...encounter.combatants.map((combatant) => {
    const current = combatant.id === encounter.currentTurn;
    const row = make("tr", undefined, (current ? "current" : "") + (combatant.defeated || combatant.morale === "fled" || combatant.morale === "surrendered" ? " defeated" : ""));
    row.dataset.combatant = combatant.id;
    if (current) row.setAttribute("aria-current", "true");
    const name = make("th", combatantName(encounter, combatant) + (combatant.sapped ? " (sapped)" : "") + (combatant.hidden ? " (hidden)" : ""));
    name.scope = "row";
    for (const condition of combatant.conditions) name.append(" ", conditionTag(condition));
    if (current) name.append(" ", make("span", "Now", "tag now"));
    if (combatant.defeated) name.append(" ", make("span", "Defeated", "tag"));
    if (combatant.initiative.mode?.disadvantage.includes("surprised")) name.append(" ", make("span", "Surprised", "tag surprised"));
    // Morale (#237): a fleeing opponent leaves on its turn; a fled one is gone.
    // One that may surrender (#238) yields on its turn instead.
    if (combatant.morale) name.append(" ", make("span", MORALE_TAGS[combatant.morale], "tag morale"));
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
  sneak: { label: "Sneak into ", short: "Sneak", busy: "Sneaking into ", busyLabel: "Sneaking…" },
  ambush: { label: "Ambush in ", short: "Ambush", busy: "Ambushing in ", busyLabel: "Ambushing…" },
  // A reaction's option (#304) is named in full by its target: "Attack", "Pass peacefully".
  react: { label: "", busy: "", busyLabel: "Answering…" },
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
  buy: { label: "Buy ", short: "Buy", busy: "Buying ", busyLabel: "Buying…" },
  sell: { label: "Sell ", short: "Sell", busy: "Selling ", busyLabel: "Selling…" },
  "sell-equipped": { label: "Sell ", short: "Sell", busy: "Selling ", busyLabel: "Selling…" },
  "sell-treasure": { label: "Sell ", short: "Sell", busy: "Selling ", busyLabel: "Selling…" },
  "second-wind": { label: "Second Wind", busy: "Using Second Wind", busyLabel: "Using Second Wind…" },
  "action-surge": { label: "Action Surge", busy: "Using Action Surge", busyLabel: "Using Action Surge…" },
  hide: { label: "Hide", busy: "Hiding", busyLabel: "Hiding…" },
  "steady-aim": { label: "Steady Aim", busy: "Steadying your aim", busyLabel: "Aiming…" },
  // Channel Divinity (#341): Divine Spark is chosen with its target and
  // mode beside the button; Spiritual Weapon's attack names its target.
  "divine-spark": { label: "Divine Spark", busy: "Using Divine Spark", busyLabel: "Channelling…" },
  "turn-undead": { label: "Turn Undead", busy: "Turning undead", busyLabel: "Turning…" },
  "preserve-life": { label: "Preserve Life", busy: "Using Preserve Life", busyLabel: "Healing…" },
  "spectral-attack": { label: "Spiritual Weapon: ", busy: "Striking with your spiritual weapon at ", busyLabel: "Striking…" },
  // The answers to a hit Uncanny Dodge could halve (#308).
  "uncanny-dodge": { label: "Uncanny Dodge", busy: "Using Uncanny Dodge", busyLabel: "Dodging…" },
  "take-hit": { label: "Take the hit", busy: "Taking the hit", busyLabel: "Taking…" },
  // A spell (#337), chosen with its slot level and target beside the button.
  cast: { label: "Cast", busy: "Casting", busyLabel: "Casting…" },
  "end-turn": { label: "End turn", busy: "Ending turn", busyLabel: "Ending" },
  // On the check just failed (#315): a use of Second Wind adds 1d10.
  "tactical-mind": { label: "Tactical Mind: add 1d10", busy: "Using Tactical Mind", busyLabel: "Adding…" },
  // A short rest (#334), in the room panel with its choice of hit dice.
  rest: { label: "Rest", busy: "Resting", busyLabel: "Resting…" },
  // A long rest at a rest site (#335), in the room panel.
  "long-rest": { label: "Long rest", busy: "Taking a long rest", busyLabel: "Resting…" },
  leave: { label: "Leave the adventure", busy: "Leaving the adventure", busyLabel: "Leaving…" },
};
// Paralysed (#234), the character's only action is ending its turn: waiting.
const WAIT = { label: "Wait", busy: "Waiting", busyLabel: "Waiting…" };
const paralysed = () => {
  const encounter = session.encounter;
  const self = encounter && encounter.combatants.find(({ id }) => id === encounter.playerId);
  return Boolean(self && self.conditions.some(({ kind }) => kind === "paralysed"));
};
const wordsOf = (action) => action === "end-turn" && paralysed() ? WAIT : ACTIONS[action];
// Leave names the adventure, not the room it is taken from.
const named = (action, target) => target && action !== "leave" ? target.name : "";
const busyName = ({ action, target }) => wordsOf(action).busy + named(action, target) + "…";
const FIGHT_FEATURES = ["second-wind", "action-surge", "hide", "steady-aim", "turn-undead", "preserve-life", "end-turn", "uncanny-dodge", "take-hit"];
const GEAR = ["equip", "unequip", "swap", "drop"];
// The "You carry" slot each verb on the character's gear goes on.
const EQUIPPED_VERBS = ["unequip", "sell-equipped"];
const GEAR_SALES = ["sell", "sell-equipped"];
// Selling a gem or art object (#239): its entry has no slot, as only gear is
// equipped or stowed.
const SALES = [...GEAR_SALES, "sell-treasure"];
const EXPLORING = ["ambush", "move", "sneak", "examine", "take", "force", "pick", "break", "unlock", "search", "disarm", "talk"];

function renderActions() {
  // The ending (#158) takes the bar's place; an ended adventure projects no actions.
  element("action-bar").hidden = session.status !== "playing";
  const { encounter, features } = session;
  const fighting = Boolean(encounter && encounter.currentTurn !== null);
  const attacks = session.actions.filter(({ action, cunningStrike: effect }) => action === "attack" && !effect).length;
  const ATTACKS = ["attack", "light-attack"];
  const left = (feature) => " (" + feature.uses + " of " + feature.max + " left)";
  const groups = { attack: [], feature: [], explore: [], leave: [], carried: [], wares: [] };
  const carried = new Set(session.room.inventory.map(({ id }) => id));
  // Cunning Strike (#308): the effects the engine offers with some attack
  // go in one choice beside the turn's features, not on buttons of their
  // own; an attack that can't take the chosen one is disabled.
  const strikes = session.actions.filter((option) => option.cunningStrike);
  const effects = [...new Map(strikes.map(({ cunningStrike: effect }) => [effect.id, effect])).values()];
  if (!effects.some(({ id }) => id === cunningStrike)) cunningStrike = "";
  if (effects.length) groups.feature.push(strikeChoice(effects));
  const struck = (action, target) => strikes.some((option) => option.action === action && option.target.id === target.id && option.cunningStrike.id === cunningStrike);
  renderRest(session.actions.find(({ action }) => action === "rest"), fighting);
  renderLongRest(session.actions.find(({ action }) => action === "long-rest"));
  // Spells (#337) go in one choice of spell and target, with Cast.
  const casts = session.actions.filter(({ action }) => action === "cast");
  if (casts.length) groups.feature.push(castPanel(casts));
  // Divine Spark (#341): one choice of target and mode, with its button.
  const sparks = session.actions.filter(({ action }) => action === "divine-spark");
  if (sparks.length) groups.feature.push(sparkPanel(sparks));
  session.actions.forEach((option, index) => {
    const { action, target } = option;
    if (option.cunningStrike || action === "rest" || action === "long-rest" || action === "cast" || action === "divine-spark") return;
    const exploring = EXPLORING.includes(action) || (action === "use" && !fighting);
    // Gear changes go on the gear's entry in "You carry" (#209), or in a
    // fight with the turn's other options, as Drink does.
    // Trades go on the merchant's wares and on "You carry" (#210).
    const group = ATTACKS.includes(action) || action === "spectral-attack" ? "attack" : action === "leave" ? "leave" : action === "buy" ? "wares" : SALES.includes(action) ? "carried" : GEAR.includes(action) ? (fighting ? "feature" : "carried") : exploring && carried.has(target.id) ? "carried" : exploring ? "explore" : "feature";
    const words = wordsOf(action);
    // A check with several approaches (#283) offers one button per skill;
    // a parley (#305) names its DC too.
    const dc = option.approach && option.approach.dc !== undefined ? " DC " + option.approach.dc : "";
    const way = option.approach ? " with " + option.approach.name + dc : "";
    // Another try the module offers (#284) says so, and why, under it.
    const again = option.retry ? "Try again: " : "";
    // Extra Attack's second attack (#287) says so; any opponent may take it.
    const second = action === "attack" && session.turn && session.turn.attacks > 0;
    const label = again + (second ? "Second attack on " : words.label) + named(action, target) + way + (action === "second-wind" ? left(features.secondWind) : action === "action-surge" ? left(features.actionSurge) : (action === "turn-undead" || action === "preserve-life") && session.channelDivinity ? left(session.channelDivinity) : action === "tactical-mind" ? " (" + features.secondWind.uses + " of " + features.secondWind.max + " Second Wind left)" : "");
    const short = group === "explore" || group === "carried" || group === "wares";
    const button = make("button");
    // A parley's button keeps the verb; its skill and DC go under it (#305).
    const parley = action === "react" && option.approach;
    button.append(make("span", option.retry ? (short ? "Try again" : label) : short ? ACTIONS[action].short : parley ? target.name : label));
    button.dataset.busyLabel = words.busyLabel;
    button.type = "button";
    if (short || parley) button.setAttribute("aria-label", label);
    // One opponent makes attacking the fight's primary action; several are peers.
    button.className = action === "attack" ? "attack " + (attacks === 1 ? "primary" : "secondary") : action === "light-attack" || action === "spectral-attack" ? "attack secondary" : action === "end-turn" ? "secondary" : group + " secondary";
    // "act" marks an action control, in the bar or on a carried item.
    button.classList.add("act");
    button.dataset.action = action;
    if (target) button.dataset.target = target.id;
    if (option.approach) button.dataset.approach = option.approach.id;
    if (option.retry) button.dataset.retry = "true";
    // An attack the chosen Cunning Strike can't go with (#308).
    const unstruck = cunningStrike && ATTACKS.includes(action) && option.available && !struck(action, target);
    button.disabled = acting || !option.available || unstruck;
    button.addEventListener("click", () => action === "leave" ? openLeave() : action === "sell-equipped" ? openSale(option) : perform(ATTACKS.includes(action) && cunningStrike ? { ...option, cunningStrike } : option));
    const wrap = make("span", undefined, "action");
    wrap.append(button);
    // The approach's skill, under its button (the button keeps the verb).
    if (option.approach) wrap.append(unspoken(make("span", option.approach.name + dc, "approach")));
    // Why another try is offered: its cost, or what changed (#284).
    if (option.retry) {
      const why = make("span", option.retry.reason.charAt(0).toUpperCase() + option.retry.reason.slice(1), "retry");
      why.id = "action-retry-" + index;
      button.setAttribute("aria-describedby", why.id);
      wrap.append(why);
    }
    // Waiting says why it is all the character can do.
    const why = !option.available ? option.reason : unstruck ? "Not with " + effects.find(({ id }) => id === cunningStrike).name : words === WAIT ? "You are paralysed, so you can only wait." : "";
    if (why) {
      const reason = make("span", why, "reason");
      reason.id = "action-reason-" + index;
      button.setAttribute("aria-describedby", reason.id);
      wrap.append(reason);
    }
    if (group === "carried" || group === "wares") {
      wrap.dataset.target = target.id;
      if (GEAR.includes(action) || GEAR_SALES.includes(action)) wrap.dataset.slot = EQUIPPED_VERBS.includes(action) ? "equipped" : "stowed";
      groups[group].push(wrap);
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
  // An equipped item's sale asks there first, in place of its verbs (#210).
  const selling = confirmingSale && session.actions.find(({ action, target }) => action === "sell-equipped" && target.id === confirmingSale);
  if (!selling) confirmingSale = null;
  for (const entry of element("inventory").children) {
    const verbs = groups.carried.filter((wrap) => wrap.dataset.target === entry.dataset.id && wrap.dataset.slot === entry.dataset.slot);
    const controls = entry.querySelector(".controls") || entry.appendChild(make("div", undefined, "controls"));
    const asking = selling && entry.dataset.id === confirmingSale && entry.dataset.slot === "equipped";
    controls.replaceChildren(...(asking ? [saleQuestion(selling.target)] : verbs));
    controls.hidden = !asking && verbs.length === 0;
  }
  // Buy goes on each of the merchant's wares.
  for (const line of document.querySelectorAll("#creatures [data-ware]")) {
    line.querySelector(".controls").replaceChildren(...groups.wares.filter((wrap) => wrap.dataset.target === line.dataset.ware));
  }
  // While Leave asks for confirmation, the question stands in its place.
  const asking = confirmingLeave && groups.leave.length > 0;
  element("leave-controls").hidden = asking;
  element("leave-confirm").hidden = !asking;
  element("leave-question").textContent = "Leave " + session.adventure.title + "? This ends the adventure here. Any treasure or coin you carry out is yours to keep; you cannot come back to this adventure.";
  element("confirm-leave").disabled = acting;
  element("cancel-leave").disabled = acting;
}

// A short rest (#334) in the room panel while exploring: the short rests and
// hit dice left and, while a rest would restore something, how many hit dice
// to spend (the most the engine accepts unless the player chose fewer) and
// Rest, disabled with the engine's reason when it would refuse.
function renderRest(option, fighting) {
  element("rest-group").hidden = fighting || session.status !== "playing";
  const { left, max } = session.shortRests;
  const { available, total, sides } = session.hitDice;
  element("rest-summary").textContent = "Short rests: " + left + " of " + max + " left in this adventure. Hit dice: " + available + " of " + total + " d" + sides + " left; each heals its roll + your Constitution modifier, and you stop spending them at full HP.";
  if (!option) {
    element("rest-controls").replaceChildren();
    return;
  }
  const counts = option.available ? option.rest.hitDice : [];
  if (!counts.includes(restDice)) restDice = null;
  const chosen = restDice === null ? counts[counts.length - 1] : restDice;
  const controls = [];
  if (counts.length) {
    const label = make("label", "Hit dice to spend ");
    const select = make("select");
    select.id = "rest-dice";
    select.disabled = acting;
    for (const count of counts) {
      const choice = make("option", String(count));
      choice.value = String(count);
      choice.selected = count === chosen;
      select.append(choice);
    }
    select.addEventListener("change", () => {
      restDice = Number(select.value);
    });
    label.append(select);
    controls.push(label);
  }
  controls.push(restButton("rest", option, () => takeRest(Number(element("rest-dice").value))));
  element("rest-controls").replaceChildren(...controls);
}

// A rest's button (#334, #335): the action's label, disabled with the engine's
// reason beside it when it would refuse.
function restButton(action, option, onClick) {
  const wrap = make("span", undefined, "action");
  const button = make("button");
  button.append(make("span", ACTIONS[action].label));
  button.dataset.busyLabel = ACTIONS[action].busyLabel;
  button.type = "button";
  button.className = "secondary act";
  button.dataset.action = action;
  button.disabled = acting || !option.available;
  button.addEventListener("click", onClick);
  wrap.append(button);
  if (!option.available) {
    const reason = make("span", option.reason, "reason");
    reason.id = action + "-reason";
    button.setAttribute("aria-describedby", reason.id);
    wrap.append(reason);
  }
  return wrap;
}

// A long rest (#335) at a rest site: the long rests left and, while one
// would restore something, Long rest, disabled with the engine's reason when
// it would refuse (foes here, or the long rest already taken).
function renderLongRest(option) {
  element("long-rest").hidden = !session.room.restSite;
  const { left, max } = session.longRests;
  element("long-rest-summary").textContent = "This is a safe place to rest. Long rests: " + left + " of " + max + " left in this adventure; a long rest restores every hit point, hit die and feature use.";
  if (!option) {
    element("long-rest-controls").replaceChildren();
    return;
  }
  element("long-rest-controls").replaceChildren(restButton("long-rest", option, takeLongRest));
}

async function takeLongRest() {
  await act("/api/5e/session/long-rest", {}, "button.act[data-action=long-rest]", ACTIONS["long-rest"].busy + "…");
  keepFocus("long-rest", "");
}

async function takeRest(hitDice) {
  restDice = null;
  await act("/api/5e/session/rest", { hitDice }, "button.act[data-action=rest]", ACTIONS.rest.busy + "…");
  keepFocus("rest", "");
}

// The question an equipped item's Sell asks first, inside its entry (#210).
function saleQuestion(target) {
  const merchant = session.room.creatures.find(({ salePrices }) => salePrices);
  const price = merchant.salePrices.find(({ id }) => id === target.id).price;
  const held = session.room.gear.worn.some(({ id }) => id === target.id) ? "you are wearing" : "you are holding";
  const box = make("div", undefined, "confirm");
  box.id = "sale-confirm";
  const question = make("p", "Sell the " + target.name.toLowerCase() + " " + held + " to " + merchant.name + " for " + price + "?");
  question.id = "sale-question";
  const confirm = make("button", "Sell it", "primary danger");
  confirm.id = "confirm-sale";
  confirm.type = "button";
  confirm.disabled = acting;
  confirm.addEventListener("click", sellEquipped);
  const cancel = make("button", "Keep it", "secondary");
  cancel.id = "cancel-sale";
  cancel.type = "button";
  cancel.disabled = acting;
  cancel.addEventListener("click", cancelSale);
  const controls = make("div", undefined, "controls");
  controls.append(confirm, cancel);
  box.append(question, controls);
  return box;
}

function openSale(option) {
  confirmingSale = option.target.id;
  renderActions();
  element("confirm-sale").focus();
}

function cancelSale() {
  const itemId = confirmingSale;
  confirmingSale = null;
  renderActions();
  const sell = document.querySelector("button.act[data-action=sell-equipped][data-target=" + JSON.stringify(itemId) + "]");
  if (sell) sell.focus();
}

async function sellEquipped() {
  const option = session.actions.find(({ action, target }) => action === "sell-equipped" && target.id === confirmingSale);
  if (!option) return;
  const done = await act("/api/5e/session/explore", { action: "sell-equipped", target: option.target.id }, "#confirm-sale", "Selling…");
  // A failed request leaves the question open to try again.
  if (done) confirmingSale = null;
  renderActions();
  keepFocus("sell-equipped", option.target.id);
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

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th"];
// Resistance's damage type (#339) and Bestow Curse's curse (#342) are part
// of the choice.
const castKey = ({ spell }) => spell.id + ":" + (spell.slotLevel || "") + ":" + (spell.damageType || "") + ":" + (spell.curse || "");

/**
 * Casting (#337): a choice of spell, each at each slot level it may spend
 * (a cantrip spends none), and of its target, then Cast, disabled with the
 * engine's reason for that choice. An area spell (#338) offers a box for
 * each foe it may catch, the first ones ticked, up to its most. Exploring,
 * only spells cast outside a fight are offered; answering a hit, only
 * reaction spells.
 */
function castPanel(casts) {
  const spells = [...new Map(casts.map((option) => [castKey(option), option.spell])).entries()];
  // Keep the player's choice while it is offered; else the first that can
  // be cast now, or the first.
  const usable = casts.find(({ available }) => available) || casts[0];
  if (!spells.some(([key]) => key === castChoice)) castChoice = castKey(usable);
  const options = casts.filter((option) => castKey(option) === castChoice);
  const wrap = make("span", undefined, "action cast-choice");
  // An area spell has one entry, with the foes to choose among.
  const area = options[0].targets ? options[0] : null;
  if (area) {
    const most = area.spell.maxTargets;
    const ids = area.targets.map(({ id }) => id);
    // A newly chosen area spell starts with the first foes ticked.
    if (castTargetsOf !== castChoice) {
      castTargets = ids.slice(0, most);
      castTargetsOf = castChoice;
    }
    castTargets = castTargets.filter((id) => ids.includes(id)).slice(0, most);
  } else if (!options.some(({ target }) => target.id === castTarget)) castTarget = (options.find(({ available }) => available) || options[0]).target.id;
  const chosen = area || options.find(({ target }) => target.id === castTarget);
  const spellSelect = make("select");
  spellSelect.id = "cast-spell";
  spellSelect.setAttribute("aria-label", "Spell");
  spellSelect.disabled = acting;
  for (const [key, spell] of spells) {
    // Resistance's resisted type (#339); Chromatic Orb's dealt type (#340).
    const typed = !spell.damageType ? "" : spell.damageTypeUse === "dealt" ? " of " + spell.damageType : " against " + spell.damageType;
    // Bestow Curse's curse (#342).
    const cursed = spell.curseName ? ": " + spell.curseName : "";
    const choice = make("option", spell.name + typed + cursed + (spell.level === 0 ? " (cantrip)" : " (" + ORDINALS[spell.slotLevel] + "-level slot)"));
    choice.value = key;
    choice.selected = key === castChoice;
    spellSelect.append(choice);
  }
  spellSelect.addEventListener("change", () => {
    castChoice = spellSelect.value;
    renderActions();
    element("cast-spell").focus();
  });
  const button = make("button");
  button.append(make("span", ACTIONS.cast.label));
  button.dataset.busyLabel = ACTIONS.cast.busyLabel;
  button.type = "button";
  button.className = "secondary act";
  button.dataset.action = "cast";
  // An area spell needs at least one target ticked.
  const why = !chosen.available ? chosen.reason : area && !castTargets.length ? "Choose a target" : "";
  button.disabled = acting || Boolean(why);
  button.addEventListener("click", () => castSpell(chosen.spell, area ? castTargets : [chosen.target.id]));
  wrap.append(spellSelect, area ? areaTargets(area) : targetChoice(options), button);
  if (why) {
    const reason = make("span", why, "reason");
    reason.id = "cast-reason";
    button.setAttribute("aria-describedby", reason.id);
    wrap.append(reason);
  }
  return wrap;
}

// Divine Spark's choice (#341): kept while it is offered.
let sparkChoice = "";

/**
 * Divine Spark (#341): one choice of each target and what it does to it
 * ("Zombie: radiant"), and the button, with the uses of Channel Divinity
 * left; disabled with the engine's reason when it would refuse.
 */
function sparkPanel(sparks) {
  const key = ({ target, mode }) => target.id + ":" + mode;
  if (!sparks.some((option) => key(option) === sparkChoice)) sparkChoice = key(sparks.find(({ available }) => available) || sparks[0]);
  const chosen = sparks.find((option) => key(option) === sparkChoice);
  const wrap = make("span", undefined, "action cast-choice");
  const select = make("select");
  select.id = "spark-choice";
  select.setAttribute("aria-label", "Divine Spark's target");
  select.disabled = acting;
  for (const option of sparks) {
    const choice = make("option", option.target.name + ": " + (option.mode === "heal" ? "heal" : option.mode + " damage"));
    choice.value = key(option);
    choice.selected = key(option) === sparkChoice;
    select.append(choice);
  }
  select.addEventListener("change", () => {
    sparkChoice = select.value;
    renderActions();
    element("spark-choice").focus();
  });
  const button = make("button");
  const uses = session.channelDivinity;
  button.append(make("span", ACTIONS["divine-spark"].label + (uses ? " (" + uses.uses + " of " + uses.max + " left)" : "")));
  button.dataset.busyLabel = ACTIONS["divine-spark"].busyLabel;
  button.type = "button";
  button.className = "secondary act";
  button.dataset.action = "divine-spark";
  button.disabled = acting || !chosen.available;
  button.addEventListener("click", async () => {
    await act("/api/5e/session/divine-spark", { targetId: chosen.target.id, mode: chosen.mode }, "button.act[data-action=divine-spark]", ACTIONS["divine-spark"].busy + "…");
    keepFocus("divine-spark", "");
  });
  wrap.append(select, button);
  if (!chosen.available) {
    const reason = make("span", chosen.reason, "reason");
    reason.id = "spark-reason";
    button.setAttribute("aria-describedby", reason.id);
    wrap.append(reason);
  }
  return wrap;
}

// A spell's one target: a foe, or "Yourself" for a healing spell or buff.
function targetChoice(options) {
  const select = make("select");
  select.id = "cast-target";
  select.setAttribute("aria-label", "Target");
  select.disabled = acting;
  for (const { target } of options) {
    const choice = make("option", target.id === (session.encounter?.playerId ?? "pc") ? "Yourself" : target.name);
    choice.value = target.id;
    choice.selected = target.id === castTarget;
    select.append(choice);
  }
  select.addEventListener("change", () => {
    castTarget = select.value;
    renderActions();
    element("cast-target").focus();
  });
  return select;
}

// An area spell's targets (#338): a box per foe, at most its most ticked;
// the rest are disabled once that many are.
function areaTargets(area) {
  const most = area.spell.maxTargets;
  const group = make("span", undefined, "cast-targets");
  group.id = "cast-targets";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Targets, up to " + most);
  group.append(make("span", "Up to " + most + ":", "approach"));
  for (const { id, name } of area.targets) {
    const label = make("label");
    const box = make("input");
    box.type = "checkbox";
    box.value = id;
    box.checked = castTargets.includes(id);
    box.disabled = acting || (!box.checked && castTargets.length >= most);
    box.addEventListener("change", () => {
      castTargets = box.checked ? [...castTargets, id] : castTargets.filter((other) => other !== id);
      renderActions();
      const again = document.querySelector("#cast-targets input[value=" + JSON.stringify(id) + "]");
      if (again) again.focus();
    });
    label.append(box, " " + name);
    group.append(label);
  }
  return group;
}

async function castSpell(spell, targetIds) {
  await act("/api/5e/session/cast", { spellId: spell.id, slotLevel: spell.slotLevel || null, targetIds, ...(spell.damageType ? { damageType: spell.damageType } : {}), ...(spell.curse ? { curse: spell.curse } : {}) }, "button.act[data-action=cast]", ACTIONS.cast.busy + " " + spell.name + "…");
  keepFocus("cast", "");
}

/**
 * Cunning Strike's choice (#308): none, or one of the effects the engine
 * offers with an attack now. It applies to the next attack clicked.
 */
function strikeChoice(effects) {
  const wrap = make("span", undefined, "action strike-choice");
  const select = make("select");
  select.id = "cunning-strike";
  select.setAttribute("aria-label", "Cunning Strike");
  select.disabled = acting;
  for (const [value, text] of [["", "No Cunning Strike"], ...effects.map(({ id, name }) => [id, name + " (−1d6)"])]) {
    const choice = make("option", text);
    choice.value = value;
    choice.selected = value === cunningStrike;
    select.append(choice);
  }
  select.addEventListener("change", () => {
    cunningStrike = select.value;
    renderActions();
    element("cunning-strike").focus();
  });
  // No caption under it: the bar has little height to spare at phone width.
  wrap.append(select);
  return wrap;
}

async function perform({ action, target, approach, retry, cunningStrike: effect }) {
  const targetId = target ? target.id : "";
  // The clicked control, found again after the bar re-renders, shows busy.
  const control = "button.act[data-action=" + JSON.stringify(action) + "]" + (targetId ? "[data-target=" + JSON.stringify(targetId) + "]" : ":not([data-target])") + (approach ? "[data-approach=" + JSON.stringify(approach.id) + "]" : "") + (retry ? "[data-retry]" : ":not([data-retry])");
  const busy = busyName({ action, target });
  // The chosen Cunning Strike (#308) goes with this attack only.
  if (action === "attack" || action === "light-attack") {
    cunningStrike = "";
    await act("/api/5e/session/" + action, { actorId: session.encounter.playerId, targetId, ...(effect ? { cunningStrike: effect } : {}) }, control, busy);
  } else if (action === "spectral-attack") await act("/api/5e/session/spectral-attack", { targetId }, control, busy);
  else if (FIGHT_FEATURES.includes(action) || action === "tactical-mind") await act("/api/5e/session/action", { action }, control, busy);
  else await act("/api/5e/session/explore", { action, target: targetId, ...(approach ? { approach: approach.id } : {}), ...(retry ? { retry: true } : {}) }, control, busy);
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

/** The library's entry for a class, by id (#306). */
const classEntry = (id) => library.classes.find((entry) => entry.id === id);
/** The class being created. */
const creating = () => classEntry(choices.class);

/**
 * A fresh creation of a class: its default placement and choices. A
 * Fighter's carry its Fighting Style, a Rogue's its Expertise (#306).
 */
function defaultChoices(id = "${DEFAULT_CLASS}") {
  increaseMode = "two";
  return {
    class: id,
    placement: { ...library.pendingCreation.defaultPlacements[id] },
    ...structuredClone(classEntry(id).defaults),
  };
}

/** Choosing a class starts its creation afresh from its defaults (#306). */
function changeClass(id) {
  choices = defaultChoices(id);
  projection = undefined;
  renderChoices();
  element("class-" + id).focus();
  refresh();
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
  const chosen = creating();
  element("class-fields").replaceChildren(...library.classes.map((entry) => {
    const label = make("label");
    const radio = make("input");
    radio.type = "radio";
    radio.name = "class";
    radio.id = "class-" + entry.id;
    radio.checked = entry.id === chosen.id;
    radio.addEventListener("change", () => changeClass(entry.id));
    label.append(radio, entry.name);
    return label;
  }));
  element("class-hint").textContent = chosen.name + ": d" + chosen.hitDie + " hit die; " + chosen.savingThrows.map(titleCase).join(" and ") + " saving throws.";
  element("skills-legend").textContent = "Skill proficiencies: choose " + chosen.skillCount;
  element("masteries-legend").textContent = "Weapon Mastery: choose " + chosen.masteryCount;
  element("expertise-legend").textContent = "Expertise: choose " + chosen.expertiseCount;
  element("expertise-hint").textContent = "Doubles your proficiency bonus with " + chosen.expertiseCount + " of your skills.";
  element("expertise").hidden = chosen.expertiseCount === 0;
  element("styles").hidden = !chosen.fightingStyle;
  // A class without weapon mastery (the Cleric, #339) shows none.
  element("masteries").hidden = chosen.masteryCount === 0;
  renderOrders(chosen);
  renderSpellChoices(chosen);
  renderAbilities();
  element("skill-fields").replaceChildren(...chosen.skills.map((skill) => {
    const label = make("label");
    const box = make("input");
    box.type = "checkbox";
    box.id = "skill-" + skill.id;
    box.checked = choices.skills.includes(skill.id);
    box.addEventListener("change", () => {
      choices.skills = chosen.skills.map(({ id }) => id).filter((id) => element("skill-" + id).checked);
      // Expertise is in skills you are proficient in: unticking one drops it.
      if (choices.expertise) choices.expertise = choices.expertise.filter((id) => choices.skills.includes(id));
      renderExpertise();
      refresh();
    });
    const text = make("span", skill.name);
    text.append(make("small", titleCase(skill.ability)));
    label.append(box, text);
    return label;
  }));
  renderExpertise();
  element("style-fields").replaceChildren(...(chosen.fightingStyle ? library.fightingStyles : []).map((style) => {
    const label = make("label");
    const radio = make("input");
    radio.type = "radio";
    radio.name = "fighting-style";
    radio.id = "style-" + style.id;
    radio.checked = choices.fightingStyle === style.id;
    radio.addEventListener("change", () => { choices.fightingStyle = style.id; refresh(); });
    const text = make("span", style.name + " ");
    const use = make("span", "", "tag style-use");
    use.id = "style-use-" + style.id;
    const note = make("small", "");
    note.id = "style-note-" + style.id;
    text.append(use, make("small", style.text), note);
    label.append(radio, text);
    return label;
  }));
  element("kit-fields").replaceChildren(...chosen.kits.map((kit) => {
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
  element("mastery-fields").replaceChildren(...chosen.masteryWeapons.map((weapon) => {
    const label = make("label");
    const box = make("input");
    box.type = "checkbox";
    box.id = "mastery-" + weapon.id;
    box.checked = choices.masteries.includes(weapon.id);
    box.addEventListener("change", () => {
      choices.masteries = chosen.masteryWeapons.map(({ id }) => id).filter((id) => element("mastery-" + id).checked);
      refresh();
    });
    const text = make("span", weapon.name + " (" + weapon.mastery + ")");
    text.append(make("small", weapon.text));
    label.append(box, text);
    return label;
  }));
}

/**
 * The Divine Order (#339): a radio for each, for a class with them. A
 * Thaumaturge knows one more cantrip, so the cantrip limit follows it.
 */
function renderOrders(chosen) {
  const orders = chosen.divineOrders || [];
  element("divine-order").hidden = orders.length === 0;
  element("order-fields").replaceChildren(...orders.map((order) => {
    const label = make("label");
    const radio = make("input");
    radio.type = "radio";
    radio.name = "divine-order";
    radio.id = "order-" + order.id;
    radio.checked = choices.divineOrder === order.id;
    radio.addEventListener("change", () => {
      choices.divineOrder = order.id;
      // A cantrip past the new limit is unticked, the last ticked first.
      choices.spells.cantrips = choices.spells.cantrips.slice(0, cantripLimit(chosen));
      renderSpellChoices(chosen);
      refresh();
    });
    const text = make("span", order.name);
    text.append(make("small", order.text));
    label.append(radio, text);
    return label;
  }));
}

/** How many cantrips the class knows with the Divine Order chosen (#339). */
const cantripLimit = (chosen) => chosen.spellcasting.cantrips + ((chosen.divineOrders || []).find(({ id }) => id === choices.divineOrder)?.extraCantrips || 0);

/** A spell's tick: its name, and what it does under it (#339). */
function spellBox(id, spell, checked, change) {
  const label = make("label");
  const box = make("input");
  box.type = "checkbox";
  box.id = id;
  box.checked = checked;
  box.addEventListener("change", change);
  const text = make("span", spell.name);
  text.append(make("small", spell.summary));
  label.append(box, text);
  return label;
}

/**
 * A caster's cantrips and prepared spells (#339): a tick for each spell on
 * its list, cantrips and levelled spells apart. A Wizard (#340) also ticks
 * its spellbook's spells, and prepares only from those ticked.
 */
function renderSpellChoices(chosen) {
  const casting = chosen.spellcasting;
  element("spells").hidden = !casting;
  element("spellbook-group").hidden = !casting || !casting.spellbook;
  if (!casting) {
    element("cantrip-fields").replaceChildren();
    element("spellbook-fields").replaceChildren();
    element("prepared-fields").replaceChildren();
    return;
  }
  // A level-1 character has only 1st-level slots (#341).
  const levelled = casting.spells.filter(({ level }) => level === 1);
  element("cantrips-legend").textContent = "Cantrips: choose " + cantripLimit(chosen);
  element("prepared-legend").textContent = "Prepared spells: choose " + casting.prepared + (casting.spellbook ? " from your spellbook" : "");
  const ticked = (spells, prefix) => spells.map(({ id }) => id).filter((id) => element(prefix + id)?.checked);
  element("cantrip-fields").replaceChildren(...casting.spells.filter(({ level }) => level === 0).map((spell) => spellBox("cantrip-" + spell.id, spell, choices.spells.cantrips.includes(spell.id), () => {
    choices.spells.cantrips = ticked(casting.spells, "cantrip-");
    refresh();
  })));
  if (casting.spellbook) {
    element("spellbook-legend").textContent = "Spellbook: choose " + casting.spellbook;
    element("spellbook-fields").replaceChildren(...levelled.map((spell) => spellBox("spellbook-" + spell.id, spell, choices.spellbook.includes(spell.id), () => {
      choices.spellbook = ticked(levelled, "spellbook-");
      // A spell taken out of the spellbook can't stay prepared.
      choices.spells.prepared = choices.spells.prepared.filter((id) => choices.spellbook.includes(id));
      renderSpellChoices(chosen);
      element("spellbook-" + spell.id).focus();
      refresh();
    })));
  } else {
    element("spellbook-fields").replaceChildren();
  }
  const preparable = casting.spellbook ? levelled.filter(({ id }) => choices.spellbook.includes(id)) : levelled;
  element("prepared-fields").replaceChildren(...preparable.map((spell) => spellBox("prepare-" + spell.id, spell, choices.spells.prepared.includes(spell.id), () => {
    choices.spells.prepared = ticked(preparable, "prepare-");
    refresh();
  })));
}

/** Like the skills, for cantrips, the spellbook (#340) and prepared spells (#339). */
function renderSpellLimit() {
  if (!projection.spells) return;
  const casting = creating().spellcasting;
  const { cantrips, prepared, spellbook } = projection.spells;
  const limit = (box, group) => {
    if (box) box.disabled = group.full && !box.checked;
  };
  for (const spell of casting.spells) {
    const cantrip = spell.level === 0;
    limit(element((cantrip ? "cantrip-" : "prepare-") + spell.id), cantrip ? cantrips : prepared);
    if (!cantrip && spellbook) limit(element("spellbook-" + spell.id), spellbook);
  }
  const count = "Cantrips " + cantrips.chosen + " of " + cantrips.limit + " chosen; " + (spellbook ? "spellbook " + spellbook.chosen + " of " + spellbook.limit + " chosen; " : "") + "prepared spells " + prepared.chosen + " of " + prepared.limit + " chosen";
  if (element("spells-count").textContent !== count) element("spells-count").textContent = count;
}

/**
 * Expertise (#306): a tick for each skill proficiency chosen, for a class
 * with it. The skills it can double change as skills are ticked.
 */
function renderExpertise() {
  if (!choices.expertise) {
    element("expertise-fields").replaceChildren();
    return;
  }
  element("expertise-fields").replaceChildren(...creating().skills.filter(({ id }) => choices.skills.includes(id)).map((skill) => {
    const label = make("label");
    const box = make("input");
    box.type = "checkbox";
    box.id = "expertise-" + skill.id;
    box.checked = choices.expertise.includes(skill.id);
    box.addEventListener("change", () => {
      choices.expertise = choices.skills.filter((id) => element("expertise-" + id).checked);
      refresh();
    });
    label.append(box, make("span", skill.name));
    return label;
  }));
}

/** Each kit's items and value, with the AC and attacks the server projected for it. */
function renderKits() {
  for (const kit of creating().kits) {
    const shown = projection && projection.kits.find(({ id }) => id === kit.id);
    element("kit-numbers-" + kit.id).textContent = shown
      ? shown.items.join(", ") + " (" + shown.value + "). AC " + shown.armorClass + "; " + shown.attack.weapon + " " + attackText(shown.attack) + (shown.lightAttack ? "; then " + shown.lightAttack.weapon + " " + attackText(shown.lightAttack) + " as an extra attack" : "") + "."
      : "…";
  }
}

/** Each Fighting Style's tag and note for the kit chosen, as the server projected them (#144). */
function renderStyleUses() {
  for (const use of projection.fightingStyles) {
    const tag = element("style-use-" + use.id);
    tag.textContent = use.applies ? "Applies with this kit" : "No effect with this kit";
    tag.className = "tag style-use " + (use.applies ? "applies" : "no-effect");
    element("style-note-" + use.id).textContent = use.note;
  }
}

/** Like the skills: once the masteries are full, the unticked rest are disabled. */
function renderMasteryLimit() {
  const { chosen, limit, full } = projection.masteries;
  for (const { id } of creating().masteryWeapons) {
    const box = element("mastery-" + id);
    box.disabled = full && !box.checked;
  }
  const count = chosen + " of " + limit + " chosen";
  if (element("masteries-count").textContent !== count) element("masteries-count").textContent = count;
}

/** Once the server says the skills are full, the unticked rest are disabled; the count is announced. */
function renderSkillLimit() {
  const { chosen, limit, full } = projection.skills;
  for (const { id } of creating().skills) {
    const box = element("skill-" + id);
    box.disabled = full && !box.checked;
  }
  const count = chosen + " of " + limit + " chosen";
  if (element("skills-count").textContent !== count) element("skills-count").textContent = count;
}

/** Like the skills, for Expertise (#306). */
function renderExpertiseLimit() {
  if (!projection.expertise) return;
  const { chosen, limit, full } = projection.expertise;
  for (const id of choices.skills) {
    const box = document.getElementById("expertise-" + id);
    if (box) box.disabled = full && !box.checked;
  }
  const count = chosen + " of " + limit + " chosen";
  if (element("expertise-count").textContent !== count) element("expertise-count").textContent = count;
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
    renderExpertiseLimit();
    renderSpellLimit();
    renderMasteryLimit();
    renderKits();
    renderStyleUses();
    element("increase-error").textContent = result.unfinished.increase || "";
    element("skills-error").textContent = result.unfinished.skills || "";
    element("expertise-error").textContent = result.unfinished.expertise || "";
    element("spells-error").textContent = result.unfinished.spells || "";
    element("masteries-error").textContent = result.unfinished.masteries || "";
    element("creation-error").textContent = "";
    if (result.sheet) {
      element("preview-status").textContent = "";
      element("preview-body").replaceChildren(...profileNodes(result.sheet.abilities, result.sheet.profile, undefined, result.sheet.carrying));
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
  element("score-cap").textContent = library.pendingCreation.rules.scoreCap;
  renderChoices();
  show("creation", "Create a character", [{ label: "Create a character" }]);
  element("creation-title").focus();
  await refresh();
}

async function saveCharacter(event) {
  event.preventDefault();
  const save = element("save-character");
  if (isBusy(save)) return;
  const name = element("character-name").value.trim();
  if (!name) {
    element("name-error").textContent = "Enter a name for your " + creating().name + ".";
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

// The level-up card's choice (#286): its draft, kept per character while the
// page is open, and the server's projection of it.
let levelDraft;
let levelProjection;
let levelPreviewRequest = 0;

/** "+2 Strength" or "+1 Strength, +1 Constitution". */
const increaseText = (increase) => library.abilities.filter((ability) => increase[ability]).map((ability) => "+" + increase[ability] + " " + titleCase(ability)).join(", ");

/** "Ability Score Improvement and weapon mastery", or the improvement alone (#308). */
const choiceWords = (up) => up.choices.includes("weapon-mastery") ? "Ability Score Improvement and weapon mastery" : "Ability Score Improvement";

/** The level's changes in words, from the server's level-up view. */
function levelUpLines(up, scoreCap, hitDie) {
  const lines = ["Hit points " + up.maxHp.before + " → " + up.maxHp.after + " (+" + (hitDie / 2 + 1) + " + Constitution modifier)."];
  if (up.proficiencyBonus.before !== up.proficiencyBonus.after) lines.push("Proficiency bonus " + signed(up.proficiencyBonus.before) + " → " + signed(up.proficiencyBonus.after) + ".");
  const wind = up.secondWind;
  if (wind) lines.push("Second Wind: " + wind.after.uses + " uses" + (wind.before.uses === wind.after.uses ? "" : " (was " + wind.before.uses + ")") + ", healing 1d10 + " + wind.after.modifier + " (was 1d10 + " + wind.before.modifier + ").");
  if (up.weaponMasteries.before !== up.weaponMasteries.after) lines.push("Weapon Mastery: " + up.weaponMasteries.after + " kinds of weapon (was " + up.weaponMasteries.before + "); choose the new one below.");
  if (up.choices.includes("ability-score-improvement")) lines.push("Ability Score Improvement: +2 to one ability score or +1 to two, to a maximum of " + scoreCap + "; choose it below.");
  lines.push(up.choices.length > 1 ? "Both choices are needed before the next adventure." : "It is needed before the next adventure.");
  return lines;
}

function renderLevelChoice(entry) {
  const card = element("level-choice");
  card.hidden = !entry.levelChoice;
  if (!entry.levelChoice) return;
  const { levelUp, masteries, scoreCap } = entry.levelChoice;
  if (!levelDraft || levelDraft.characterId !== entry.sheet.id) levelDraft = { characterId: entry.sheet.id, mode: "two", increase: {}, mastery: null, scoreCap };
  levelProjection = undefined;
  element("level-choice-title").textContent = "Level " + levelUp.to + ": choose an " + choiceWords(levelUp).replace(" and weapon", " and a weapon");
  element("level-up-changes").replaceChildren(...levelUpLines(levelUp, scoreCap, classEntry(entry.sheet.class).hitDie).map((line) => make("li", line)));
  // A Rogue's level 4 brings no new mastery (#308).
  element("new-mastery").hidden = !levelUp.choices.includes("weapon-mastery");
  element("asi-mode-two").checked = levelDraft.mode === "two";
  element("asi-mode-split").checked = levelDraft.mode === "split";
  element("new-mastery-fields").replaceChildren(...classEntry(entry.sheet.class).masteryWeapons.filter(({ id }) => masteries.includes(id)).map((weapon) => {
    const label = make("label");
    const radio = make("input");
    radio.type = "radio";
    radio.name = "new-mastery";
    radio.id = "new-mastery-" + weapon.id;
    radio.checked = levelDraft.mastery === weapon.id;
    radio.addEventListener("change", () => { levelDraft.mastery = weapon.id; previewLevelChoice(); });
    const text = make("span", weapon.name + " (" + weapon.mastery + ")");
    text.append(make("small", weapon.text));
    label.append(radio, text);
    return label;
  }));
  element("level-choice-changes").replaceChildren();
  renderAsiFields(entry.sheet.abilities);
  previewLevelChoice();
}

/**
 * One choice per ability: a radio for +2, or a checkbox for +1 (two at
 * most). Each shows the server's score and modifier for the draft, and an
 * ability the improvement would take past the cap is disabled.
 */
function renderAsiFields(abilities) {
  const amount = levelDraft.mode === "two" ? 2 : 1;
  const chosen = Object.keys(levelDraft.increase);
  element("asi-fields").replaceChildren(...library.abilities.map((ability) => {
    const row = levelProjection && levelProjection.rows.find((entry) => entry.ability === ability);
    const label = make("label");
    const input = make("input");
    input.type = amount === 2 ? "radio" : "checkbox";
    input.name = "asi-ability";
    input.id = "asi-" + ability;
    input.checked = chosen.includes(ability);
    const room = row ? row.room : levelDraft.scoreCap - abilities[ability];
    input.disabled = (room < amount && !input.checked) || (amount === 1 && chosen.length >= 2 && !input.checked);
    input.addEventListener("change", () => changeAsi(ability, input.checked));
    const text = make("span", titleCase(ability) + " " + (row ? row.before + (row.score === row.before ? "" : " → " + row.score) + " (" + signed(row.modifier) + ")" : abilities[ability]));
    if (room < amount) text.append(make("small", room === 0 ? "Already " + levelDraft.scoreCap : "Only +1 fits under " + levelDraft.scoreCap));
    label.append(input, text);
    return label;
  }));
}

function changeAsi(ability, checked) {
  if (levelDraft.mode === "two") levelDraft.increase = { [ability]: 2 };
  else if (checked) levelDraft.increase = { ...levelDraft.increase, [ability]: 1 };
  else {
    const rest = { ...levelDraft.increase };
    delete rest[ability];
    levelDraft.increase = rest;
  }
  previewLevelChoice();
}

function changeAsiMode(event) {
  levelDraft.mode = event.target.value;
  levelDraft.increase = {};
  previewLevelChoice();
}

/** Asks the server to project the draft; confirming waits for a finished one. */
async function previewLevelChoice() {
  const ticket = ++levelPreviewRequest;
  const entry = findEntry(levelDraft.characterId);
  const confirm = element("confirm-level-choice");
  confirm.disabled = true;
  try {
    const result = await request("/api/5e/characters/level-choice/preview", { characterId: levelDraft.characterId, increase: levelDraft.increase, mastery: levelDraft.mastery });
    if (ticket !== levelPreviewRequest) return;
    levelProjection = result;
    renderAsiFields(entry.sheet.abilities);
    element("asi-error").textContent = result.unfinished.increase || "";
    element("new-mastery-error").textContent = result.unfinished.mastery || "";
    element("level-choice-error").textContent = "";
    element("level-choice-status").textContent = result.changes ? "" : entry.levelChoice.levelUp.choices.length > 1 ? "Finish both choices to see what they change." : "Choose the improvement to see what it changes.";
    element("level-choice-changes").replaceChildren(...(result.changes || []).map((line) => make("li", line)));
    confirm.disabled = !result.changes || isBusy(confirm);
  } catch (error) {
    // The server stays the authority: a choice it refuses can't be confirmed.
    if (ticket !== levelPreviewRequest) return;
    element("level-choice-error").textContent = error.message;
  }
}

async function confirmLevelChoice() {
  const confirm = element("confirm-level-choice");
  if (isBusy(confirm) || !levelProjection || !levelProjection.changes) return;
  const { characterId, increase, mastery } = levelDraft;
  const entry = findEntry(characterId);
  setBusy(confirm, "Saving…");
  try {
    library = await request("/api/5e/characters/level-choice", { revision: library.revision, characterId, increase, mastery });
  } catch (error) {
    element("level-choice-error").textContent = error.message;
    clearBusy(confirm);
    confirm.disabled = false;
    return;
  }
  clearBusy(confirm);
  confirm.disabled = false;
  levelDraft = undefined;
  openSheet(characterId);
  const weapon = classEntry(entry.sheet.class).masteryWeapons.find(({ id }) => id === mastery);
  feedback(entry.sheet.name + "'s level choices are saved: " + increaseText(increase) + (weapon ? ", and mastery of the " + weapon.name.toLowerCase() : "") + ".");
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
for (const mode of ["two", "split"]) element("asi-mode-" + mode).addEventListener("change", changeAsiMode);
element("confirm-level-choice").addEventListener("click", confirmLevelChoice);
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
// On a phone the dock is sticky: keep focused controls clear of it. The height
// rounds up, as offsetHeight's rounding down left a button under it (#256).
new ResizeObserver(() => {
  const dock = element("session-dock");
  document.documentElement.style.setProperty("--session-dock-height", getComputedStyle(dock).position === "sticky" ? Math.ceil(dock.getBoundingClientRect().height) + "px" : "0px");
}).observe(element("session-dock"));
window.addEventListener("popstate", () => { if (library) route(true); });
request("/api/5e/library").then((value) => {
  library = value;
  // A reload returns to the view the URL names.
  route(false);
}, (error) => feedback(error.message));
`;
