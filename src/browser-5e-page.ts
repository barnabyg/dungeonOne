// The browser page: the 5e character library, the creation screen, the
// character sheet and the adventure screen. Bundled into dist so the extracted package serves the same interface. The script builds
// every element with textContent, never HTML from data.
//
// Adventure session regions (#154). Later tickets fill these containers; keep
// their ids and order so the layout holds:
// - #session-character (#432): the status strip, "You carry" and the rests,
//   described below.
// - #scene-backdrop (#517): a faint drawing of the kind of place the room
//   is (src/backdrops-5e.ts), the room's own, else its region's, or none;
//   a fight keeps it. It shares the grid cell of the scene's column
//   (#session-scene from 1500 px wide, #session-main narrower) and sits
//   behind it, standing on the cell's foot while the column scrolls over
//   it, hidden from assistive technology.
// - #session-scene: the centre column above the composer (#523), scrolling
//   on its own from 1500 px wide: #session-actions, then the room and the
//   fight. The room (#room) is where the
//   character acts out of a fight (#520): after #room-region, #room-heading
//   holds #room-title, in a way-out room only #leave-controls ("Way out
//   · Leave"), and #room-history-link ("Description in history", #524),
//   shown while the history has an arrival in the room; the description
//   itself is only in the history. Then #leave-confirm, #room-actions (the
//   row for what acts on no one thing: a search of the room, Tactical
//   Mind) and #room-alarm. Then the room's things, one card each
//   (li.thing[data-id]), in the order Here (#creatures), Items here
//   (#room-items), Look at (#features) and Ways on (#exits); an empty list
//   is left out (#157). While the character is unseen in a fight's room or
//   its opponents react, Here opens with the encounter's card (#530),
//   li.opponents-card[data-id] (the encounter's id) with data-state
//   (unseen or the band): .opponents-state ("Hasn't seen you", or the band
//   in words), an .opponent line each (icon, .opponent-name, description)
//   and .opponents-controls with Ambush, or the reaction's options and
//   Trade. It goes when the fight begins. A card's .thing-head has its
//   name and description (.thing-text) and, on the right, its buttons
//   (.thing-controls): an exit's Go (primary) and Sneak and its door's and
//   trap's Force, Pick, Break, Unlock and Disarm; a feature's (or body's)
//   Examine and Use <item> (#400); an item's Take and Examine; a merchant's
//   Trade. Under it an item's Stats; a creature's .ask-row, a group named
//   "Ask <name> about" with an "Ask about" label and a button per topic by
//   its name, an asked one greyed out with no caption (#490); then what was
//   found or said there, an exit's route, door and trap. Each button's
//   accessible name is the full action ("Examine Rusted Lantern"). The
//   cards are in #room-things; in a fight it folds behind #room-fold, a
//   disclosure naming the room's items and features on one line
//   (#525), and the cards have no buttons the engine doesn't offer. A new
//   room, or a fight beginning or ending, scrolls the centre column back to
//   its top and folds the room again. The known rooms (#405) and their
//   records are on the map (#457), not here (#522).
// - #encounter, the fight panel (#525), after #session-actions and before
//   the room, shown only while a fight is under way: #fight-top (h3
//   #encounter-title "Fight · Round N" and #turn-order, each combatant's
//   .turn-entry[data-combatant] with its initiative, the current one a
//   strong with aria-current, " · your turn"), #fight-sides (#fight-you
//   with #you-card: .card-head (.card-name, .card-ac), .card-hp and
//   .hp-bar, .card-tags (its conditions, Hidden, Surprised), then
//   #heal-controls, the ways to heal (Second Wind, Drink each potion, each
//   healing spell as data-action=heal-spell at its lowest slot, Preserve
//   Life) with what each restores and its action in .act-detail; under it
//   #attack-chooser (#526, hidden with one way to attack): #chooser-chips,
//   a radiogroup of every way to attack a foe, a .chooser-group[data-group]
//   per kind (Weapon, Ongoing, Cantrips, 1st, 2nd… with .chooser-pips for
//   the slots left, Items, Channel Divinity) of label.chip[data-choice]
//   radios, .on when chosen, .off with .chip-reason when the engine would
//   refuse it; and #chooser-detail, the chosen one's name, #chooser-slot
//   (slot level, or a wand's charges) and #chooser-variant (damage type,
//   curse or Divine Spark's damage), then what it does; then
//   #strike-control (Cunning Strike's choice, #308, shown only while a weapon
//   attack is chosen); #fight-foes with #foe-cards, an li.foe-card[data-combatant]
//   per foe in initiative order: head, HP and bar, .card-tags (conditions,
//   effects, Sapped, Hidden, Fleeing, Surrendering, Surprised), .card-state
//   (Fallen, Fled, Surrendered or Turned) and, while it can be attacked,
//   .foe-controls, holding the chosen attack's one button (data-action,
//   data-target, a spell's data-spell and data-slot, a scroll's or wand's
//   data-item: "Attack with Mace +6 · 1d6 + 4", "Fire Bolt +7 · 2d10") or,
//   for an area spell or Scorching Ray, its .blast-tick box; then
//   #area-cast, that spell's one Cast button; then #fight-foot:
//   #flee-control (#flee-toggle "Flee ▾", a disclosure of #flee-menu:
//   #flee-attacks, whom a flight draws attacks from, over #flee-ways, a
//   button per way out; Escape or a click elsewhere closes it; disabled
//   with #flee-reason when every flight is refused), #turn-resources (the
//   turn's Action, Bonus and Reaction pips) and #end-controls (End turn and
//   what it leaves unused), then the action bar's other rows, moved in
//   (over the cards while a hit or a fall waits for an answer). The rolls
//   behind the turn order are in the history's arrival entry (#524), with
//   a closed .initiative-how, "How initiative was rolled" (#525).
// - #session-status: the status strip (#155): HP with its bar and health,
//   the round and whose turn it is (#turn), the character's conditions in a
//   fight (#conditions, #232), and #resources, a pip for each class feature
//   use, and outside a fight's turns for each hit die (#333); the turn's
//   pips are in the fight panel's footer (#525). It shows only what the session view projects.
// - #inventory-group: "You carry" (#432), #inventory, in groups (worn and
//   wielded, consumables, treasure, other), a line per entry with its verbs
//   on the right and its description and stats behind its name (#504:
//   stowed gear also says what equipping it would do); then the purse and
//   what the character is carrying. Room loot that is gear has the same
//   stats behind a Stats toggle. Nothing sells from here: trading is in the
//   shop (#515).
// - #session-actions, at the top of the centre column (#523), above the
//   room: #adventure-error and the action bar (#156), #action-bar:
//   #attack-controls and #feature-controls (out of a fight, a spell's or
//   Divine Spark's choice) and, in a fight, inside the fight panel, the
//   turn's other options in labelled rows (#392), .action-row with data-row
//   and a role=group named by its .row-label, the attacks being the attack
//   chooser's (#526): #feature-controls in FIGHT_ROWS order: Cast a spell
//   (the spells on the character), Channel Divinity (its shared uses once,
//   in .row-uses), Fighter features, Rogue features, Items (a scroll's or
//   wand's Use on the character), Weapons, Last Stand (#499:
//   Drink each potion or Fall, alone while the character's fall waits),
//   Answer the hit, Use the room and Other actions. Healing, Flee and End
//   turn (only Wait, with why, while paralysed, #234) are on the panel's
//   card and footer (#525). Exploring actions are on the
//   room's cards, not here (#520). Leave (#133), on a way-out room's
//   heading, asks first in #leave-confirm, under the heading in place of the
//   button, never in a browser dialog,
//   naming the ending leaving brings and, in #leave-warning, what leaving
//   short of the objective gives up (#475). The bar and the room
//   show every action the session view projects, an unavailable one disabled
//   with its reason as visible text linked by aria-describedby. Outside a
//   fight, what the character carries is acted on from
//   #inventory, not the bar (#198): each carried item's Examine and Drink sit
//   on its entry, a spell scroll's Read too (#346; in a fight a scroll or
//   wand is cast from the Cast choice), and the character's own gear has
//   its Unequip, Wield, Equip and Drop there (#209). Resting
//   sits in the character column's #rest-group (#521), never the bar, shown
//   whenever the adventure is in play. In a fight #rest-fight says "Not
//   during a fight" with the rests left. Otherwise #short-rest (#334) has
//   the short rests and hit dice left, a one-line hint of what hit dice do
//   (#rest-hint, #533), a choice of how many hit dice to
//   spend (#rest-dice) while a rest would restore something, and its Short
//   rest button, disabled with its reason as visible text when the engine
//   would refuse it or offers none ("Nothing to recover", "No short rests
//   left"). A level-5 Wizard's rest also offers Memorize Spell (#344): the
//   prepared spell to forget (#rest-forget) and the spellbook's spell to
//   prepare in its place (#rest-learn), or neither unless the swap is all
//   the rest would bring. #long-rest (#335) at a rest site shows the long
//   rests left and its Long rest button, disabled with its reason likewise;
//   elsewhere one line, "Only at a rest site" or "No long rest left". The
//   rules are behind #rest-rules, "How resting works", closed by default. A merchant's card in #creatures (#210) has
//   Trade (#open-shop), which opens the shop, described below. Gems and art
//   objects (#239) show their value on their "You carry" entry. Arrows and
//   bolts (#230) have an entry each with their count. Facing a
//   reaction (#304), its options are on the opponents' card (#530): a
//   parley (#305) has a button per skill with the skill and DC under it, a
//   toll names its price, and while the band offers trade the card has
//   Trade as above.
//   After an action, focus stays on the clicked control if it is still
//   enabled, and otherwise moves to the latest turn's first history entry.
//   When the adventure is over the bar is hidden and #ending (#158) takes its place: data-kind victory,
//   escape-with-loot, escape-without-loot or defeat (in words, #ending-kind,
//   and colour), the title and text, a defeat's permanence, #ending-rewards
//   (the XP, treasure and coin a surviving ending earned, #ending-coin, and a
//   level-up card, #133, #208)
//   and #ending-next back to the character sheet. Focus moves to
//   #ending-title when the ending appears or is opened again.
// - #session-history: the conversation history, #log, a live region in its own
//   scroll area, newest at the bottom; each turn shows from its top (#529),
//   its first entry midway down the view with older entries above it, or
//   higher so the whole turn fits, while the reader is on the latest turn. Each entry (#159) has a data-kind (narration, message or
//   action); the newest has class "newest" and tabindex -1, as the latest
//   turn's first entry does, and focusTurnEntry() moves focus to that. A
//   card arriving in a room (#524) has data-arrival, the room's name, which its first line starts with in
//   bold; #room-history-link scrolls to and focuses the newest one for the
//   character's room.
// - #session-composer: #message-form, and #dm-notice when typing to the AI DM
//   is off (#161); once the adventure is over #composer-reason says why
//   (#158). renderComposer() alone decides whether it is enabled.
// One column per job (#523): who you are, what you can do, what has happened.
// DOM order, and so tab order, is the same: #session-main (#session-character,
// #session-scene), #session-composer, #session-history; no CSS order moves
// them, except below. #session-layout is a grid of two rows: the composer
// sits in the second, a row of its own height under the scene, so it stays
// on screen however long the room; the history spans both, at the panel's
// full height. Its top half is #history-panel, "What happened" framed with
// the log in it; the bottom half is kept empty for later use. The session fills the window. From 1500 px wide it is up to
// 1880 px wide, in three columns: character (both rows), the scene over the
// composer, and the history, the columns scrolling on their own. Narrower,
// it is up to 1240 px wide, in two: on the left #session-main scrolls the
// scene with "You carry" and the rests under it and the status strip held at
// its top, over the composer; on the right the history. There "You carry"
// comes after the scene on screen but before it in tab order. The page is for
// desktop windows (#381): below 900 x 560 px it keeps that size and the
// window scrolls. There is no footer: the icon and
// sound credits (#377, #480) are in Settings (#credits, #522), which the
// header bar opens from every screen.
// In an adventure the header bar's #adventure-meta names the adventure's
// levels and difficulty, not the room (#522), and its #open-map (or M)
// opens the map pop-up, #map-dialog (#457), described at renderMap.
//
// The shop (#515): a merchant's Trade opens #shop in place of
// #session-layout, so the character column, scene, history and composer
// are hidden and only buttons trade there; the header bar stays. It is page
// state only: a reload, or opening the adventure again, shows the room, and
// it closes itself when trade ends (the adventure over, the merchant gone,
// a fight begun). #leave-shop (or Esc) returns to the room with focus on
// Trade; Esc first closes a question the shop asks. Opening it rings the
// shop's bell (shop-bell). Along the top, the shop's sign: a bell, the
// merchant's name "open for trade" (#shop-title) and description
// (#shop-greeting), #shop-purse and #shop-load; under it #shop-terms (the
// trade's minutes and what the merchant pays). Then .shop-floor, a faint
// drawing of a shop's shelves and counter (.shop-scene) behind
// #shop-columns: #shop-wares (a row per ware, its name and a gold price
// tag), #shop-details (the chosen item's price, description and stats with
// its comparison, #504, shown directly, and its one Buy or Sell, disabled
// with its reason in #shop-reason, or with what it leaves in
// #shop-purse-after) and
// #shop-pack, grouped: treasure at its full value with #sell-all-treasure,
// gear at the buy-back price marked worn or in hand, ammunition by the 20,
// and what the merchant doesn't buy, greyed out. Each row is a button,
// aria-pressed while chosen. Selling equipped gear asks first in
// #sale-confirm in the details; Sell all treasure asks in #sell-all-confirm,
// naming the coin and minutes, then makes one trade per gem or art object.
// #shop-receipt shows the last trade's result (or refusal), and each trade
// still writes its usual history entry; after a trade focus stays on its
// button while enabled, otherwise on the receipt. From 1100 px wide the
// three parts are columns, each scrolling on its own; narrower, the details
// sit under the two lists (still between them in tab order) and the parts
// scroll together.
//
// Settings (#506): the header bar's #open-settings opens the #settings view
// (hash #settings): a fieldset per setting (#setting-<id>), each choice a
// radio (#setting-<id>-<value>) with the default tagged, and
// #reset-settings. The server sends every setting, its choices and its
// value, and validates each change; the page computes nothing. While an
// adventure is in progress #settings-in-progress says changes apply from
// the next adventure. Above them #settings-sound (#510) has this browser's
// sound, #settings-sound-on and #settings-sound-volume, in step with the
// header's; with sound off for the launch it says so and has no controls.
// Settings remembers the view it was opened from in its history entry, so
// a reload keeps it: the breadcrumb runs through that view, and
// #settings-back ("Back to <view>") returns to it as Back does; a Settings
// URL opened on its own goes back to the characters.
//
// Creation's ability scores (#509) follow the pending creation's method:
// #method-hint and #placing-hint say how; each #place-<ability> places a
// roll or a standard array score, or buys a score (#points-status, and
// #scores-error past the points); #reroll-controls offers the one reroll.
//
// Sound (#480): the header bar ends with #sound-controls on every screen, a
// mute toggle (#sound-mute, aria-pressed) and a volume slider
// (#sound-volume), kept per browser. They come first in the DOM, so the
// breadcrumb stays just before each view's heading in tab order. A launch
// with sound off leaves them out of the page, and then no sound file is
// fetched. Sound is never the only signal: the text, rolls and icons still
// say everything.
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
// start it again. An action button (#185), in the bar or on a room card,
// keeps its busy label in data-busy-label, drawn over its hidden idle label
// in a space sized for the wider of the two, so its row never reflows;
// while busy, its accessible name
// is the full busy name, such as "Attacking Goblin Warrior…". A typed
// message shows at once with a client-only pending "The Dungeon Master is
// thinking…" entry (data-pending) that renderHistory replaces with the saved
// result; it is never saved. Confirmations go to
// #feedback, a polite live region that show() moves under the current panel's
// heading and route() clears on every navigation.
import { BACKDROP_ART, BACKDROPS } from "./backdrops-5e.js";
import { FEATURE_USES_RULE } from "./class-5e.js";
import { DEFAULT_CLASS } from "./character-5e.js";
import { TURN_UNDEAD_ID } from "./encounter-5e.js";
import { formatCoins, parseCoins } from "./equipment-5e.js";
import { COIN_ICON, iconCredits, iconSprite } from "./icons-5e.js";
import { DAMAGE_ADJUSTMENT_TEXT, SHORT_REASONS } from "./runtime-5e.js";
import {
  resultSounds,
  soundCredits,
  soundGains,
  soundUrls,
} from "./sounds-5e.js";

/** The composer's notice when the server has no AI DM (#161). */
export const FIFTH_DM_OFF_NOTICE =
  "Typing to the Dungeon Master is off. Use the buttons.";

// The header's sound controls (#480): a speaker that is crossed out while muted.
const SOUND_CONTROLS = `<div id="sound-controls" role="group" aria-label="Sound"><button id="sound-mute" type="button" class="secondary" aria-pressed="false" title="Mute sound"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z"/><path class="waves" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/><path class="cross" d="M16 9l6 6m0-6-6 6"/></svg><span class="visually-hidden">Mute sound</span></button><input id="sound-volume" type="range" min="0" max="100" step="5" aria-label="Volume"></div>`;

// The Settings page's sound (#510): the header's mute and volume again, as a
// checkbox and a slider, or, with sound off for the launch, a note and none.
const SETTINGS_SOUND = (sound: boolean) =>
  `<fieldset id="settings-sound" class="setting" aria-describedby="settings-sound-text"><legend>Sound</legend>${
    sound
      ? `<p id="settings-sound-text" class="hint">This browser's sound, the same as the header's mute button and volume slider. A change applies at once, in an adventure too; Reset to defaults leaves it as it is.</p><div class="setting-choices"><label><input id="settings-sound-on" type="checkbox"> Sound on</label><label>Volume <input id="settings-sound-volume" type="range" min="0" max="100" step="5"> <output id="settings-sound-volume-value" for="settings-sound-volume"></output></label></div>`
      : `<p id="settings-sound-text" class="hint">Sound is off for this launch. To have sound, restart the game without --no-sound.</p>`
  }</fieldset>`;

// The header's Settings button (#506): a gear, kept narrow so the adventure's
// header stays one bar at the 900 px floor; its name is "Settings".
const SETTINGS_BUTTON = `<button id="open-settings" type="button" class="secondary" title="Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg><span class="visually-hidden">Settings</span></button>`;

// The shop's sign (#515): a bell, drawn for Dungeon One.
const SHOP_BELL = `<svg class="shop-bell" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.5a1.5 1.5 0 0 1 1.5 1.5v.7A6.2 6.2 0 0 1 18.2 11v4.2l2.1 3.1H3.7l2.1-3.1V11a6.2 6.2 0 0 1 4.7-6.3V4A1.5 1.5 0 0 1 12 2.5zM9.8 19.4h4.4a2.2 2.2 0 0 1-4.4 0z"/></svg>`;

// The shop's back wall (#515), drawn for Dungeon One in one colour: an
// awning, lanterns and herbs, two shelves of jars, bottles, books, sacks and
// pots, and a counter with a ledger, scales and coin. It sits faintly behind
// the wares and the pack; the details card stands on it.
const SHOP_SCENE = `<svg class="shop-scene" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false"><g fill="currentColor"><rect x="0" y="0" width="1200" height="22"/><path d="M0 22a30 26 0 0 0 60 0zM60 22a30 26 0 0 0 60 0zM120 22a30 26 0 0 0 60 0zM180 22a30 26 0 0 0 60 0zM240 22a30 26 0 0 0 60 0zM300 22a30 26 0 0 0 60 0zM360 22a30 26 0 0 0 60 0zM420 22a30 26 0 0 0 60 0zM480 22a30 26 0 0 0 60 0zM540 22a30 26 0 0 0 60 0zM600 22a30 26 0 0 0 60 0zM660 22a30 26 0 0 0 60 0zM720 22a30 26 0 0 0 60 0zM780 22a30 26 0 0 0 60 0zM840 22a30 26 0 0 0 60 0zM900 22a30 26 0 0 0 60 0zM960 22a30 26 0 0 0 60 0zM1020 22a30 26 0 0 0 60 0zM1080 22a30 26 0 0 0 60 0zM1140 22a30 26 0 0 0 60 0z"/><rect x="299" y="48" width="2" height="30"/><rect x="286" y="78" width="28" height="7" rx="2"/><path d="M289 85h22l4 34h-30z"/><rect x="285" y="119" width="30" height="6" rx="2"/><circle cx="300" cy="131" r="4"/><rect x="899" y="48" width="2" height="30"/><rect x="886" y="78" width="28" height="7" rx="2"/><path d="M889 85h22l4 34h-30z"/><rect x="885" y="119" width="30" height="6" rx="2"/><circle cx="900" cy="131" r="4"/><rect x="136" y="46" width="48" height="3"/><path d="M143 49h2l9 46-10 8-10-8z"/><path d="M159 49h2l9 46-10 8-10-8z"/><path d="M175 49h2l9 46-10 8-10-8z"/><rect x="1016" y="46" width="48" height="3"/><path d="M1023 49h2l9 46-10 8-10-8z"/><path d="M1039 49h2l9 46-10 8-10-8z"/><path d="M1055 49h2l9 46-10 8-10-8z"/><rect x="70" y="205" width="1060" height="11" rx="2"/><path d="M96 216h28l-14 22z"/><path d="M586 216h28l-14 22z"/><path d="M1076 216h28l-14 22z"/><rect x="70" y="335" width="1060" height="11" rx="2"/><path d="M96 346h28l-14 22z"/><path d="M586 346h28l-14 22z"/><path d="M1076 346h28l-14 22z"/><rect x="110" y="153" width="46" height="52" rx="8"/><rect x="107" y="145" width="52" height="9" rx="3"/><rect x="162" y="165" width="36" height="40" rx="8"/><rect x="159" y="157" width="42" height="9" rx="3"/><rect x="212" y="159" width="26" height="46" rx="6"/><rect x="221.0" y="141" width="8" height="19"/><rect x="220.0" y="135" width="10" height="7" rx="2"/><rect x="244" y="169" width="22" height="36" rx="6"/><rect x="251.0" y="151" width="8" height="19"/><rect x="250.0" y="145" width="10" height="7" rx="2"/><rect x="300" y="147" width="14" height="58" rx="2"/><rect x="317" y="153" width="14" height="52" rx="2"/><rect x="334" y="145" width="14" height="60" rx="2"/><rect x="351" y="157" width="14" height="48" rx="2"/><rect x="368" y="150" width="14" height="55" rx="2"/><path fill-rule="evenodd" d="M386 171a34 34 0 1 0 68 0a34 34 0 1 0-68 0zM406 171a14 14 0 1 0 28 0a14 14 0 1 0-28 0z"/><rect x="480" y="145" width="52" height="60" rx="8"/><rect x="477" y="137" width="58" height="9" rx="3"/><rect x="546" y="153" width="30" height="52" rx="6"/><rect x="557.0" y="135" width="8" height="19"/><rect x="556.0" y="129" width="10" height="7" rx="2"/><rect x="590" y="161" width="40" height="44" rx="8"/><rect x="587" y="153" width="46" height="9" rx="3"/><rect x="650" y="165" width="70" height="40" rx="3"/><rect x="660" y="133" width="50" height="32" rx="3"/><rect x="740" y="165" width="24" height="40" rx="6"/><rect x="748.0" y="147" width="8" height="19"/><rect x="747.0" y="141" width="10" height="7" rx="2"/><rect x="770" y="155" width="28" height="50" rx="6"/><rect x="780.0" y="137" width="8" height="19"/><rect x="779.0" y="131" width="10" height="7" rx="2"/><rect x="810" y="157" width="44" height="48" rx="8"/><rect x="807" y="149" width="50" height="9" rx="3"/><rect x="870" y="155" width="13" height="50" rx="2"/><rect x="886" y="161" width="13" height="44" rx="2"/><rect x="902" y="149" width="13" height="56" rx="2"/><rect x="918" y="165" width="13" height="40" rx="2"/><rect x="950" y="141" width="60" height="64" rx="8"/><rect x="947" y="133" width="66" height="9" rx="3"/><rect x="1022" y="161" width="26" height="44" rx="6"/><rect x="1031.0" y="143" width="8" height="19"/><rect x="1030.0" y="137" width="10" height="7" rx="2"/><rect x="1058" y="167" width="40" height="38" rx="8"/><rect x="1055" y="159" width="46" height="9" rx="3"/><path d="M110 335q-6-52.5 21.0-70l8.4-12 8.4 10q42.0 24.5 32.2 70z"/><path d="M190 335q-6-43.5 18.0-58l7.199999999999999-12 7.199999999999999 10q36.0 20.299999999999997 27.6 58z"/><path d="M270 335q-8-40 10-52h56q18 12 10 52z"/><rect x="275" y="276" width="62" height="8" rx="3"/><rect x="370" y="323" width="90" height="11" rx="3"/><rect x="368" y="311" width="94" height="11" rx="3"/><rect x="366" y="299" width="98" height="11" rx="3"/><rect x="364" y="287" width="102" height="11" rx="3"/><path d="M490 335q-6-48.0 19.8-64l7.92-12 7.92 10q39.6 22.4 30.360000000000003 64z"/><path d="M580 335q-14-46 26-50q40 4 26 50z"/><path d="M628 300l26-12 4 6-24 14z"/><rect x="600" y="276" width="12" height="10" rx="4"/><path d="M700 335l-26-22v-44h52v44z"/><rect x="760" y="295" width="10" height="40" rx="2"/><path d="M765 286q-5 5 0 9q5-4 0-9z"/><rect x="778" y="295" width="10" height="40" rx="2"/><path d="M783 286q-5 5 0 9q5-4 0-9z"/><rect x="796" y="295" width="10" height="40" rx="2"/><path d="M801 286q-5 5 0 9q5-4 0-9z"/><path d="M840 335q-6-49.5 21.0-66l8.4-12 8.4 10q42.0 23.099999999999998 32.2 66z"/><path d="M915 335q-6-39.0 16.8-52l6.72-12 6.72 10q33.6 18.2 25.76 52z"/><path d="M990 335q-8-40 10-52h56q18 12 10 52z"/><rect x="995" y="276" width="62" height="8" rx="3"/><rect x="1085" y="155" width="36" height="50" rx="8"/><rect x="1082" y="147" width="42" height="9" rx="3"/><rect x="0" y="470" width="1200" height="14" rx="3"/><path fill-rule="evenodd" d="M20 484h1160v116H20zM50 506h340v74H50zM430 506h340v74H430zM810 506h340v74H810z"/><path d="M250 470l10-22q60-10 90 4q30-14 90-4l10 22z"/><rect x="820" y="462" width="80" height="8" rx="3"/><rect x="857" y="384" width="6" height="80"/><rect x="800" y="384" width="120" height="5" rx="2"/><circle cx="860" cy="380" r="6"/><path d="M804 389l-26 44h4l24-40 24 40h4l-26-44z"/><path d="M772 433h68q-6 14-34 14q-28 0-34-14z"/><path d="M912 389l-26 44h4l24-40 24 40h4l-26-44z"/><path d="M880 433h68q-6 14-34 14q-28 0-34-14z"/><rect x="960" y="462" width="24" height="6" rx="3"/><rect x="960" y="455" width="24" height="6" rx="3"/><rect x="960" y="448" width="24" height="6" rx="3"/><rect x="960" y="441" width="24" height="6" rx="3"/><rect x="960" y="434" width="24" height="6" rx="3"/><rect x="960" y="427" width="24" height="6" rx="3"/><rect x="990" y="462" width="24" height="6" rx="3"/><rect x="990" y="455" width="24" height="6" rx="3"/><rect x="990" y="448" width="24" height="6" rx="3"/><rect x="990" y="441" width="24" height="6" rx="3"/><rect x="1018" y="462" width="24" height="6" rx="3"/><rect x="1018" y="455" width="24" height="6" rx="3"/><rect x="1018" y="448" width="24" height="6" rx="3"/><rect x="1018" y="441" width="24" height="6" rx="3"/><rect x="1018" y="434" width="24" height="6" rx="3"/><rect x="1018" y="427" width="24" height="6" rx="3"/><rect x="1018" y="420" width="24" height="6" rx="3"/></g></svg>`;

/** The page, with its sound controls unless the launch turned sound off. */
export const fifthBrowserHtml = (sound: boolean): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Dungeon One</title><link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script></head>
<body>${iconSprite()}<a class="skip" href="#content">Skip to content</a>
<header class="masthead"><div class="brand"><span class="brand-mark" aria-hidden="true">◇</span><h1>Dungeon One</h1></div>${sound ? SOUND_CONTROLS : ""}${SETTINGS_BUTTON}
<nav id="breadcrumb" aria-label="Breadcrumb"><ol id="breadcrumb-list"></ol></nav>
<p id="adventure-meta" hidden></p><button id="open-map" type="button" class="secondary" aria-haspopup="dialog" aria-keyshortcuts="M" title="Map (M)" hidden>Map</button></header>
<main id="content" tabindex="-1">
<section id="library" class="panel" aria-labelledby="library-title">
<h2 id="library-title" tabindex="-1">Your characters</h2>
<p id="feedback" role="status" aria-live="polite"></p>
<ul id="characters" class="list"></ul>
<p id="no-characters" class="hint" hidden>No characters yet.</p>
<button id="open-creation" type="button" class="primary">Create a character</button>
</section>
<section id="settings" class="panel" aria-labelledby="settings-title" hidden>
<h2 id="settings-title" tabindex="-1">Settings</h2>
<p class="hint">The defaults are the game as it is balanced. Each adventure keeps the settings it started with.</p>
<div class="controls"><button id="settings-back" type="button" class="primary">Back to your characters</button></div>
${SETTINGS_SOUND(sound)}
<p id="settings-in-progress" class="notice" hidden>An adventure is in progress: changes apply from the next adventure.</p>
<div id="settings-list"></div>
<p id="settings-error" class="error" role="alert"></p>
<div class="controls"><button id="reset-settings" type="button" class="secondary">Reset to defaults</button></div>
<section id="credits" aria-labelledby="credits-title"><h3 id="credits-title">Credits</h3>${[
  iconCredits(),
  soundCredits(),
]
  .filter(Boolean)
  .map((credit) => `<p class="hint">${credit}</p>`)
  .join("")}</section>
</section>
<section id="creation" class="panel" aria-labelledby="creation-title" hidden>
<h2 id="creation-title" tabindex="-1">Create a character</h2>
<p id="method-hint" class="hint">Rolled once. No rerolls. Choose a class, place the six rolls on your abilities in any order, then make your other choices.</p>
<form id="creation-form" novalidate>
<label for="character-name">Name</label><input id="character-name" maxlength="40" autocomplete="off" required aria-describedby="name-error"><p id="name-error" class="error" role="alert"></p>
<fieldset id="classes" aria-describedby="class-hint"><legend>Class</legend><div id="class-fields" class="choice-row"></div><p id="class-hint" class="hint"></p></fieldset>
<fieldset id="ability-scores" aria-describedby="ability-hint increase-error"><legend>Ability scores</legend>
<p id="ability-hint" class="hint"><span id="placing-hint">Place one roll on each ability; choosing a roll that is already placed swaps the two.</span> Your background then adds +2 and +1, or +1 to three abilities. To move a bonus, choose it on another ability. No score can exceed <span id="score-cap"></span>.</p>
<div id="reroll-controls" class="controls" hidden><button id="reroll" type="button" class="secondary">Reroll all six</button><p id="reroll-status" class="hint" role="status" tabindex="-1"></p></div>
<p id="points-status" class="hint" role="status" hidden></p><p id="scores-error" class="error" role="alert"></p>
<fieldset id="increase-mode" class="choice-row"><legend>Background increase</legend><label><input type="radio" name="increase-mode" id="increase-mode-two" value="two"> +2 and +1</label><label><input type="radio" name="increase-mode" id="increase-mode-three" value="three"> +1 to three</label></fieldset>
<div class="table-wrap"><table id="ability-table"><thead><tr><th scope="col">Ability</th><th scope="col" id="base-heading">Roll</th><th scope="col">Back&shy;ground</th><th scope="col" class="num">Score</th><th scope="col" class="num">Modi&shy;fier</th></tr></thead><tbody id="ability-rows"></tbody></table></div>
<p id="increase-error" class="error" role="alert"></p>
</fieldset>
<fieldset id="skills" aria-describedby="skills-count skills-error"><legend id="skills-legend">Skill proficiencies</legend><p id="skills-count" class="hint" role="status"></p><div id="skill-fields" class="checks"></div><p id="skills-error" class="error" role="alert"></p></fieldset>
<fieldset id="expertise" aria-describedby="expertise-count expertise-error" hidden><legend id="expertise-legend">Expertise</legend><p id="expertise-hint" class="hint"></p><p id="expertise-count" class="hint" role="status"></p><div id="expertise-fields" class="checks"></div><p id="expertise-error" class="error" role="alert"></p></fieldset>
<fieldset id="divine-order" hidden><legend>Divine Order</legend><div id="order-fields" class="checks"></div></fieldset>
<fieldset id="spells" aria-describedby="spells-count spells-error" hidden><legend>Spells</legend><p class="hint">Cantrips are cast at will; prepared spells use spell slots. Prepared spells change only between adventures, on the character sheet.</p><p id="spells-count" class="hint" role="status"></p><fieldset class="spell-group"><legend id="cantrips-legend">Cantrips</legend><div id="cantrip-fields" class="checks"></div></fieldset><fieldset id="spellbook-group" class="spell-group" hidden><legend id="spellbook-legend">Spellbook</legend><p class="hint">You prepare spells only from your spellbook.</p><div id="spellbook-fields" class="checks"></div></fieldset><fieldset class="spell-group"><legend id="prepared-legend">Prepared spells</legend><div id="prepared-fields" class="checks"></div></fieldset><p id="spells-error" class="error" role="alert"></p></fieldset>
<fieldset id="styles"><legend>Fighting Style</legend><div id="style-fields" class="checks"></div></fieldset>
<fieldset id="kits" aria-describedby="kits-hint"><legend>Starting kit</legend><p id="kits-hint" class="hint">Common gear only, each worth about the same. Better gear is found or bought in adventures.</p><div id="kit-fields" class="checks"></div></fieldset>
<fieldset id="masteries" aria-describedby="masteries-count masteries-error"><legend id="masteries-legend">Weapon Mastery</legend><p class="hint">A mastery works only while you wield that weapon.</p><p id="masteries-count" class="hint" role="status"></p><div id="mastery-fields" class="checks"></div><p id="masteries-error" class="error" role="alert"></p></fieldset>
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
<section id="sheet-adventures" aria-labelledby="sheet-adventures-title"><h3 id="sheet-adventures-title">Adventures</h3><div id="adventure-choices"></div><div id="abandon-confirm" class="confirm" hidden><p id="abandon-question"></p><div class="controls"><button id="confirm-abandon" type="button" class="primary danger">Abandon adventure</button><button id="cancel-abandon" type="button" class="secondary">Keep going</button></div></div><p id="start-error" class="error" role="alert"></p></section>
<div id="sheet-body"></div>
<div class="controls"><button id="delete-character" type="button" class="danger">Delete character</button></div>
</section>
<section id="adventure" class="panel" aria-labelledby="adventure-title" hidden>
<h2 id="adventure-title" class="visually-hidden" tabindex="-1"></h2>
<p id="adventure-objective" class="hint"></p>
<div id="session-layout"><div id="scene-backdrop" aria-hidden="true">${BACKDROPS.map((name) => BACKDROP_ART[name]).join("")}</div>
<div id="session-main">
<section id="session-character" aria-label="Character">
<section id="session-status" aria-label="Status"><div id="status-hp" class="status-hp"><p id="character-hp"></p><span class="hp-bar" aria-hidden="true"><span id="hp-fill" class="hp-fill"></span></span></div><p id="turn" aria-live="polite"></p><ul id="conditions" class="conditions" aria-label="Conditions"></ul><ul id="effects" class="conditions" aria-label="Spell effects"></ul><ul id="resources" class="resources"></ul><p id="gear-numbers"></p></section>
<div id="inventory-group"><h3 id="inventory-title">You carry</h3><div id="inventory"></div><p id="purse"></p><p id="carrying"></p></div>
<div id="rest-group" hidden><h3 id="rest-title">Rest</h3><div id="rest-fight" hidden><p class="rest-line">Not during a fight</p><p id="rest-counts" class="reason"></p></div><div id="short-rest"><p id="rest-summary" class="rest-line"></p><p id="rest-hint" class="hint">Each hit die spent heals its roll + Con. Only a long rest or a new adventure brings hit dice back.</p><div id="rest-controls" class="controls rest-panel"></div></div><div id="long-rest"><p id="long-rest-summary" class="rest-line"></p><div id="long-rest-controls" class="controls rest-panel"></div></div><details id="rest-rules"><summary>How resting works</summary><p id="rest-rules-text" class="hint">You have one hit die per level, its size set by your class. A short rest spends hit dice: each heals its roll + your Constitution modifier, and you stop spending them at full HP. It also brings back the feature uses that return on a short rest, but no hit dice. Short rests are counted per adventure, or per region in a long module, and the Settings page sets how many. A long rest, only at a safe place to rest, restores every hit point, hit die and feature use. You can rest only where no foes are left. Each new adventure starts with everything restored.</p></details></div>
</section>
<div id="session-scene">
<section id="session-actions" aria-label="Actions"><p id="adventure-error" class="error" role="alert"></p><section id="ending" aria-labelledby="ending-title" hidden><h3 id="ending-title" tabindex="-1"></h3><p id="ending-kind" class="tag"></p><p id="ending-text"></p><p id="ending-consequence"></p><div id="ending-rewards"></div><button id="ending-next" type="button" class="primary"></button></section><div id="action-bar"><div id="attack-controls" class="controls"></div><div id="feature-controls" class="controls"></div></div></section>
<section id="encounter" class="fight-panel" aria-labelledby="encounter-title" hidden><div id="fight-top"><h3 id="encounter-title">Fight</h3><p id="turn-order"></p></div>
<div id="fight-sides"><section id="fight-you" class="fight-side" aria-labelledby="fight-you-title"><h4 id="fight-you-title">You</h4><div id="you-card" class="fight-card"></div><div id="attack-chooser" hidden><div id="chooser-chips" role="radiogroup" aria-label="Attack with"></div><p id="chooser-detail"></p></div><div id="strike-control" class="controls"></div></section><section id="fight-foes" class="fight-side" aria-labelledby="fight-foes-title"><h4 id="fight-foes-title">Enemies</h4><ul id="foe-cards" aria-labelledby="fight-foes-title"></ul><div id="area-cast" class="controls"></div></section></div>
<div id="fight-foot"><div id="flee-control" hidden><button id="flee-toggle" type="button" class="danger" aria-expanded="false" aria-controls="flee-menu" aria-label="Flee"><span>Flee ▾</span></button><div id="flee-menu" hidden><p id="flee-attacks"></p><div id="flee-ways" role="group" aria-labelledby="flee-attacks"></div></div><span id="flee-reason" class="reason"></span></div><ul id="turn-resources" class="resources" aria-label="This turn"></ul><div id="end-controls"></div></div>
</section>
<section id="room" aria-labelledby="room-title"><p id="room-region" class="eyebrow dark" hidden></p><div id="room-heading"><h3 id="room-title"></h3><div id="leave-controls" class="controls"></div><button id="room-history-link" type="button" class="quiet" hidden>Description in history</button></div>
<div id="leave-confirm" class="confirm" hidden><p id="leave-question"></p><p id="leave-warning"></p><div class="controls"><button id="confirm-leave" type="button" class="primary" aria-describedby="leave-question leave-warning">Leave now</button><button id="cancel-leave" type="button" class="secondary">Stay</button></div></div>
<div id="room-actions" class="controls"></div>
<p id="room-alarm" class="alarm" role="status" hidden></p>
<button id="room-fold" type="button" class="quiet disclosure" aria-expanded="false" aria-controls="room-things" hidden></button>
<div id="room-things"><div id="creatures-group"><h4 id="creatures-title">Here</h4><ul id="creatures" class="things" aria-labelledby="creatures-title"></ul></div>
<div id="room-items-group"><h4 id="room-items-title">Items here</h4><ul id="room-items" class="things" aria-labelledby="room-items-title"></ul></div>
<div id="features-group"><h4 id="features-title">Look at</h4><ul id="features" class="things" aria-labelledby="features-title"></ul></div>
<div id="exits-group"><h4 id="exits-title">Ways on</h4><ul id="exits" class="things" aria-labelledby="exits-title"></ul></div>
<p id="room-empty" class="hint" hidden>There is nothing else here.</p></div>
</section>
</div>
</div>
<div id="session-composer"><form id="message-form" novalidate><label for="message">Tell the Dungeon Master what you do</label><div class="composer-row"><input id="message" maxlength="1000" autocomplete="off"><button id="send-message" type="submit" class="primary">Send</button></div><p id="composer-reason" class="reason"></p><p id="dm-notice" class="hint" hidden>${FIFTH_DM_OFF_NOTICE}</p></form></div>
<section id="session-history" aria-labelledby="history-title"><div id="history-panel"><h3 id="history-title">What happened</h3>
<ol id="log" class="log" aria-live="polite" aria-labelledby="history-title" tabindex="0"></ol></div></section>
</div>
<section id="shop" aria-labelledby="shop-title" hidden>
<div class="shop-sign">${SHOP_BELL}<div class="shop-heading"><h3 id="shop-title" tabindex="-1"></h3><p id="shop-greeting"></p></div><div class="shop-status"><p id="shop-purse"></p><p id="shop-load"></p></div><button id="leave-shop" type="button" class="secondary" aria-keyshortcuts="Escape">Leave the shop</button></div>
<p id="shop-terms" class="hint"></p>
<div class="shop-floor">${SHOP_SCENE}<div id="shop-columns">
<section id="shop-wares" aria-labelledby="shop-wares-title"><h4 id="shop-wares-title">Wares</h4><ul id="shop-ware-list" class="shop-list" aria-labelledby="shop-wares-title"></ul></section>
<section id="shop-details" aria-label="Details"><div id="shop-detail"></div></section>
<section id="shop-pack" aria-labelledby="shop-pack-title"><h4 id="shop-pack-title">Your pack</h4><div id="shop-pack-groups"></div></section>
</div></div>
<p id="shop-receipt" role="status" tabindex="-1"></p>
</section>
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
</dialog>
<dialog id="map-dialog" aria-labelledby="map-title">
<div class="map-head"><h2 id="map-title">Map</h2><div id="map-floors" role="group" aria-label="Floors" hidden></div><button id="close-map" type="button" class="secondary">Close</button></div>
<div class="map-body"><div id="map-view"><div id="map-canvas"></div></div>
<div class="map-side"><p class="hint">Choose a room next to yours to go there; one you have not explored has a dashed edge. Choose any other room to see what you found there. A ? is a way you have not taken from a room you have left.</p><p id="map-status" role="status"></p><div id="map-record" aria-live="polite" hidden></div><h3 id="map-key-title">Key</h3><ul id="map-key" class="map-key" aria-labelledby="map-key-title"></ul></div></div>
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
// - Map regions (#457): --color-region-0 to -5, the soft shades of a
//   module's regions on the map, in its regions' order.
// - Spacing: --space-1 (4px) to --space-6 (24px); radii --radius-sm/md/lg.
// - Buttons: every button takes exactly one variant class. `primary` is the
//   one main action of a region (library, creation form, sheet, room, fight,
//   composer, delete dialog); `secondary` is an outlined peer action; `quiet`
//   is a link-weight action such as going back; `danger` is an outlined
//   destructive action, and `primary danger` confirms one in a dialog.
// --ink, --gold, --line and --paper are older aliases of the colour tokens.
export const FIFTH_BROWSER_CSS = `:root{color-scheme:light;--color-ink:#263d3d;--color-ink-hover:#3a5451;--color-on-ink:#fff9e9;--color-paper:#f7f0e1;--color-surface:#fffaf0;--color-surface-hover:#efe5d0;--color-highlight:#efe2c0;--color-text:#292b27;--color-text-label:#4b4a3c;--color-text-muted:#615f50;--color-line:#d4c9b5;--color-control-border:#7a7260;--color-panel-border:#81785e;--color-gold:#d5b474;--color-gold-text:#7a6331;--color-discovery:#5b4a22;--color-on-dark:#f7edda;--color-night:#151f23;--color-night-light:#304043;--color-focus:#9a5a1c;--color-danger:#883c2d;--color-danger-hover:#9f4936;--color-danger-soft:#f3e0d8;--color-success:#2f6b3a;--color-warning:#8a5a00;--color-hp-healthy:var(--color-success);--color-hp-wounded:var(--color-warning);--color-hp-critical:var(--color-danger);--color-hp-down:var(--color-text-muted);--color-region-0:#e1ebd5;--color-region-1:#e4dbee;--color-region-2:#f2e0c4;--color-region-3:#d6e6ec;--color-region-4:#f0d8d3;--color-region-5:#e8e5c8;--font-serif:Georgia,serif;--font-sans:system-ui,sans-serif;--text-xs:.78rem;--text-sm:.85rem;--text-md:1rem;--text-lg:1.15rem;--text-xl:1.45rem;--text-2xl:1.75rem;--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;--space-6:24px;--radius-sm:6px;--radius-md:8px;--radius-lg:10px;--ink:var(--color-ink);--gold:var(--color-gold);--line:var(--color-line);--paper:var(--color-paper);font-family:var(--font-serif);color:var(--color-text);background:var(--color-night);font-size:17px;line-height:1.55}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top,var(--color-night-light),var(--color-night) 75%);min-height:100dvh;min-width:900px}h1,h2,h3,p{margin:0 0 var(--space-3)}h1{font-size:var(--text-2xl);line-height:1.1}h2{font-size:var(--text-xl);line-height:1.2}h3{font-size:var(--text-lg);margin-top:var(--space-4)}
button,legend,label,.eyebrow,.hint,.error,#feedback,table,.stats,.features{font-family:var(--font-sans)}button{font-size:var(--text-sm);border:1px solid var(--color-ink);background:transparent;color:var(--color-ink);padding:10px 14px;border-radius:var(--radius-sm);cursor:pointer;line-height:1.4}button:disabled{opacity:.55;cursor:default}button[aria-busy=true]{opacity:.8;cursor:progress}
button.primary{background:var(--color-ink);border-color:var(--color-ink);color:var(--color-on-ink)}button.primary:hover:not(:disabled){background:var(--color-ink-hover)}button.secondary:hover:not(:disabled){background:var(--color-surface-hover)}button.quiet{border-color:transparent;text-decoration:underline;text-underline-offset:3px}button.quiet:hover:not(:disabled){background:var(--color-surface-hover)}button.danger{border-color:var(--color-danger);color:var(--color-danger)}button.danger:hover:not(:disabled){background:var(--color-danger-soft)}button.primary.danger{background:var(--color-danger);color:var(--color-on-ink)}button.primary.danger:hover:not(:disabled){background:var(--color-danger-hover)}button.examined{color:var(--color-text-muted);border-color:var(--color-text-muted)}
:focus-visible{outline:3px solid var(--color-focus);outline-offset:3px}[tabindex="-1"]:focus{outline:none}[hidden]{display:none!important}
.skip{position:absolute;top:-100px;left:12px;background:var(--color-paper);padding:10px;z-index:20}.skip:focus{top:12px}
.masthead{max-width:860px;margin:auto;padding:6px var(--space-4);display:flex;align-items:center;gap:var(--space-1) var(--space-5);color:var(--color-on-dark)}.brand{display:flex;align-items:center;gap:var(--space-2)}.brand-mark{font-size:1.4rem;line-height:1;color:var(--color-gold)}.masthead h1{font-size:1.5rem;line-height:1;margin:0;white-space:nowrap}#adventure-meta{flex:1 0 auto;max-width:45%;margin:0;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:var(--text-sm) var(--font-sans)}.eyebrow{font-size:.62rem;letter-spacing:.18em;color:var(--color-gold);margin-bottom:6px}
main{max-width:860px;margin:0 auto var(--space-6);padding:0 var(--space-4)}.panel{background:var(--color-paper);border:1px solid var(--color-panel-border);border-radius:var(--radius-lg);padding:var(--space-5);margin-bottom:var(--space-4);min-width:0}
#feedback{color:var(--color-text);font-size:var(--text-sm);background:var(--color-surface);border:1px solid var(--color-control-border);border-left:4px solid var(--color-ink);border-radius:var(--radius-sm);padding:var(--space-2) var(--space-3)}#breadcrumb{flex:0 1 auto;min-width:0}#breadcrumb ol{list-style:none;display:flex;padding:0;margin:0;font:var(--text-sm) var(--font-sans);color:var(--color-on-dark);white-space:nowrap}#breadcrumb li{flex:none}#breadcrumb li:last-child{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}#breadcrumb li+li::before{content:"›"/"";margin:0 var(--space-2);color:var(--color-gold)}#breadcrumb a{color:var(--color-gold)}#breadcrumb-list:empty{display:none}#feedback:empty{display:none}.hint{font-size:var(--text-sm);color:var(--color-text-muted)}.error{color:var(--color-danger);font-size:var(--text-sm);font-weight:600}.error:empty{display:none}
.list{list-style:none;padding:0;margin:0 0 14px;display:grid;gap:var(--space-2)}.character-row{display:flex;gap:var(--space-2)}.list button{background:var(--color-surface);color:var(--color-text);border-color:var(--color-control-border)}.list button:hover{background:var(--color-surface-hover)}.open-character{flex:1 1 0;min-width:0;text-align:left;display:flex;flex-direction:column}.continue-adventure{flex:0 0 auto}.character-name{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-1) var(--space-2)}.list strong{font:600 var(--text-md) var(--font-serif);overflow-wrap:anywhere}.character-stats{font-size:var(--text-xs);color:var(--color-text-muted)}.character-row .tag{color:var(--color-ink)}.character-row.defeated .open-character{background:var(--color-paper);border-style:dashed}.character-row.defeated strong,.character-row.defeated .tag{color:var(--color-text-muted)}
.dice{display:flex;gap:3px;margin-top:var(--space-1)}.die{display:inline-grid;place-items:center;width:22px;height:22px;border:1px solid var(--color-control-border);border-radius:var(--radius-sm);background:var(--color-surface);font-weight:700;font-size:var(--text-xs)}.die.dropped{color:var(--color-text-muted);text-decoration:line-through;border-style:dashed}
fieldset{border:1px solid var(--color-line);border-radius:var(--radius-md);margin:0 0 14px;padding:var(--space-3);min-width:0}legend{font-weight:600;font-size:.9rem;padding:0 var(--space-1)}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-2) 14px}.grid label{display:flex;flex-direction:column;font-size:.82rem;font-weight:600}select,input{font:var(--text-md) var(--font-sans);padding:var(--space-2);border:1px solid var(--color-control-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text);width:100%;min-width:0;margin-top:var(--space-1)}label[for=character-name]{display:block;font-weight:600;font-size:var(--text-sm)}
.checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px 14px}.checks label{display:flex;gap:var(--space-2);align-items:flex-start;font-size:var(--text-sm)}.checks input{width:auto;padding:0;margin-top:var(--space-1);flex:none;accent-color:var(--color-ink)}.checks small{display:block;color:var(--color-text-muted);font-weight:400}.checks input:disabled+span{color:var(--color-text-muted)}
#preview{border-top:1px solid var(--color-line);margin-top:var(--space-4)}.stats{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:.88rem;margin:0 0 10px;padding:0;list-style:none}.stats li strong{margin-left:var(--space-1)}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;font-size:var(--text-sm);width:100%;margin-bottom:var(--space-3)}th,td{border-bottom:1px solid var(--color-line);padding:5px 6px;text-align:left}th{font-weight:600;color:var(--color-text-label)}
dialog{background:var(--color-paper);color:var(--color-text);border:1px solid var(--color-panel-border);border-radius:var(--radius-lg);padding:var(--space-5);width:min(480px,calc(100vw - 32px));max-width:none}dialog::backdrop{background:rgba(10,16,18,.7)}dialog label{display:block;font-weight:600;font-size:var(--text-sm);overflow-wrap:anywhere}
.masthead #open-settings{order:2;display:grid;place-items:center;padding:2px 6px;color:var(--color-on-dark);border-color:var(--color-gold)}#open-settings svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}.masthead #open-settings:hover{background:var(--color-night-light)}.masthead:not(:has(#sound-controls)) #open-settings{margin-left:auto}#settings-list{display:grid;gap:var(--space-3);margin-bottom:var(--space-3)}.setting{border:1px solid var(--color-line);border-radius:var(--radius-md);background:var(--color-surface);padding:var(--space-2) var(--space-3);margin:0}.setting legend{font:600 var(--text-md) var(--font-sans);padding:0 var(--space-1)}.setting .hint{margin:0 0 var(--space-2)}.setting-choices{display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-4);font:var(--text-sm) var(--font-sans)}.setting-choices label{display:flex;align-items:center;gap:6px}.setting-choices input{width:auto;margin:0;accent-color:var(--color-ink)}.setting-choices .tag{color:var(--color-text-muted)}#settings-sound-volume{width:10rem;margin:0;padding:0;border:0;background:none;accent-color:var(--color-ink);vertical-align:middle}#settings-sound-volume-value{display:inline-block;min-width:3em;font-variant-numeric:tabular-nums}#settings-in-progress{border:1px solid var(--color-gold);border-left:4px solid var(--color-gold-text);border-radius:var(--radius-sm);background:var(--color-highlight);padding:var(--space-2) var(--space-3);font:600 var(--text-sm) var(--font-sans)}
.masthead #open-map{margin-left:var(--space-2);padding:2px 14px;color:var(--color-on-dark);border-color:var(--color-gold)}.masthead #open-map:hover{background:var(--color-night-light)}
#sound-controls{order:1;display:flex;align-items:center;gap:var(--space-2);margin-left:auto}.masthead:has(#adventure-meta:not([hidden])) #sound-controls{margin-left:0}.masthead #sound-mute{display:grid;place-items:center;padding:2px 6px;color:var(--color-on-dark);border-color:var(--color-gold)}.masthead #sound-mute:hover{background:var(--color-night-light)}#sound-mute svg{width:20px;height:20px;fill:currentColor}#sound-mute :is(.waves,.cross){fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}#sound-mute .cross,#sound-mute[aria-pressed=true] .waves{display:none}#sound-mute[aria-pressed=true] .cross{display:inline}#sound-volume{width:4rem;margin:0;padding:0;border:0;background:none;accent-color:var(--color-gold)}
#map-dialog{width:min(1240px,calc(100vw - 32px));height:min(860px,calc(100dvh - 32px));max-height:none;padding:var(--space-4)}#map-dialog[open]{display:flex;flex-direction:column}
.map-head{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2) var(--space-4);margin-bottom:var(--space-3)}.map-head h2{margin:0}#map-floors{display:flex;flex-wrap:wrap;gap:var(--space-1)}#map-floors button{padding:3px 10px}#map-floors button[aria-pressed=true]{background:var(--color-ink);color:var(--color-on-ink)}#close-map{margin-left:auto}
.map-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 14rem;gap:var(--space-4)}#map-view{overflow:auto;border:1px solid var(--color-line);border-radius:var(--radius-md);background:var(--color-surface)}#map-canvas{position:relative;margin:auto}
.map-lines{position:absolute;inset:0;pointer-events:none}.map-lines line{stroke:var(--color-ink);stroke-width:3}.map-lines line.closed{stroke:var(--color-danger);stroke-dasharray:7 5}
.map-room{position:absolute;display:flex;flex-direction:column;border:1.5px solid var(--color-ink);border-radius:var(--radius-sm);background:var(--map-shade,var(--color-paper));overflow:hidden}.map-room.current{border-width:3px;box-shadow:0 0 0 3px var(--color-gold)}
.map-room>button{flex:1;min-height:0;border:0;border-radius:0;padding:2px 4px;font:600 var(--text-xs)/1.2 var(--font-sans);color:var(--color-text);text-decoration:none;overflow:hidden;overflow-wrap:anywhere}.map-here{display:block;font-weight:400;color:var(--color-gold-text)}
.map-climbs{list-style:none;margin:0;padding:0 2px 2px;display:grid;gap:1px}.map-climb{display:block;width:100%;padding:0 3px;border:1px solid var(--color-control-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text);font:11px/1.35 var(--font-sans);text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}button.map-climb{border-color:var(--color-ink);color:var(--color-ink)}
.map-stub.named{align-content:center;gap:2px;padding:4px;border-radius:var(--radius-sm);font:600 var(--text-xs)/1.2 var(--font-sans);text-align:center;overflow:hidden;overflow-wrap:anywhere}.map-stub-note{font-weight:400;color:var(--color-text-muted)}.map-stub{position:absolute;padding:0;display:grid;place-items:center;border:1.5px dashed var(--color-control-border);border-radius:50%;background:var(--color-surface);font:700 var(--text-md) var(--font-sans);color:var(--color-text-muted)}button.map-stub{border-color:var(--color-ink);color:var(--color-ink)}
.map-mark{position:absolute;display:grid;place-items:center;border:1.5px solid var(--color-ink);border-radius:50%;background:var(--color-surface);font:700 11px/1 var(--font-sans);color:var(--color-ink)}.map-mark.trap,.map-mark.closed{border-color:var(--color-danger);color:var(--color-danger)}
.map-side{min-height:0;overflow-y:auto;font:var(--text-sm) var(--font-sans)}.map-side h3{font:600 var(--text-sm) var(--font-sans);margin:var(--space-3) 0 var(--space-1);color:var(--color-text-label)}.map-side .hint{margin-bottom:var(--space-2)}#map-status{color:var(--color-danger);font-weight:600}#map-status:empty{display:none}#map-record h4{margin-top:0}#map-record .things{font-size:var(--text-xs)}
.map-key{list-style:none;padding:0;margin:0;display:grid;gap:var(--space-1);font-size:var(--text-xs)}.map-key li{display:flex;align-items:center;gap:var(--space-2)}.map-key :is(.map-mark,.map-stub){position:static;flex:none;margin:0;width:20px;height:20px;font-size:11px}.map-swatch{flex:none;width:20px;height:14px;border:1px solid var(--color-ink);border-radius:var(--radius-sm);background:var(--map-shade)}
.features{font-size:var(--text-sm);padding-left:18px}.features li{margin:6px 0}.controls{display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-3)}
.eyebrow.dark{color:var(--color-gold-text)}#sheet-adventures h3{margin-top:0}#adventure-choices{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-2);margin-bottom:var(--space-3)}#adventure-choices>:not(.adventure-choice){grid-column:1/-1;justify-self:start;margin:0}.adventure-choice{display:flex;flex-direction:column;align-items:flex-start;gap:var(--space-2);border:1px solid var(--color-control-border);border-radius:var(--radius-md);background:var(--color-surface);padding:10px var(--space-3)}.adventure-choice p{margin:0}.choice-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-2);width:100%}.choice-head button{flex:0 0 auto}.tags{display:flex;flex-wrap:wrap;gap:var(--space-1)}.tag.level{color:var(--color-text-muted)}.tag.easy{color:var(--color-success)}.tag.medium{color:var(--color-warning)}.tag.hard{color:var(--color-danger)}#adventure-choices .level-choice-notice{border:1px solid var(--color-gold);border-left:4px solid var(--color-gold-text);border-radius:var(--radius-sm);background:var(--color-highlight);padding:var(--space-2) var(--space-3);font:600 var(--text-md) var(--font-sans);color:var(--color-text)}.defeat-notice{color:var(--color-danger);font:600 var(--text-md) var(--font-sans)}
#turn{font-family:var(--font-sans);font-weight:600}tr.current{background:var(--color-highlight)}tr.defeated td,tr.defeated th{color:var(--color-text-muted);font-weight:400}.tag{display:inline-block;padding:0 6px;border:1px solid currentColor;border-radius:999px;font:600 var(--text-xs)/1.5 var(--font-sans);white-space:nowrap}
.log{position:relative;list-style:none;padding:0;margin:0 0 var(--space-3);display:grid;gap:var(--space-2);font-family:var(--font-sans);font-size:.88rem}.log li{border-left:3px solid transparent;padding:var(--space-1) 10px}.log li.newest{border-left-color:var(--color-gold)}.log li:focus{outline:3px solid var(--color-focus);outline-offset:1px}.log p{margin:0}.log .reply.pending{color:var(--color-text-muted)}
.log li>:first-child{margin-top:0}.arrival-room{font-weight:700}.log .reply::before,.card.rejection::before{display:block;font-size:var(--text-xs);font-weight:600;color:var(--color-text-label)}.log .reply::before{content:"Dungeon Master"/""}
.card,.log .player,.log .reply,.log .narration{background:var(--color-surface);border:1px solid var(--color-line);border-radius:var(--radius-sm);padding:6px 10px;margin-top:6px}.card.rejection{border-color:var(--color-danger);background:var(--color-danger-soft)}.card.rejection::before{content:"Action rejected"/"";color:var(--color-danger)}
.log .roll{color:var(--color-text-muted);font-size:var(--text-xs);margin-top:2px}.compact .who{font-weight:600}.compact .tag,.compact .roll-die{display:inline}.compact *{line-height:1}.card.has-more{position:relative;margin-top:10px}.card-more::before{content:"▸ "/""}.card-more[aria-expanded=true]::before{content:"▾ "/""}.card.has-more>.card-more{position:absolute;top:0;right:var(--space-2);transform:translateY(-50%);padding:0 4px;font-size:var(--text-xs);line-height:1.3;color:var(--color-text-label);background:inherit}.full-text{white-space:pre-line;margin-top:var(--space-1);font-size:var(--text-sm)}.initiative-how{font:var(--text-xs) var(--font-sans);color:var(--color-text-muted);margin-top:2px}.initiative-how summary{cursor:pointer;width:max-content;color:var(--color-text-label)}.initiative-how p{margin-top:2px}.roll-label{font-weight:600;color:var(--color-text-label)}.roll-die{display:inline-block;padding:0 4px;border:1px solid var(--color-control-border);border-radius:var(--radius-sm);background:var(--color-paper);color:var(--color-text);font-variant-numeric:tabular-nums;white-space:nowrap}.roll-die.dropped{border-style:dashed;color:var(--color-text-muted);text-decoration:line-through}.roll strong{color:var(--color-text);font-size:var(--text-sm)}.tag.hit,.tag.critical,.tag.success{color:var(--color-success)}.tag.miss{color:var(--color-text-muted)}.tag.failure{color:var(--color-danger)}.roll-die.counted{font-weight:700}.tag.applies{color:var(--color-success)}.tag.no-effect{color:var(--color-text-muted)}.style-use-line{font:var(--text-sm) var(--font-sans)}
h4{font:600 var(--text-sm) var(--font-sans);margin:var(--space-3) 0 6px;color:var(--color-text-label)}.things{list-style:none;padding:0;margin:0;display:grid;gap:6px;font-family:var(--font-sans);font-size:var(--text-sm)}.things li{border:1px solid var(--color-line);border-radius:var(--radius-sm);padding:6px 10px;background:var(--color-surface)}.things li.none{border:0;background:none;padding:0;color:var(--color-text-muted)}.things p{margin:0}.things .discovery{color:var(--color-discovery);margin-top:var(--space-1)}.things .controls{margin-top:6px}#sale-confirm,#sell-all-confirm{margin:var(--space-2) 0 0}#room-alarm{color:var(--color-danger);font-weight:600}#room-heading{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--space-1) var(--space-3)}#room .controls:empty{display:none}#room #leave-controls,#room-actions{margin:0}#room #room-history-link{display:inline-block;padding:1px 6px;font-size:var(--text-xs)}#room-actions{margin-bottom:var(--space-2)}#leave-controls button{padding:1px 10px;border-radius:999px;border-color:var(--color-gold);color:var(--color-gold-text);font-size:var(--text-xs);font-weight:600}#room #leave-confirm{margin:0 0 var(--space-2)}.thing-head{display:flex;flex-wrap:wrap;align-items:flex-start;gap:var(--space-1) var(--space-3)}.thing-text{flex:1 1 14em;min-width:0;overflow-wrap:anywhere;padding-top:3px}.things .thing-controls{flex:0 1 auto;justify-content:flex-end;gap:var(--space-1) var(--space-2);margin:0 0 0 auto;min-width:0}.thing-controls .action{align-items:flex-end;max-width:16em}.ask-row{display:flex;flex-wrap:wrap;align-items:flex-start;gap:var(--space-1) var(--space-2);margin-top:6px}.ask-label{font-size:var(--text-xs);font-weight:600;color:var(--color-text-label);padding-top:7px}#purse,#carrying{font:var(--text-sm) var(--font-sans);margin:6px 0 0}.things button{padding:6px 10px}.things li.opponents-card{display:grid;gap:var(--space-2);border:2px solid var(--color-danger);border-left-width:6px;background:linear-gradient(var(--color-danger-soft),var(--color-surface));padding:var(--space-2) var(--space-3)}.opponents-state{justify-self:start;margin:0;color:var(--color-on-ink);background:var(--color-danger);border-color:var(--color-danger)}.opponent{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 var(--space-2);overflow-wrap:anywhere}.opponent-name{font:700 var(--text-lg)/1.3 var(--font-sans);color:var(--color-danger)}.things .opponent>.icon{width:1.9em;height:1.9em;margin:0;align-self:center;color:var(--color-danger)}.opponent-text{flex:1 1 14em;min-width:0}.things .opponents-controls{justify-content:flex-start;margin:0}.opponents-controls .action{align-items:flex-start}#character-hp{font-weight:600}
#ending{flex-basis:100%;border:2px solid var(--ending-color);border-left-width:6px;border-radius:var(--radius-md);background:var(--color-surface);padding:var(--space-3);font-family:var(--font-sans)}#ending[data-kind=victory]{--ending-color:var(--color-success)}#ending[data-kind=escape-with-loot]{--ending-color:var(--color-gold-text)}#ending[data-kind=escape-without-loot]{--ending-color:var(--color-ink)}#ending[data-kind=defeat]{--ending-color:var(--color-danger)}#ending-rewards h4{margin:var(--space-2) 0 var(--space-1)}#ending-rewards ul{margin:0 0 var(--space-2);padding-left:18px;font-size:var(--text-sm)}.level-up{border:1px solid var(--color-gold);border-radius:var(--radius-md);background:var(--color-highlight);padding:var(--space-2) var(--space-3);margin:0 0 var(--space-2)}.level-up h4{margin-top:0;color:var(--color-text)}#level-choice{margin:var(--space-3) 0}#level-choice h3{margin-top:0}#level-choice ul{padding-left:18px;font-size:var(--text-sm)}#level-choice h4{margin-top:var(--space-3)}#level-choice fieldset{background:var(--color-surface)}#level-choice .choice-row{background:none}#ending .level-up p{margin:0}#level-up-features{list-style:none;margin:var(--space-1) 0 0;padding:0;font-size:var(--text-sm)}#level-up-features summary{cursor:pointer;padding:var(--space-1) 0;font-weight:600}#ending #level-up-features p{margin:0 0 var(--space-1) 1.1em}.confirm{flex-basis:100%;border:1px solid var(--color-control-border);border-left:4px solid var(--color-ink);border-radius:var(--radius-md);background:var(--color-surface);padding:var(--space-3);margin-bottom:var(--space-3);font-family:var(--font-sans)}.confirm p{margin:0;font-size:var(--text-sm)}#leave-warning{margin-top:var(--space-1);font-weight:600;color:var(--color-danger)}#leave-warning:empty{display:none}#leave-confirm:has(#leave-warning:not(:empty)){border-left-color:var(--color-danger)}#session-actions .confirm{margin-bottom:0}#ending h3{margin:0 0 var(--space-1);font-family:var(--font-serif)}#ending-kind{color:var(--ending-color);margin:0 0 var(--space-2)}#ending p:not(.tag){margin:0 0 var(--space-2);font-size:var(--text-sm)}#ending-consequence{font-weight:600;color:var(--color-danger)}#ending-consequence:empty{display:none}#ending-next{margin-top:var(--space-1)}#composer-reason{margin:var(--space-1) 0 0}#composer-reason:empty{display:none}#message-form label{display:block;font-weight:600;font-size:var(--text-sm)}
#session-layout{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);grid-template-rows:minmax(0,1fr) auto;gap:0 var(--space-5)}#session-status p{margin:0}#session-main{display:flex;flex-direction:column;min-width:0;min-height:0;overflow-y:auto;padding-right:var(--space-2)}#session-character{display:contents}#inventory-group,#rest-group{order:1}#session-status{order:-1;position:sticky;top:0;z-index:1;background:var(--color-paper);padding-bottom:var(--space-3)}
@media(min-width:1500px){#session-layout{grid-template-columns:minmax(0,4fr) minmax(0,6fr) minmax(0,5fr)}#session-main{display:contents}#session-scene{min-height:0;overflow-y:auto;padding-right:var(--space-2)}#session-character{display:flex;flex-direction:column;min-width:0;min-height:0;overflow-y:auto;padding-right:var(--space-2)}}
#session-character h3{font:600 var(--text-sm) var(--font-sans);margin:var(--space-3) 0 6px;color:var(--color-text-label)}#inventory{display:grid;gap:var(--space-2)}.carry-title{font:600 var(--text-xs) var(--font-sans);color:var(--color-text-muted);margin:0 0 2px}summary.carry-title{cursor:pointer;padding:2px 0}.carry-list{list-style:none;padding:0;margin:0;font:var(--text-sm) var(--font-sans)}.carry-list li{display:grid;grid-template-columns:minmax(min(10em,50%),1fr) auto;align-items:center;gap:2px var(--space-2);padding:3px 0;border-top:1px solid var(--color-line)}.carry-list li:first-child{border-top:0}.carry-line,.carry-more>summary{margin:0;line-height:1.4;overflow-wrap:anywhere}.carry-line{padding-left:1.1em}.carry-more>summary{cursor:pointer;list-style:none}.carry-more>summary::-webkit-details-marker{display:none}.carry-more>summary::before{content:"▸"/"";display:inline-block;width:1.1em;color:var(--color-text-muted)}.carry-more[open]>summary::before{content:"▾"/""}.carry-state{margin-left:var(--space-1);font-size:var(--text-xs);color:var(--color-text-muted)}.carry-text{margin:2px 0 0 1.1em;font-size:var(--text-xs);color:var(--color-text-muted)}.item-stats{list-style:none;margin:2px 0 0 1.1em;padding:0;font:var(--text-xs) var(--font-sans);color:var(--color-text-muted)}.item-stats li{margin:0;padding:0;border:0;display:block}.item-compare{margin:2px 0 0 1.1em;font:600 var(--text-xs) var(--font-sans)}.stats-more{flex-basis:100%;font:var(--text-xs) var(--font-sans)}.stats-more>summary{cursor:pointer;color:var(--color-text-muted);width:max-content}.stats-more .item-stats,.stats-more .item-compare{margin-left:0}.carry-list .controls{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--space-1);margin:0}.carry-list .controls[hidden]{display:none}.carry-list .controls:has(.confirm){grid-column:1/-1}.carry-list .action{flex-direction:row-reverse;align-items:center;gap:var(--space-1)}#inventory button{padding:3px 8px;font-size:var(--text-xs)}
#gear-numbers{flex-basis:100%}#session-status{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-1) 6px;font:var(--text-xs) var(--font-sans)}#character-hp{font-size:var(--text-sm)}.status-hp{display:grid;justify-items:start;gap:2px;white-space:nowrap;--hp-color:var(--color-hp-healthy)}.status-hp[data-health=bloodied]{--hp-color:var(--color-hp-wounded)}.status-hp[data-health=critical]{--hp-color:var(--color-hp-critical)}.status-hp[data-health=down]{--hp-color:var(--color-hp-down)}.status-hp .tag{color:var(--hp-color)}.hp-bar{display:block;justify-self:stretch;height:6px;border:1px solid var(--color-control-border);border-radius:999px;background:var(--color-surface);overflow:hidden}.hp-fill{display:block;height:100%;width:0;background:var(--hp-color)}#turn{white-space:nowrap;font-weight:400}#turn:empty{display:none}.conditions{display:contents}.conditions li{display:flex}.tag.effect{color:var(--color-text-label)}.effect-until{color:var(--color-text-muted)}.action.cast-choice{flex-direction:row;flex-wrap:wrap;align-items:center;gap:var(--space-1)}.cast-choice select{width:auto;max-width:100%;margin:0}.cast-targets{display:inline-flex;flex-wrap:wrap;align-items:center;gap:var(--space-1) var(--space-2)}.cast-targets label{display:inline-flex;align-items:center;gap:var(--space-1);font-size:var(--text-sm)}.cast-targets input{width:auto;margin:0}.tag.condition{color:var(--color-danger)}
.resources{display:contents}.resources li{display:flex;align-items:center;gap:3px;white-space:nowrap;font-size:.72rem}.pips{display:inline-flex;gap:2px}.pip{width:9px;height:9px;border:1.5px solid var(--color-ink);border-radius:50%}.pip.full{background:var(--color-ink)}.visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}#session-scene{min-width:0}#session-scene>#session-actions+section h3{margin-top:0}#session-layout{isolation:isolate}#session-main,#scene-backdrop{grid-area:1/1}#session-composer{grid-area:2/1}#session-history{grid-area:1/2/3/3}#scene-backdrop{position:relative;z-index:-1;min-width:0;overflow:hidden;color:var(--color-line);opacity:.3;pointer-events:none}#scene-backdrop svg{position:absolute;inset:0;width:100%;height:100%}@media(min-width:1500px){#session-character{grid-area:1/1/3/2}#session-scene,#scene-backdrop{grid-area:1/2}#session-composer{grid-area:2/2}#session-history{grid-area:1/3/3/4}}
#session-history{display:flex;flex-direction:column;min-width:0;min-height:0;border-left:1px solid var(--color-line);padding-left:var(--space-5)}#session-actions{display:flex;flex-wrap:wrap;gap:var(--space-2)}#session-actions:has(.error:not(:empty),#ending:not([hidden]),.controls:not(:empty)){margin-bottom:var(--space-4)}#session-composer{min-width:0;border-top:1px solid var(--color-line);padding:var(--space-2) var(--space-2) 0 0;margin-top:var(--space-2)}
.controls.rest-panel{align-items:flex-end;margin:var(--space-1) 0 var(--space-2)}.rest-line,#rest-counts{margin:0;font:var(--text-sm) var(--font-sans);overflow-wrap:anywhere}.rest-line b{font-weight:600}#rest-fight{margin-bottom:var(--space-2)}#rest-rules{font:var(--text-sm) var(--font-sans)}#rest-rules p,#rest-hint{margin:var(--space-1) 0 0}#rest-controls label{display:inline-flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm)}#rest-controls select{width:auto;margin:0}:is(#session-actions,#encounter) .controls{margin-top:0;min-width:0;max-width:100%}:is(#session-actions,#encounter) .controls:empty{display:none}#action-bar{display:contents}.action{display:inline-flex;flex-direction:column;align-items:flex-start;gap:2px;max-width:100%;min-width:0}.action button{max-width:100%}:is(#action-bar,#encounter,#room,#inventory,#shop-detail,.rest-panel) button{display:inline-grid}:is(#action-bar,#encounter,#room,#inventory,#shop-detail,.rest-panel) button>span,:is(#action-bar,#encounter,#room,#inventory,#shop-detail,.rest-panel) button::after{grid-area:1/1}:is(#action-bar,#encounter,#room,#inventory,#shop-detail,.rest-panel) button::after{content:attr(data-busy-label);visibility:hidden}:is(#action-bar,#encounter,#room,#inventory,#shop-detail,.rest-panel) button[aria-busy=true]>span{visibility:hidden}:is(#action-bar,#encounter,#room,#inventory,#shop-detail,.rest-panel) button[aria-busy=true]::after{visibility:visible}.reason{font:var(--text-xs) var(--font-sans);color:var(--color-text-muted)}.approach,.retry{font:var(--text-xs) var(--font-sans);color:var(--color-text-label)}#session-actions .error{margin:0;flex-basis:100%}#history-panel{flex:0 0 50%;display:flex;flex-direction:column;min-height:0;border:1px solid var(--color-panel-border);border-radius:var(--radius-md);padding:var(--space-2) var(--space-2) 0 var(--space-3)}#history-title{margin:0 0 var(--space-2)}#log{flex:1;align-content:start;overflow-y:auto;overscroll-behavior:contain;margin:0;padding-right:var(--space-1)}#log::after{content:"";height:var(--turn-room,0px)}.composer-row{display:flex;gap:var(--space-2);margin-top:var(--space-1)}.composer-row input{flex:1;margin:0}#dm-notice{margin:var(--space-1) 0 0}
button.disclosure{padding:6px 2px;margin-bottom:var(--space-2)}button.disclosure::before{content:"▸ "/"";display:inline-block;width:1.1em}button.disclosure[aria-expanded=true]::before{content:"▾ "/""}#rest-rules summary{cursor:pointer;color:var(--color-ink);text-decoration:underline;text-underline-offset:3px;padding:var(--space-1) 0}:is(#session-actions,#encounter) .controls.rows{display:grid;gap:var(--space-3);flex-basis:100%}.action-row{display:grid;gap:var(--space-1)}.row-label{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--space-2);font:600 var(--text-sm) var(--font-sans);line-height:1.4;color:var(--color-text-label)}.row-label:empty{display:none}.row-uses{font:400 var(--text-xs) var(--font-sans);color:var(--color-text-muted)}.row-controls{display:flex;flex-wrap:wrap;align-items:flex-start;gap:var(--space-2);min-width:0}.row-controls select{font-size:var(--text-sm);line-height:1.4;padding:10px var(--space-2);width:auto;max-width:100%;margin:0}.end-line{justify-content:flex-end;flex-wrap:nowrap}.end-note{font:var(--text-sm) var(--font-sans);color:var(--color-text-muted)}.joiner,.reach{font:var(--text-sm) var(--font-sans);color:var(--color-text-label)}.row-line{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);flex-basis:100%}.strike-choice{flex-direction:row;align-items:center;gap:var(--space-1);font:var(--text-sm) var(--font-sans);color:var(--color-text-label)}.strike-choice select{width:auto;margin:0}
body:has(#adventure:not([hidden])){height:100dvh;min-height:560px;display:flex;flex-direction:column}body:has(#adventure:not([hidden])) .masthead,body:has(#adventure:not([hidden])) main{max-width:1240px;width:100%}body:has(#adventure:not([hidden])) main{flex:1;min-height:0;display:flex;flex-direction:column;margin-bottom:0}#adventure{flex:1;min-height:0;display:flex;flex-direction:column;padding-top:var(--space-2)}#adventure-objective{margin-bottom:var(--space-2);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(min-width:1500px){body:has(#adventure:not([hidden])) .masthead,body:has(#adventure:not([hidden])) main{max-width:1880px}}
.choice-row{border:0;padding:0;margin:0 0 var(--space-2);display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-4);font-family:var(--font-sans);font-size:var(--text-sm)}.choice-row legend{float:left;width:100%;padding:0;margin-bottom:var(--space-1)}.choice-row label{display:flex;align-items:center;gap:6px}.choice-row input{width:auto;margin:0;accent-color:var(--color-ink)}
#ability-table th,#ability-table td{vertical-align:middle;padding:var(--space-1)}#ability-table select{margin:0;padding:6px var(--space-1);min-width:5.5em}#ability-table .bonus select{min-width:3.2em}#ability-table .num{text-align:right;font-variant-numeric:tabular-nums}#ability-table td.num{white-space:nowrap}#ability-table .score{font-weight:700}#ability-table .cap{display:block;font-weight:400;font-size:var(--text-xs);color:var(--color-text-muted)}.bonus-check{display:inline-flex;align-items:center;gap:6px}.bonus-check input{width:auto;margin:0;accent-color:var(--color-ink)}#preview-status:empty{display:none}
.icon{display:inline-block;flex:none;width:1.6em;height:1.6em;vertical-align:-.45em;margin:-.3em .3em -.3em 0;fill:currentColor;color:var(--color-ink)}:is(.card-name,.things,.carry-list,#purse) .icon{width:1.3em;height:1.3em;vertical-align:-.3em;margin:-.15em .25em -.15em 0}.compact .icon{width:1.15em;height:1.15em;vertical-align:-.2em;margin:-.2em .2em -.2em 0}#credits{margin-top:var(--space-5)}#credits p{margin:0 0 var(--space-1)}
#shop{flex:1;min-height:0;display:flex;flex-direction:column;gap:var(--space-3);padding-top:var(--space-2);font-family:var(--font-sans)}.shop-sign{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2) var(--space-4);background:var(--color-ink);color:var(--color-on-dark);border-bottom:3px solid var(--color-gold);border-radius:var(--radius-md) var(--radius-md) 0 0;padding:var(--space-2) var(--space-4)}.shop-sign p{margin:0}.shop-bell{flex:none;width:30px;height:30px;fill:var(--color-gold)}.shop-heading{flex:1 1 0;min-width:12rem}#shop-title{margin:0;font-family:var(--font-serif);color:var(--color-on-ink)}.shop-open{margin-left:var(--space-2);font:600 var(--text-xs) var(--font-sans);color:var(--color-gold);white-space:nowrap}#shop-greeting{font:italic var(--text-sm) var(--font-serif)}.shop-status{display:flex;flex-direction:column;align-items:flex-end;gap:var(--space-1);font-size:var(--text-sm)}.shop-sign #leave-shop{color:var(--color-on-dark);border-color:var(--color-gold)}.shop-sign #leave-shop:hover:not(:disabled){background:var(--color-night-light)}.shop-sign .icon{color:var(--color-gold)}#shop-terms{margin:0}
.shop-floor{position:relative;flex:1;min-height:0;display:flex;flex-direction:column}.shop-scene{position:absolute;inset:0;width:100%;height:100%;color:var(--color-line);opacity:.5;pointer-events:none}#shop-columns{position:relative}
#shop-columns{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"wares pack" "details details";align-content:start;gap:var(--space-3) var(--space-5);overflow-y:auto;padding-right:var(--space-2)}#shop-wares{grid-area:wares;min-width:0}#shop-details{grid-area:details;min-width:0}#shop-pack{grid-area:pack;min-width:0}#shop-columns h4{margin-top:0}
@media(min-width:1100px){#shop-columns{grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) minmax(0,1fr);grid-template-areas:"wares details pack";grid-template-rows:minmax(0,1fr);overflow:visible;padding-right:0}#shop-columns>section{min-height:0;overflow-y:auto;padding-right:var(--space-2)}}
#shop-details{align-self:start;border:1px solid var(--color-control-border);border-radius:var(--radius-md);background:var(--color-surface);padding:var(--space-3)}#shop-detail p{margin:0 0 var(--space-2);font-size:var(--text-sm)}#shop-item-name{margin:0 0 var(--space-2);font:600 var(--text-md) var(--font-serif);color:var(--color-text)}#shop-detail .item-stats{margin:0 0 var(--space-2);font-size:var(--text-sm);color:var(--color-text)}#shop-detail .item-compare{margin:0 0 var(--space-1);font-size:var(--text-sm)}#shop-detail .action{margin-top:var(--space-2)}#shop-detail .shop-note{color:var(--color-text-muted)}
.shop-list{list-style:none;padding:0;margin:0;display:grid;gap:var(--space-1)}.shop-item{display:flex;width:100%;align-items:center;justify-content:space-between;gap:var(--space-2);padding:var(--space-1) var(--space-2);border-color:transparent;color:var(--color-text);text-align:left}.shop-item[aria-pressed=true]{background:var(--color-highlight);border-color:var(--color-ink)}.shop-name{min-width:0;overflow-wrap:anywhere}.shop-state{margin-left:var(--space-1);font-size:var(--text-xs);color:var(--color-text-muted)}.shop-price{flex:none;padding:0 var(--space-2) 0 var(--space-3);border-radius:0 var(--radius-sm) var(--radius-sm) 0;background:var(--color-gold);color:var(--color-text);font:600 var(--text-xs)/1.6 var(--font-sans);font-variant-numeric:tabular-nums;clip-path:polygon(7px 0,100% 0,100% 100%,7px 100%,0 50%)}.purse-after{font:var(--text-xs) var(--font-sans);color:var(--color-text-label)}.shop-group[data-shelf=unsold] .shop-item{color:var(--color-text-muted)}.shop-group-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--space-1) var(--space-2);margin:var(--space-2) 0 var(--space-1)}.shop-group h5{margin:0;font:600 var(--text-xs) var(--font-sans);color:var(--color-text-muted)}.shop-group-head button{padding:var(--space-1) var(--space-2);font-size:var(--text-xs)}:is(.shop-list,.shop-heading) .icon{width:1.3em;height:1.3em;vertical-align:-.3em;margin:-.15em .25em -.15em 0}
#shop-receipt{margin:0;min-height:2em;border-left:4px solid var(--color-gold);border-radius:var(--radius-sm);background:var(--color-surface);padding:var(--space-1) var(--space-3);font-size:var(--text-sm)}#shop-receipt:empty{visibility:hidden}#shop-receipt.error{color:var(--color-danger);border-left-color:var(--color-danger);font-weight:600}
#encounter{flex-basis:100%;min-width:0;border:1px solid var(--color-danger);border-radius:var(--radius-md);background:color-mix(in srgb,var(--color-danger-soft) 40%,var(--color-surface));padding:var(--space-2) var(--space-3);margin-bottom:var(--space-4);font-family:var(--font-sans)}#session-scene>#session-actions+#encounter h3{margin:0}#fight-top{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--space-1) var(--space-3)}#encounter-title{font-size:var(--text-lg);color:var(--color-danger)}#turn-order{margin:0 0 0 auto;font-size:var(--text-xs);color:var(--color-text-muted);overflow-wrap:anywhere}#turn-order strong{color:var(--color-ink)}
#fight-sides{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:var(--space-3);margin:var(--space-2) 0}.fight-side{min-width:0}.fight-side h4{margin:0 0 var(--space-1);font-size:var(--text-xs);text-transform:uppercase;letter-spacing:.08em}#foe-cards{list-style:none;margin:0;padding:0;display:grid;gap:var(--space-2)}.fight-card{min-width:0;background:var(--color-surface);border:1px solid var(--color-line);border-radius:var(--radius-sm);padding:var(--space-2) var(--space-3);font-size:var(--text-sm);--hp-color:var(--color-danger)}.foe-card[aria-current=true]{border-color:var(--color-danger)}.foe-card[data-state]{color:var(--color-text-muted);--hp-color:var(--color-hp-down)}#you-card{--hp-color:var(--color-hp-healthy)}#you-card[data-health=bloodied]{--hp-color:var(--color-hp-wounded)}#you-card[data-health=critical]{--hp-color:var(--color-hp-critical)}#you-card[data-health=down]{--hp-color:var(--color-hp-down)}
.card-head{display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-2)}.card-name{min-width:0;overflow-wrap:anywhere}.card-ac{flex:none;font-size:var(--text-xs);color:var(--color-text-muted)}.card-hp{margin:2px 0 0;line-height:1.2}.hp-now{font-size:1.3rem;font-weight:700}.hp-max{font-size:var(--text-xs);font-weight:600;color:var(--color-text-muted)}.fight-card .hp-bar{height:8px;margin:var(--space-1) 0 var(--space-2)}.card-tags{margin:0 0 var(--space-1);font-size:var(--text-xs);line-height:1.7}.card-state{margin:0;font-weight:600}#encounter .card-controls{gap:var(--space-1)}#heal-controls{flex-direction:column;align-items:stretch}#heal-controls .action{display:flex}#heal-controls button{text-align:left}.act-detail{font-size:var(--text-xs);font-weight:400;white-space:nowrap}
#fight-foot{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2) var(--space-3);border-top:1px solid var(--color-line);padding-top:var(--space-2)}#fight-foot:not(:has(#flee-control:not([hidden]),li,button:not(#flee-toggle))){display:none}#flee-control{position:relative;display:flex;align-items:center;gap:var(--space-2)}#flee-control[hidden]{display:none}#flee-reason:empty{display:none}#turn-resources{display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-3);list-style:none;margin:0 0 0 auto;padding:0}#end-controls{display:flex;min-width:0}#end-controls:empty{display:none}#end-controls .end-note{text-align:right}
button.danger{border-color:var(--color-danger);color:var(--color-danger)}button.danger:hover:not(:disabled){background:var(--color-danger-soft)}#flee-menu{position:absolute;left:0;bottom:calc(100% + var(--space-1));z-index:3;width:max-content;min-width:14rem;max-width:min(24rem,60vw);background:var(--color-surface);border:1px solid var(--color-control-border);border-radius:var(--radius-sm);box-shadow:0 6px 18px rgb(0 0 0/.2);padding:var(--space-1)}#flee-attacks{margin:0;padding:2px var(--space-2) var(--space-1);font-size:var(--text-xs);color:var(--color-danger)}#flee-ways{display:grid;gap:2px}#flee-ways .action{display:flex}#flee-ways button{text-align:left;border-color:transparent}#flee-ways button:hover:not(:disabled){background:var(--color-highlight)}#encounter #action-bar{margin:var(--space-2) 0 0}#fight-foot+#action-bar:has(.action-row){border-top:1px solid var(--color-line);padding-top:var(--space-2)}#strike-control{margin:var(--space-1) 0 0}#strike-control:empty,#area-cast:empty{display:none}#fight-sides:has(#attack-chooser:not([hidden])){grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)}#attack-chooser{display:grid;gap:var(--space-1);margin-top:var(--space-2);padding:var(--space-2);background:var(--color-surface);border:1px solid var(--color-line);border-radius:var(--radius-sm);font-size:var(--text-sm)}#attack-chooser[hidden]{display:none}#chooser-chips{display:grid;gap:var(--space-1)}.chooser-group{display:grid;grid-template-columns:4.5rem minmax(0,1fr);gap:var(--space-1) var(--space-2);align-items:start}.chooser-label{font:600 var(--text-xs) var(--font-sans);color:var(--color-text-label);padding-top:3px;line-height:1.2;overflow-wrap:anywhere}.chooser-pips{display:block;letter-spacing:1px;color:var(--color-ink)}.chips{display:flex;flex-wrap:wrap;gap:var(--space-1);min-width:0}.chip{position:relative;display:inline-flex;flex-wrap:wrap;align-items:baseline;column-gap:3px;max-width:100%;border:1px solid var(--color-control-border);border-radius:999px;padding:2px 9px;font-size:var(--text-xs);line-height:1.4;background:var(--color-paper);color:var(--color-ink);cursor:pointer}.chip-name{overflow-wrap:anywhere}.chip input{position:absolute;opacity:0;width:1px;height:1px;margin:0;pointer-events:none}.chip:has(input:focus-visible){outline:2px solid var(--color-focus);outline-offset:2px}.chip:hover:not(.on,.off){background:var(--color-surface-hover)}.chip.on{background:var(--color-ink);color:var(--color-on-ink);border-color:var(--color-ink)}.chip.off{color:var(--color-text-muted);border-color:var(--color-line);background:transparent;cursor:default}.chip-tag,.chip-reason{font-size:.9em;opacity:.85;white-space:nowrap}.chip-reason{font-style:italic}#chooser-detail{margin:0;border-top:1px solid var(--color-line);padding-top:var(--space-1);font-size:var(--text-xs);line-height:1.5;color:var(--color-text)}#chooser-detail select{width:auto;max-width:100%;margin:0 0 0 var(--space-1);padding:2px var(--space-1);font-size:var(--text-xs);line-height:1.4}.blast-tick{display:flex;align-items:center;gap:var(--space-1);font-size:var(--text-sm);color:var(--color-text);cursor:pointer}.blast-tick input{width:auto;margin:0}#area-cast{margin-top:var(--space-2)}
#room #room-fold{display:block;margin:0 0 var(--space-2);padding:2px 0;text-decoration:none;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:left;font-size:var(--text-sm);color:var(--color-text-label)}@media(max-width:1499px){#fight-sides{gap:var(--space-2);margin:6px 0}.chooser-group{grid-template-columns:3.75rem minmax(0,1fr)}.fight-side h4{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.fight-card{padding:6px var(--space-2)}#encounter .fight-card button{padding:6px 10px}.hp-now{font-size:1.15rem}}
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

// Sound (#480): each named sound's file, and the player. Only a result that
// answers the player's action or message asks for sound (resultSounds, from
// its roll data, the fight before and after it and the ending it brings,
// #481-#483); opening, reloading or rerunning an adventure plays nothing for
// the history shown.
// Every sound asked for is added to window.requestedSounds, for tests,
// whether or not it can play: it plays only with the header's controls on
// the page, unmuted and above zero volume, and the browser may refuse it
// (before the first click, or headless), which is ignored. An answer's
// sounds play one after another, each a short gap after the last ends.
const SOUND_FILES = ${JSON.stringify(soundUrls())};
// A cantrip's cast plays quieter than a levelled spell's (#485).
const SOUND_GAINS = ${JSON.stringify(soundGains())};
const SOUND_SETTINGS = "dungeon-one-sound";
const soundControls = element("sound-controls");
const soundPlayers = new Map();
window.requestedSounds = [];
let soundSettings = readSoundSettings();

/** The mute and volume this browser kept; on at a moderate volume at first. */
function readSoundSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SOUND_SETTINGS) ?? "null");
    if (saved && typeof saved.muted === "boolean" && Number.isFinite(saved.volume)) {
      return { muted: saved.muted, volume: Math.min(1, Math.max(0, saved.volume)) };
    }
  } catch {
    // Storage that is off or unreadable keeps the defaults.
  }
  return { muted: false, volume: 0.5 };
}

function changeSoundSettings(change) {
  soundSettings = { ...soundSettings, ...change };
  // Muting stops what is left of a playing answer's sounds.
  if (soundSettings.muted || soundSettings.volume === 0) stopSounds();
  try {
    localStorage.setItem(SOUND_SETTINGS, JSON.stringify(soundSettings));
  } catch {
    // Kept for this page only.
  }
  renderSoundControls();
}

// The header's controls and the Settings page's (#510) show the same sound.
function renderSoundControls() {
  if (!soundControls) return;
  const volume = String(Math.round(soundSettings.volume * 100));
  element("sound-mute").setAttribute("aria-pressed", String(soundSettings.muted));
  // Its name stays "Mute sound", pressed while muted; the tooltip says what a click does.
  element("sound-mute").title = soundSettings.muted ? "Unmute sound" : "Mute sound";
  element("sound-volume").value = volume;
  element("settings-sound-on").checked = !soundSettings.muted;
  element("settings-sound-volume").value = volume;
  element("settings-sound-volume-value").textContent = volume + "%";
}

const SOUND_GAP = 120;
// The sound playing now and the timer for the next, so a new answer's
// sounds replace what is left of the last answer's.
let soundQueue = { player: undefined, timer: undefined };

function stopSounds() {
  clearTimeout(soundQueue.timer);
  soundQueue.player?.pause();
  soundQueue = { player: undefined, timer: undefined };
}

/** Plays the named sounds in order, each SOUND_GAP ms after the one before ends. */
function playSounds(names) {
  window.requestedSounds.push(...names);
  stopSounds();
  if (!soundControls || soundSettings.muted || soundSettings.volume === 0 || typeof Audio !== "function") return;
  const queue = soundQueue;
  const next = (index) => {
    if (index >= names.length || soundQueue !== queue) return;
    let player = soundPlayers.get(names[index]);
    if (!player) {
      player = new Audio(SOUND_FILES[names[index]]);
      soundPlayers.set(names[index], player);
    }
    queue.player = player;
    player.volume = soundSettings.volume * (SOUND_GAINS[names[index]] ?? 1);
    player.currentTime = 0;
    player.onended = () => {
      queue.timer = setTimeout(() => next(index + 1), SOUND_GAP);
    };
    try {
      const playing = player.play();
      // Refused (before the first click, or headless): go on without it.
      if (playing) playing.catch(() => player.onended());
    } catch {
      // No audio here: the page says everything without it.
      player.onended();
    }
  };
  next(0);
}

${resultSounds}

// Coin words both ways (#515), so the shop can say what a trade leaves.
${formatCoins}
${parseCoins}

// Each view has its own history entry and URL: the library is the bare page,
// the others a hash (#create, #character-<id>, #adventure-<id>), so a reload
// or Back and Forward return to the view without the server routing them.
let routeTicket = 0;
// The breadcrumb under Characters of the view on show, for Settings to run through.
let shownTrail = [];

/** Shows one view, titles the page and draws its breadcrumb under Characters. */
function show(id, title, trail) {
  shownTrail = trail;
  for (const panel of ["library", "settings", "creation", "sheet", "adventure"]) element(panel).hidden = panel !== id;
  // The adventure's levels, difficulty and room share the header bar (#430).
  element("adventure-meta").hidden = id !== "adventure";
  element("open-map").hidden = id !== "adventure";
  // Confirmations show inside the current panel, under its heading.
  element(id).querySelector("h2").after(element("feedback"));
  document.title = title + " · Dungeon One";
  const items = [{ label: "Characters", hash: "" }, ...trail];
  element("breadcrumb-list").replaceChildren(...items.map((item, index) => {
    const entry = make("li");
    if (index === items.length - 1) {
      const current = make("span", item.label);
      current.setAttribute("aria-current", "page");
      current.title = item.label;
      entry.append(current);
      return entry;
    }
    const link = make("a", item.label);
    link.href = item.hash || location.pathname;
    link.dataset.view = !item.hash ? "library" : item.hash.startsWith("#adventure-") ? "adventure" : item.hash === "#create" ? "creation" : "sheet";
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      go(item.hash);
    });
    entry.append(link);
    return entry;
  }));
}

/** Opens a view as a new history entry, with its state, or in place of the current one. */
function go(hash, replace, state = null) {
  const url = hash || location.pathname;
  if (replace) history.replaceState(null, "", url);
  else if (url !== location.pathname + location.hash) history.pushState(state, "", url);
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
  if (element("map-dialog").open) closeMap(false);
  const hash = location.hash;
  const character = /^#character-([a-f0-9]{32})$/.exec(hash);
  const adventure = /^#adventure-([a-f0-9]{32})$/.exec(hash);
  if (hash === "#create") openCreation(ticket);
  else if (hash === "#settings") openSettings(ticket);
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
    // No capacity when the setting is unlimited (#506).
    ["Carrying", carrying.capacity === undefined ? carrying.weight + " lb" : carrying.weight + " of " + carrying.capacity + " lb"],
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
  // How spent uses come back, once under the features (#431), for a
  // character with a limited-use feature; spell slots alone don't count.
  const limited = profile.features.some(({ id }) => profile.featureUses[id]);
  const rule = limited ? [make("p", ${JSON.stringify(FEATURE_USES_RULE)}, "hint feature-uses-rule")] : [];
  return [stats, abilityTable(abilities, profile, "Ability scores and saving throws"), skills, ...spellcastingNodes(profile.spellcasting), make("h3", "Features"), features, ...rule];
}

/** A spell by id, from the classes' lists (#339). */
const spellInfo = (id) => library.classes.flatMap(({ spellcasting }) => spellcasting ? spellcasting.spells : []).find((spell) => spell.id === id) || { id, name: id, summary: "" };

/** A skill's name by id (#343), from the classes' skill choices. */
const skillName = (id) => (library.classes.flatMap(({ skills }) => skills).find((skill) => skill.id === id) || { name: id }).name;

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

// The picks being made on a sheet (#343), by character and kind.
const picks = {};

/**
 * A pick a new level asks for on the sheet (#343), between adventures: a
 * level-up card with a tick for each option, at most owed of them, and a
 * button that saves them through its path as its field.
 */
function pickNodes(entry, pick) {
  const key = entry.sheet.id + ":" + pick.kind;
  if (!picks[key]) picks[key] = [];
  const chosen = () => picks[key];
  const card = make("section", undefined, "level-up level-pick");
  card.id = pick.kind + "-card";
  const heading = make("h3", pick.title);
  heading.id = pick.kind + "-title";
  card.setAttribute("aria-labelledby", heading.id);
  const group = make("fieldset");
  group.id = pick.kind + "-choices";
  group.append(make("legend", pick.legend));
  const fields = make("div", undefined, "checks");
  const button = make("button", pick.label, "secondary");
  button.type = "button";
  button.id = "save-" + pick.kind;
  const error = make("p", "", "error");
  error.id = pick.kind + "-error";
  error.setAttribute("role", "alert");
  const update = () => {
    for (const box of fields.querySelectorAll("input")) box.disabled = !box.checked && chosen().length >= pick.owed;
    button.disabled = isBusy(button) || chosen().length !== pick.owed;
  };
  fields.append(...pick.options.map((option) => spellBox(pick.kind + "-" + option.id, option, chosen().includes(option.id), (event) => {
    picks[key] = event.target.checked ? [...chosen(), option.id] : chosen().filter((id) => id !== option.id);
    update();
  })));
  button.addEventListener("click", async () => {
    if (isBusy(button)) return;
    setBusy(button, pick.busy);
    try {
      library = await request(pick.path, { revision: library.revision, characterId: entry.sheet.id, [pick.field]: chosen() });
      delete picks[key];
      clearBusy(button);
      openSheet(entry.sheet.id);
      feedback(pick.done);
    } catch (failure) {
      clearBusy(button);
      element(error.id).textContent = failure.message;
      update();
    }
  });
  group.append(fields, error);
  const controls = make("div", undefined, "controls");
  controls.append(button);
  card.append(heading, group, controls);
  update();
  return [card];
}

/**
 * A new level's choices a Wizard makes on the sheet (#343): Scholar's
 * Expertise, then the spells to write into its spellbook.
 */
function levelPickNodes(entry) {
  if (entry.defeated || entry.session) return [];
  const name = entry.sheet.name;
  const nodes = [];
  if (entry.expertise) {
    nodes.push(...pickNodes(entry, {
      kind: "expertise",
      title: "Level " + entry.sheet.level + ": Scholar",
      legend: "Choose a skill for Expertise: your proficiency bonus is doubled for checks with it.",
      owed: entry.expertise.owed,
      options: entry.expertise.options,
      path: "/api/5e/characters/choose-expertise",
      field: "skills",
      label: "Choose Expertise",
      busy: "Choosing…",
      done: name + " has Expertise now.",
    }));
  }
  const owed = entry.spells && entry.spells.spellbookOwed;
  if (owed) {
    nodes.push(...pickNodes(entry, {
      kind: "spellbook",
      title: "Level " + entry.sheet.level + ": write " + (owed === 1 ? "a spell" : owed + " spells") + " into your spellbook",
      legend: "Choose " + (owed === 1 ? "one Wizard spell" : owed + " Wizard spells") + " of a level you have slots for. You prepare spells only from your spellbook.",
      owed,
      options: entry.spells.writable,
      path: "/api/5e/characters/write-spellbook",
      field: "spells",
      label: "Write into spellbook",
      busy: "Writing…",
      done: name + " wrote " + (owed === 1 ? "a new spell" : owed + " new spells") + " into the spellbook.",
    }));
  }
  return nodes;
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
  const { sheet, profile, purse, stowed, ammunition, carrying, treasure, magicItems, gear } = entry;
  shownSheetId = sheet.id;
  element("sheet-name").textContent = sheet.name;
  const summary = make("p", "Level " + sheet.level + " " + entry.className + " · " + sheet.xp + " XP" + (profile.nextLevelXp === undefined ? "" : " (level " + (sheet.level + 1) + " at " + profile.nextLevelXp + ")") + " · " + profile.equipment.map(({ name }) => name).join(", ") + (stowed.length ? " · Carried: " + stowed.join(", ") : "") + (ammunition.length ? " · Ammunition: " + ammunition.join(", ") : ""), "hint");
  // Its dice, or its scores before the background (#509: standard array or point buy).
  const rolls = make("p", (sheet.abilityRolls ? "Rolled: " + library.abilities.map((ability) => titleCase(ability) + " " + sheet.abilityRolls[ability].join(", ")).join("; ") : "Base scores: " + library.abilities.map((ability) => titleCase(ability) + " " + sheet.baseScores[ability]).join("; ")) + ". Background: " + Object.entries(sheet.backgroundIncrease).map(([ability, amount]) => "+" + amount + " " + titleCase(ability)).join(", ") + "." + (sheet.abilityScoreImprovements.length ? " Ability Score Improvement: " + sheet.abilityScoreImprovements.map(increaseText).join("; ") + "." : ""), "hint");
  renderLevelChoice(entry);
  element("sheet-body").replaceChildren(summary, ...levelPickNodes(entry), ...(profile.fightingStyle ? [styleUseNode(profile.fightingStyle)] : []), ...profileNodes(sheet.abilities, profile, sheet.hp, carrying), ...gearNodes(gear), ...learnNodes(entry), ...prepareNodes(entry), ...magicItemNodes(magicItems, entry), ...treasureNodes(treasure), ...purseNodes(sheet.purse, purse), rolls);
  renderAdventureChoices(entry);
  show("sheet", sheet.name, [{ label: sheet.name }]);
  element("sheet-name").focus();
}

// The magic items held (#345), each with its bonus explained, then the
// spell scrolls and wands (#346); none, no heading. Between adventures a
// Wizard copies a scroll into its spellbook from its entry, disabled with
// why when it can't.
// The sheet's gear (#504): each item opens to show its stats.
function gearNodes(gear) {
  if (gear.length === 0) return [];
  const heading = make("h3", "Gear");
  heading.id = "sheet-gear-title";
  const list = make("ul", undefined, "carry-list sheet-gear");
  list.id = "sheet-gear";
  list.setAttribute("aria-labelledby", heading.id);
  list.append(...gear.map(({ name, icon: itemIcon, state, stats }) => {
    const item = make("li");
    const more = make("details", undefined, "carry-more");
    const summary = make("summary");
    summary.append(...iconned(itemIcon, make("strong", name)), " ", make("span", state, "carry-state"));
    more.append(summary, ...statsNodes(stats));
    item.append(more);
    return item;
  }));
  return [heading, list];
}

function magicItemNodes(items, entry) {
  if (items.length === 0) return [];
  const heading = make("h3", "Magic items");
  heading.id = "magic-items-title";
  const list = make("ul", undefined, "features");
  list.id = "magic-items";
  list.setAttribute("aria-labelledby", "magic-items-title");
  list.append(...items.map(({ id, name, text, copy }) => {
    const item = make("li");
    item.append(make("strong", name + ". "), document.createTextNode(text));
    if (copy && !entry.session && !entry.defeated) item.append(copyControl(entry, id, name, copy));
    return item;
  }));
  return [heading, list];
}

// "Copy into spellbook (50 gp)" for a scroll on a Wizard's sheet (#346).
function copyControl(entry, scrollId, name, copy) {
  const controls = make("div", undefined, "controls copy-scroll");
  const button = make("button", "Copy into spellbook (" + copy.cost + ")", "secondary");
  button.type = "button";
  button.dataset.scroll = scrollId;
  button.setAttribute("aria-label", "Copy " + name + " into your spellbook for " + copy.cost);
  button.disabled = Boolean(copy.reason);
  const error = make("p", copy.reason || "", copy.reason ? "hint" : "error");
  error.id = "copy-reason-" + scrollId.replace(/[^a-z0-9-]/g, "-");
  if (copy.reason) button.setAttribute("aria-describedby", error.id);
  button.addEventListener("click", async () => {
    if (isBusy(button)) return;
    setBusy(button, "Copying…");
    try {
      library = await request("/api/5e/characters/copy-scroll", { revision: library.revision, characterId: entry.sheet.id, scrollId });
      clearBusy(button);
      openSheet(entry.sheet.id);
      feedback(entry.sheet.name + " copied " + name + " into the spellbook.");
    } catch (failure) {
      clearBusy(button);
      error.textContent = failure.message;
      error.className = "error";
      error.setAttribute("role", "alert");
    }
  });
  controls.append(button, error);
  return controls;
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
  // A defeated character's sheet leads with its defeat.
  if (entry.defeated) {
    choices.replaceChildren(make("p", entry.sheet.name + " was defeated and cannot start another adventure.", "defeat-notice"));
    return;
  }
  if (entry.levelChoice) {
    choices.replaceChildren(make("p", "Choose " + entry.sheet.name + "'s level " + entry.levelChoice.levelUp.to + " " + choiceWords(entry.levelChoice.levelUp) + " above before starting another adventure.", "level-choice-notice"));
    return;
  }
  // A new level's Expertise (#343), cantrips (#342), spellbook spells
  // (#343) and spells (#341) are chosen first.
  const spells = entry.spells || {};
  if ((entry.expertise || spells.owed || spells.cantripsOwed || spells.spellbookOwed) && !entry.session) {
    const expertise = entry.expertise ? ["choose Scholar's Expertise"] : [];
    const learn = spells.cantripsOwed ? ["learn " + spells.cantripsOwed + " more " + (spells.cantripsOwed === 1 ? "cantrip" : "cantrips")] : [];
    const write = spells.spellbookOwed ? ["write " + spells.spellbookOwed + " more " + (spells.spellbookOwed === 1 ? "spell" : "spells") + " into the spellbook"] : [];
    const prepare = spells.owed ? ["prepare " + spells.owed + " more " + (spells.owed === 1 ? "spell" : "spells")] : [];
    const owed = [...expertise, ...learn, ...write, ...prepare];
    const words = owed.length === 1 ? owed[0] : owed.slice(0, -1).join(", ") + " and " + owed.at(-1);
    choices.replaceChildren(make("p", words[0].toUpperCase() + words.slice(1) + " below before starting another adventure.", "level-choice-notice"));
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
// The room, and whether a fight is under way there, the centre column last
// showed (#523).
let shownPlace = "";
// Whether the player opened the room's things in a fight (#525), and the
// Flee menu: both close when the fight begins or ends, or the room changes.
let roomUnfolded = false;
let fleeOpen = false;
// Whether Leave is asking for confirmation (#133).
let confirmingLeave = false;
// The equipped item whose sale is asking for confirmation, if any (#210).
let confirmingSale = null;
// The shop (#515) while it is open: the merchant's id, the item chosen in
// it ({ list: "ware" or "pack", id, slot }, or null) and the last trade's
// receipt ({ text, error }, or null). Page state only.
let shop = null;
// Whether Sell all treasure is asking for confirmation (#515).
let confirmingSellAll = false;
// The Cunning Strike effect chosen for the next attack (#308), or "".
let cunningStrike = "";
// How many hit dice the next short rest spends (#334), or null for the most.
let restDice = null;
// Memorize Spell's swap with the next short rest (#344): spell ids, or ""
// for none.
let restSwap = { forget: "", learn: "" };
// The choices of each Cast choice (#337): the spells' in the Cast a spell
// row and, in a fight, the scrolls' and wands' in the Items row (#392).
// Each keeps the spell and slot level chosen (as castKey makes it) and its
// target's id, "" until chosen, and an area spell's targets (#338), in the
// order ticked, with the choice they were ticked for.
const casting = {
  spell: { choice: "", target: "", targets: [], targetsOf: "" },
  item: { choice: "", target: "", targets: [], targetsOf: "" },
};

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
    openCarried.clear();
    openStats.clear();
    treasureOpen = null;
    element("message").value = "";
    confirmingLeave = false;
  }
  // The shop is page state only (#515): opening the adventure shows the room.
  resetShop();
  element("adventure-error").textContent = "";
  renderAdventure();
  const entry = findEntry(session.characterId);
  const title = session.adventure.title;
  show("adventure", title, [...(entry ? [{ label: entry.sheet.name, hash: "#character-" + entry.sheet.id }] : []), { label: title }]);
  element(session.ending ? "ending-title" : "adventure-title").focus();
  // The latest turn shows from its top (#529).
  followHistory = true;
  followTurn();
}

function renderAdventure() {
  const { adventure, encounter } = session;
  // It takes the bar's spare width, so the bar never wraps (#430, #480); cut short, it shows in full on hover.
  // The room panel names the room, so the bar does not (#522).
  element("adventure-meta").textContent = levelText(adventure.recommendedLevels) + " · " + titleCase(adventure.difficulty);
  element("adventure-meta").title = element("adventure-meta").textContent;
  element("adventure-title").textContent = adventure.title;
  // One line under the header bar (#430); a long objective shows in full on hover.
  element("adventure-objective").textContent = adventure.objective;
  element("adventure-objective").title = adventure.objective;
  const fighting = Boolean(encounter && encounter.currentTurn !== null);
  renderRoom(session.room);
  if (element("map-dialog").open) renderMap();
  // A new room, or a fight beginning or ending, shows the centre column from
  // its top, where a fight's panel is (#523, #525); the room folds again.
  const place = session.room.id + (fighting ? " fighting" : "");
  if (place !== shownPlace) {
    shownPlace = place;
    roomUnfolded = false;
    fleeOpen = false;
    element("session-main").scrollTop = 0;
    element("session-scene").scrollTop = 0;
  }
  // The fight panel (#525) opens the centre column while a fight is under
  // way, and is gone once it ends. The action bar moves into it, under the
  // cards and the footer, or over the cards while a hit or a fall waits for
  // an answer; out of a fight it is back in #session-actions. It moves only
  // when its place changes, so focus in it stays put.
  element("encounter").hidden = !fighting;
  if (fighting) renderFight(encounter);
  else {
    element("you-card").replaceChildren();
    element("foe-cards").replaceChildren();
  }
  const bar = element("action-bar");
  const holder = fighting ? element("encounter") : element("session-actions");
  const next = fighting && encounter.pendingReaction ? element("fight-sides") : null;
  if (bar.parentElement !== holder || bar.nextElementSibling !== next) holder.insertBefore(bar, next);
  renderGear(session.room.gear);
  renderActions();
  renderRoomFold(fighting);
  renderShop();
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
    // #319: each name is a disclosure of the sheet's text, open from the start
    // (#387) so it reads without a click; the player can still fold it. The
    // spell lists below stay folded.
    if (up.features.length) {
      const features = make("ul");
      features.id = "level-up-features";
      features.setAttribute("aria-label", "New features");
      features.append(...up.features.map((feature) => {
        const disclosure = make("details");
        disclosure.open = true;
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
    // Scholar's Expertise (#343), chosen on the sheet.
    if (up.expertise) {
      const expertise = make("p", "Scholar: choose Expertise in " + up.expertise.options.map(skillName).join(" or ") + " on " + name + "'s sheet before the next adventure.");
      expertise.id = "level-up-expertise";
      card.append(expertise);
    }
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
  // A Wizard's spellbook (#343): the spells it may write, each opening to
  // what it does, written on the sheet.
  if (spells.spellbookOwed) {
    nodes.push(...list("Write " + spells.spellbookOwed + " of these into your spellbook on " + name + "'s sheet before the next adventure:", "level-up-spellbook", spells.spellbookOptions));
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

// A monster's or item's silhouette from the page's sprite (#377). It is
// decorative: the text beside it names the thing.
function icon(id) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.dataset.icon = id;
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#icon-" + id);
  svg.append(use);
  return svg;
}

// A name, after its icon when it has one.
const iconned = (id, name) => (id ? [icon(id), name] : [name]);

// A line's text, from character start on, with its icons, each before the
// character it marks.
function iconText(line, start = 0) {
  const parts = [];
  let from = start;
  for (const mark of (line.icons ?? []).filter(({ at }) => at >= start)) {
    parts.push(line.text.slice(from, mark.at), icon(mark.icon));
    from = mark.at;
  }
  parts.push(line.text.slice(from));
  return parts.filter((part) => part !== "");
}

// The icon a line marks a name with, for its compact form.
const nameIcon = (line, name) => line.icons?.find((mark) => line.text.startsWith(name, mark.at))?.icon;
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
  // A hit waiting for Uncanny Dodge (#308) says so, as does a fall waiting
  // for Last Stand (#499).
  const pending = encounter && encounter.pendingReaction;
  element("turn").textContent = !encounter ? "" : current ? "Round " + encounter.round + ": " + (current.id === encounter.playerId ? "your turn." : pending ? pending.attacker + (pending.lastStand ? " brings you to 0 HP: Last Stand." : " hits you.") : current.name + "'s turn.") : "The fight is over.";
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
    item.append(effectTag(effect), make("span", (effect.concentration ? "concentration, " : "") + effect.until, "effect-until"));
    return item;
  }));
  const items = [];
  // The turn's Action, Bonus and Reaction pips sit in the fight panel's
  // footer, by End turn (#525).
  const pips = [];
  if (turn) {
    // Extra Attack (#287): the Attack action under way still has an attack.
    const pending = turn.attacks > 0 ? "; second attack to make" : "";
    const actions = (turn.actions === 0 ? "used" : turn.maxActions === 1 ? "available" : turn.actions + " of " + turn.maxActions + " left") + pending;
    pips.push(
      resource("action", "Action", turn.actions, turn.maxActions, "Action: " + actions),
      resource("bonus-action", "Bonus", turn.bonusAction ? 1 : 0, 1, "Bonus action: " + (turn.bonusAction ? "available" : "used")),
      resource("reaction", "Reaction", turn.reaction ? 1 : 0, 1, "Reaction: " + (turn.reaction ? "available" : "used")),
    );
  }
  element("turn-resources").replaceChildren(...pips);
  if (features) {
    items.push(resource("second-wind", "Second Wind", features.secondWind.uses, features.secondWind.max, usesLeft("Second Wind", features.secondWind)));
    if (features.actionSurge) items.push(resource("action-surge", "Action Surge", features.actionSurge.uses, features.actionSurge.max, usesLeft("Action Surge", features.actionSurge)));
  }
  // Channel Divinity (#385), in and out of fights, as Second Wind's.
  const channel = session.channelDivinity;
  if (channel) items.push(resource("channel-divinity", "Channel Divinity", channel.uses, channel.max, usesLeft("Channel Divinity", channel)));
  // The hit-dice pool (#333), outside a fight's turns: they can't be spent
  // in a fight, and the strip there holds the turn's resources.
  if (!turn) {
    const { available, total, sides } = session.hitDice;
    items.push(resource("hit-dice", "Hit dice", available, total, "Hit dice: " + available + " of " + total + " d" + sides + " left"));
  }
  element("resources").replaceChildren(...items);
}

// Every part of a history entry is one card in one font (#524): the player's
// words after "You:", an AI DM reply under "Dungeon Master", and the engine's
// narration, result and rejection cards (a rejection tinted and labelled),
// each labelled for screen readers (#159). A line arriving in a room (the
// opening's too) starts with the room's name in bold. A line with rolls (an attack, initiative, healing, a check or
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
      // A d100 against a wandering encounter table's chance (#335, #403).
      node.append(...diceChips(group), " vs " + group.dc + " or less");
      break;
    case "duplicates":
      // Mirror Image's d6s (#343): a 3 or higher strikes a duplicate.
      node.append("Mirror Image ", ...diceChips(group, ", "), group.outcome === "success" ? ": a duplicate takes it" : ": no duplicate");
      break;
  }
  return node;
}

/** An attack, initiative or healing line built from its roll groups. */
function compactLine(line) {
  const node = unspoken(make("span", undefined, "compact"));
  // Names, each after the icon the line marks it with (#377).
  const who = (...names) => {
    const span = make("span", undefined, "who");
    names.forEach((name, index) => span.append(...(index > 0 ? [" → "] : []), ...iconned(nameIcon(line, name), name)));
    return span;
  };
  const attack = line.rolls.find((group) => group.purpose === "attack");
  if (attack) {
    node.append(who(attack.roller, attack.target), " ", make("span", OUTCOME_TAGS[attack.outcome], "tag " + attack.outcome));
    line.rolls.forEach((group, index) => node.append(index > 0 ? " · " : " ", compactRoll(group)));
  } else if (line.rolls[0].purpose === "healing") {
    // A potion's icon heads its line (#377).
    const potion = line.icons?.find(({ at }) => at === 0);
    if (potion) node.append(icon(potion.icon));
    node.append(who(line.rolls[0].roller), " heals ", compactRoll(line.rolls[0]));
  } else if (line.rolls[0].purpose === "check" || line.rolls[0].purpose === "save") {
    // A check or saving throw (#132): its label, outcome (or band, #281) and roll against the DC.
    const check = line.rolls[0];
    node.append(who(check.roller), " ", make("span", check.label, "roll-label"), " ", make("span", check.band ? BAND_TAGS[check.band] : OUTCOME_TAGS[check.outcome], "tag " + check.outcome), " ", compactRoll(check));
  } else if (line.rolls[0].purpose === "reaction") {
    // A reaction roll (#304): its band and the dice with the Charisma modifier.
    const reaction = line.rolls[0];
    node.append(who(reaction.roller), " ", make("span", reaction.label, "roll-label"), " ", make("span", REACTION_TAGS[reaction.reaction], "tag reaction " + reaction.reaction), " ", compactRoll(reaction));
  } else if (line.rolls[0].purpose === "wandering") {
    // A wandering encounter table's d100 (#335, #403): whether a fight came.
    const watch = line.rolls[0];
    node.append(make("span", watch.label, "roll-label"), " ", make("span", watch.outcome === "success" ? "Comes" : "Stays away", "tag " + watch.outcome), " ", compactRoll(watch));
  } else if (line.rolls[0].purpose === "damage") {
    node.append(who(line.rolls[0].roller, line.rolls[0].target), " ", compactRoll(line.rolls[0]));
  } else {
    node.append(make("span", "Initiative: ", "roll-label"));
    line.rolls.forEach((group, index) => node.append(...(index > 0 ? [" · "] : []), compactRoll(group)));
  }
  return node;
}

const compactable = (line) => line.rolls.length > 0;

/**
 * The room a line arrives in (#524), whose name heads it: "Dog Yard — A
 * muddy yard…". Any room the character knows can be one; an older
 * session's "You enter the…" line names none.
 */
function arrivalRoom(line) {
  return session.knownRooms
    .flatMap(({ rooms }) => rooms)
    .map(({ name }) => name)
    .filter((name) => line.text.startsWith(name + " — "))
    .sort((a, b) => b.length - a.length)[0];
}

/** "How initiative was rolled", under a history line of initiative rolls. */
function initiativeHow() {
  const details = make("details", undefined, "initiative-how");
  details.append(make("summary", "How initiative was rolled"), make("p", "Each combatant rolled d20 + its initiative bonus; ties go to the higher Dexterity, then a roll-off."));
  return details;
}

function historyCard(card) {
  const node = part("div", card.kind);
  for (const line of card.lines) {
    const block = make("div", undefined, "card-line");
    const paragraph = make("p");
    const room = compactable(line) ? undefined : arrivalRoom(line);
    if (compactable(line)) paragraph.append(spoken(line.text), compactLine(line));
    else if (room) {
      // The arrival "Description in history" finds (#524).
      node.dataset.arrival = room;
      paragraph.append(make("strong", room, "arrival-room"), ...iconText(line, room.length));
    } else paragraph.append(...iconText(line));
    block.append(paragraph);
    // The initiative rolls say how they were made (#525), closed at first.
    if (line.rolls[0]?.purpose === "initiative") block.append(initiativeHow());
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
  item.dataset.kind = message ? "message" : entry.reply || (entry.cards.length > 0 && entry.cards.every(({ kind }) => kind === "narration")) ? "narration" : "action";
  if (message) {
    const said = part("p", "player");
    said.append(make("strong", "You:"), " " + entry.player);
    item.append(said);
  }
  if (entry.reply && !entry.cards.some(({ text }) => text === entry.reply)) item.append(part("p", message ? "reply" : "narration", entry.reply));
  item.append(...entry.cards.map(historyCard));
  return item;
}

// The newest entry is marked, and it and the latest turn's first entry can
// take focus, so the action bar can move focus to an action's result.
function markNewest(log) {
  for (const old of log.querySelectorAll(":scope > li[tabindex]")) {
    old.removeAttribute("class");
    old.removeAttribute("tabindex");
  }
  const newest = log.lastElementChild;
  if (newest) {
    newest.classList.add("newest");
    newest.tabIndex = -1;
  }
  if (turnStart) turnStart.tabIndex = -1;
}

/**
 * Moves focus to the latest turn's first entry (#529), if there is one.
 * Focus is never left off screen: a reader scrolled up to older entries is
 * taken to the turn, where the log rests, as focus once scrolled the newest
 * entry into view (#221).
 */
function focusTurnEntry() {
  if (!turnStart) return;
  if (!followHistory) {
    followHistory = true;
    followTurn();
  }
  turnStart.focus({ preventScroll: true });
}

// History only grows, so new entries are appended: the live region announces
// just them. Each turn (an action's or a message's entries) shows from its
// top (#529): the log scrolls so the turn's first entry rests midway down
// the view, with older entries above it for context. A turn too tall for
// the lower half rests higher, so all of it shows, and one taller than the
// view rests TURN_MARGIN from the top, its focus ring in view. Space under
// the newest entry (#log's ::after, --turn-room) lets a short turn get
// there. The log follows the latest turn only while the reader has not
// scrolled up from where it rests; someone who scrolled up to read older
// entries stays where they are. Only the reader's scrolling decides that,
// not the window resizing around it; while following, a resized log is
// scrolled back to the latest turn (#221).
const TURN_MARGIN = 8;
let followHistory = true;
let turnStart;
// How far below the top of the view the latest turn rests, and the log's
// size it was worked out for.
let turnRest = 0;
let restSize = "";
const logSize = (log) => log.clientWidth + "x" + log.clientHeight;

/** Where an entry starts in the log's scrolled content. */
const entryTop = (log, entry) => log.scrollTop + entry.getBoundingClientRect().top - log.getBoundingClientRect().top;

/**
 * Works out where the latest turn rests, sizes the space under the newest
 * entry so it can get there, and scrolls there while the reader follows it.
 */
function followTurn() {
  const log = element("log");
  if (!turnStart) return;
  // A view's height of space overfills the log, so its scroll height is
  // exact (never just the view's): the space shrinks by what is spare.
  log.style.setProperty("--turn-room", log.clientHeight + "px");
  const top = entryTop(log, turnStart);
  const height = log.lastElementChild.getBoundingClientRect().bottom - turnStart.getBoundingClientRect().top;
  turnRest = Math.max(TURN_MARGIN, Math.min(log.clientHeight / 2, log.clientHeight - height - TURN_MARGIN));
  const target = Math.max(0, Math.round(top - turnRest));
  const spare = log.scrollHeight - log.clientHeight - target;
  log.style.setProperty("--turn-room", Math.max(0, Math.ceil(log.clientHeight - spare)) + "px");
  restSize = logSize(log);
  if (followHistory) log.scrollTop = target;
}

/**
 * Whether the reader is on the latest turn: its start no more than 24 px
 * below where it rests, or scrolled past reading it.
 */
function onLatestTurn() {
  const log = element("log");
  return !turnStart || turnStart.getBoundingClientRect().top - log.getBoundingClientRect().top < turnRest + 24;
}

function renderHistory() {
  const log = element("log");
  for (const pending of log.querySelectorAll(":scope > li[data-pending]")) pending.remove();
  const rebuilt = log.dataset.session !== session.id || log.children.length > session.history.length;
  if (rebuilt) {
    log.dataset.session = session.id;
    log.replaceChildren();
  }
  const added = session.history.slice(log.children.length).map(historyEntry);
  log.append(...added);
  // A whole history shows its latest entry as the turn; otherwise the
  // turn starts with the first entry it added.
  if (rebuilt) turnStart = log.lastElementChild ?? undefined;
  else if (added.length) turnStart = added[0];
  else if (!turnStart?.isConnected) turnStart = log.lastElementChild ?? undefined;
  markNewest(log);
  followTurn();
  element("room-history-link").hidden = !arrivalEntry();
}

/**
 * The newest history entry arriving in the character's room (#524), whose
 * card holds the room's description; none in an older session that has not
 * moved since.
 */
function arrivalEntry() {
  return [...element("log").querySelectorAll(":scope > li [data-arrival]")]
    .filter((card) => card.dataset.arrival === session.room.name)
    .at(-1)
    ?.closest("li");
}

/** "Description in history": scrolls the log to the room's arrival and focuses it. */
function showArrival() {
  const entry = arrivalEntry();
  if (!entry) return;
  const log = element("log");
  // Just under the top of the view, its focus ring in view.
  log.scrollTop = entryTop(log, entry) - TURN_MARGIN;
  entry.tabIndex = -1;
  entry.focus({ preventScroll: true });
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
  turnStart = item;
  markNewest(log);
  followTurn();
}

// Each list's entries, a card each (#520), in the room panel's order: Here,
// Items here, Look at, Ways on. renderActions puts each card's actions on
// it. An empty list is left out, and a room with no exits, features or items
// says so in one line.
const ROOM_LISTS = [
  { id: "creatures", key: "creatures" },
  { id: "room-items", key: "items" },
  { id: "features", key: "features" },
  { id: "exits", key: "exits" },
];

const TRAP_STATES = { armed: "found, armed", disarmed: "disarmed", sprung: "sprung" };

// A known room's fight (#405), as its record on the map says it.
const KNOWN_FIGHTS = { "under-way": "under way", won: "won", peaceful: "ended peacefully", bypassed: "slipped past", fled: "fled from", waiting: "still waits" };

// A known room's heading and record (#405), on the map (#457).
function recordNodes(room) {
  const heading = make("h4", room.name + (room.current ? ": you are here" : ""));
  if (!room.record) return [heading, make("p", "Seen through an exit; you have not been in.", "hint")];
  const { discoveries, creatures, doors, traps, fight } = room.record;
  const facts = [
    ...(fight ? [make("li", "Fight with " + fight.opponents.join(", ") + ": " + KNOWN_FIGHTS[fight.status] + ".")] : []),
    ...discoveries.map(({ name, discovery }) => make("li", name + ": " + discovery, "discovery")),
    ...creatures.flatMap(({ name, said }) => said.map((answer) => make("li", name + ", about " + answer.topic + ": " + answer.said))),
    ...doors.map(({ name, to, open }) => make("li", name + " (to the " + to + "): " + (open ? "open" : "shut") + ".")),
    ...traps.map(({ name, to, state }) => make("li", name + " (on the way to the " + to + "): " + TRAP_STATES[state] + ".")),
  ];
  const list = make("ul", undefined, "things");
  list.append(...facts);
  return [heading, facts.length ? list : make("p", "Nothing learned here yet.", "hint")];
}

// The fog-of-war map (#457), a pop-up (#map-dialog) drawn from session.map:
// the rooms visited on their grid cells, the current one marked; every
// passage out of them, to a visited room or a stub on the far room's own
// cell (a long passage is drawn its whole length): from the character's
// room a dashed box named as its exit is, from any other room a bare "?";
// marks on a passage for its door, a trap found and a closed way; and on a
// room, a line per stair, ladder or shaft, naming where it leads once
// visited or from the character's room. Rooms are shaded by region. One
// floor shows at a time, with a tab per floor visited, all floors drawn to
// one origin and scale; it opens on the character's floor. Choosing the
// room at the other end of a passage from the character's room, its stub or
// its stair makes the same move as Go to and closes the map; choosing any
// other room shows its record (#405). No room is named here
// that is neither visited nor named by the character's room's exits. M
// opens it (not while typing); Escape or Close returns focus to where it
// was.
const MAP_CELL = { x: 176, y: 128 };
const MAP_ROOM = { x: 136, y: 88 };
const MAP_STUB = 40;
const MAP_MARK = 20;
const MAP_PAD = 16;
const MAP_SHADES = 6;
let mapFloor = 0;
let mapRecordId = null;
let mapReturn = null;
let restoreMapFocus = true;
const SVG = "http://www.w3.org/2000/svg";
const regionShade = (shade) => "var(--color-region-" + (shade % MAP_SHADES) + ")";
const floorName = (floor) => floor === 0 ? "Main floor" : Math.abs(floor) + (Math.abs(floor) === 1 ? " floor " : " floors ") + (floor > 0 ? "up" : "down");
/** The compass direction from one cell to another, as a word and its letters, or "" for the same cell. */
function compass(from, to) {
  const north = to[1] < from[1] ? "north" : to[1] > from[1] ? "south" : "";
  const east = to[0] > from[0] ? "east" : to[0] < from[0] ? "west" : "";
  const word = north + east;
  return { word, letters: (north.charAt(0) + east.charAt(0)).toUpperCase() };
}
/** A passage's marks: closed, its door and its trap found. */
const passageMarks = (passage) => [
  ...(passage.closed ? [{ glyph: "✕", kind: "closed", label: "Way closed" }] : []),
  ...(passage.door ? [{ glyph: passage.door.open ? "□" : "■", kind: "door", label: passage.door.name + ": " + (passage.door.open ? "open" : "shut") }] : []),
  ...(passage.trap ? [{ glyph: "!", kind: "trap", label: passage.trap.name + ": " + TRAP_STATES[passage.trap.state] }] : []),
];
/** A mark on the map, named by its label; in the key, which says it in words, hidden. */
function markNode({ glyph, kind, label }) {
  const mark = make("span", glyph, "map-mark " + kind);
  if (label) {
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", label);
    mark.title = label;
  } else mark.setAttribute("aria-hidden", "true");
  return mark;
}
/** Sizes the map node and centres it on the point x, y. */
const place = (node, [x, y], width, height) => {
  node.style.left = x - width / 2 + "px";
  node.style.top = y - height / 2 + "px";
  node.style.width = width + "px";
  node.style.height = height + "px";
  return node;
};

/** Opens the map, unless there is no adventure shown or a dialog is open; true if it opened. */
function openMap() {
  if (!session || element("adventure").hidden || document.querySelector("dialog[open]")) return false;
  mapReturn = document.activeElement;
  restoreMapFocus = true;
  mapFloor = session.map.floor;
  mapRecordId = null;
  element("map-status").textContent = "";
  renderMap();
  element("map-dialog").showModal();
  const here = document.querySelector("#map-canvas .map-room.current > button");
  if (here) {
    here.focus();
    here.scrollIntoView({ block: "center", inline: "center" });
  }
  return true;
}

function closeMap(restore) {
  restoreMapFocus = restore;
  element("map-dialog").close();
}

/** Why the Go to option can't be made now, or "" if it can. */
function moveRefusal(option) {
  if (session.status !== "playing") return "The adventure is over.";
  if (acting) return "Wait for the Dungeon Master's reply first.";
  if (!option) return fightingNow() ? "Not in a fight: flee from the fight panel instead." : "You can't go that way now.";
  return option.available ? "" : option.reason + ".";
}

/**
 * Goes to the room at the other end of a passage from the character's
 * room, as Go to does, closing the map; or says in the map why not. True
 * if it went.
 */
function mapGo(roomId) {
  const option = session.actions.find(({ action, target }) => action === "move" && target.id === roomId);
  const why = moveRefusal(option);
  element("map-status").textContent = why;
  if (why) return false;
  closeMap(false);
  perform(option);
  return true;
}

function renderMap() {
  const { map } = session;
  const floors = [...new Set(map.rooms.map(({ floor }) => floor))].sort((a, b) => b - a);
  if (!floors.includes(mapFloor)) mapFloor = map.floor;
  const tabs = element("map-floors");
  tabs.hidden = floors.length < 2;
  tabs.replaceChildren(...floors.map((floor) => {
    const tab = make("button", floorName(floor), "secondary");
    tab.type = "button";
    tab.dataset.floor = String(floor);
    tab.setAttribute("aria-pressed", String(floor === mapFloor));
    tab.addEventListener("click", () => {
      mapFloor = floor;
      renderMap();
      tabs.querySelector("[data-floor='" + floor + "']").focus();
    });
    return tab;
  }));
  // Every floor shares one origin and scale, so a stair's ends line up.
  // The passages that run along a floor, not between floors.
  const level = map.passages.filter(({ vertical }) => !vertical);
  const cells = [...map.rooms.map(({ at }) => at), ...level.flatMap(({ between }) => between.map(({ at }) => at))];
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  const centre = ([x, y]) => [MAP_PAD + (x - minX + 0.5) * MAP_CELL.x, MAP_PAD + (y - minY + 0.5) * MAP_CELL.y];
  const width = 2 * MAP_PAD + (Math.max(...cells.map(([x]) => x)) - minX + 1) * MAP_CELL.x;
  const height = 2 * MAP_PAD + (Math.max(...cells.map(([, y]) => y)) - minY + 1) * MAP_CELL.y;
  const canvas = element("map-canvas");
  // Redrawn while open (as a reply lands), focus stays on its room.
  const focusedRoom = canvas.contains(document.activeElement) ? document.activeElement.closest(".map-room")?.dataset.room || session.map.rooms.find(({ current }) => current).id : null;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  const roomOf = (end) => end.room && map.rooms.find(({ id }) => id === end.room);
  // The name of a room the character's room has an exit to, as Exits shows it.
  const exitName = (id) => session.room.exits.find((exit) => exit.id === id).name;
  // The rooms a passage from the character's room leads to: one click goes there.
  const nextDoor = new Set(map.passages.flatMap(({ move }) => move ? [move] : []));
  const lines = document.createElementNS(SVG, "svg");
  lines.setAttribute("class", "map-lines");
  lines.setAttribute("width", String(width));
  lines.setAttribute("height", String(height));
  lines.setAttribute("aria-hidden", "true");
  const nodes = [lines];
  const stubs = new Map();
  for (const passage of level.filter(({ between }) => between[0].floor === mapFloor)) {
    const [from, to] = passage.between.map(({ at }) => centre(at));
    const line = document.createElementNS(SVG, "line");
    line.setAttribute("x1", String(from[0]));
    line.setAttribute("y1", String(from[1]));
    line.setAttribute("x2", String(to[0]));
    line.setAttribute("y2", String(to[1]));
    if (passage.closed) line.setAttribute("class", "closed");
    lines.append(line);
    const marks = passageMarks(passage);
    marks.forEach((mark, index) => nodes.push(place(markNode(mark), [(from[0] + to[0]) / 2 + (index - (marks.length - 1) / 2) * (MAP_MARK + 2), (from[1] + to[1]) / 2], MAP_MARK, MAP_MARK)));
    for (const end of passage.between) {
      if (end.room) continue;
      const key = end.at.join(",");
      const stub = stubs.get(key) || { at: end.at };
      if (passage.move) stub.move = passage.move;
      stubs.set(key, stub);
    }
  }
  // A stub next to the character's room is named, as its exit is, and
  // drawn as a room; any other is a bare "?".
  for (const stub of stubs.values()) {
    if (stub.move) {
      const name = exitName(stub.move);
      const node = make("button", undefined, "secondary map-stub named");
      node.type = "button";
      node.append(make("span", name, "map-stub-name"), make("span", "Not yet explored", "map-stub-note"));
      node.setAttribute("aria-label", "Go to " + name + " (not yet explored)");
      node.addEventListener("click", () => mapGo(stub.move));
      nodes.push(place(node, centre(stub.at), MAP_ROOM.x, MAP_ROOM.y));
    } else {
      const node = make("span", "?", "map-stub");
      node.setAttribute("role", "img");
      node.setAttribute("aria-label", "A room not yet explored");
      nodes.push(place(node, centre(stub.at), MAP_STUB, MAP_STUB));
    }
  }
  for (const room of map.rooms.filter(({ floor }) => floor === mapFloor)) {
    const box = place(make("div", undefined, "map-room" + (room.current ? " current" : "")), centre(room.at), MAP_ROOM.x, MAP_ROOM.y);
    box.dataset.room = room.id;
    if (room.region) box.style.setProperty("--map-shade", regionShade(room.region.shade));
    const name = make("button", room.name, "quiet");
    name.type = "button";
    if (room.current) name.append(make("span", "You are here", "map-here"));
    else if (nextDoor.has(room.id)) name.title = "Go to " + room.name;
    name.addEventListener("click", () => {
      if (nextDoor.has(room.id) && mapGo(room.id)) return;
      mapRecordId = room.id;
      renderMapRecord();
    });
    box.append(name);
    // Each stair, ladder or shaft out of the room, naming where it leads.
    const climbs = map.passages.filter(({ vertical, between }) => vertical && between.some((end) => end.room === room.id));
    if (climbs.length) {
      const list = make("ul", undefined, "map-climbs");
      list.append(...climbs.map((passage) => {
        const other = passage.between.find((end) => end.room !== room.id);
        const up = other.floor > room.floor;
        const { word, letters } = compass(room.at, other.at);
        const moves = room.current && passage.move;
        // Named once visited, or from the character's room, as its exit is.
        const goes = roomOf(other) ? roomOf(other).name : moves ? exitName(passage.move) : "";
        const marks = passageMarks(passage);
        const text = (up ? "↑ " : "↓ ") + passage.vertical + (letters ? " " + letters : "") + ": " + (goes || "?") + marks.map(({ glyph }) => " " + glyph).join("");
        const said = (up ? "up" : "down") + " the " + passage.vertical + (word ? ", " + word : "") + ", to " + (goes || "a room not yet explored") + marks.map(({ label }) => "; " + label).join("");
        const item = make("li");
        const node = make(moves ? "button" : "span", text, moves ? "secondary map-climb" : "map-climb");
        node.title = titleCase(said);
        node.setAttribute("aria-label", moves ? "Go " + said : titleCase(said));
        if (moves) {
          node.type = "button";
          node.addEventListener("click", () => mapGo(passage.move));
        }
        item.append(node);
        return item;
      }));
      box.append(list);
    }
    nodes.push(box);
  }
  canvas.replaceChildren(...nodes);
  if (focusedRoom) canvas.querySelector(".map-room[data-room='" + focusedRoom + "'] > button")?.focus();
  renderMapKey(stubs.size > 0);
  renderMapRecord();
}

// The key: the regions on the floor shown, then the marks.
function renderMapKey(withStubs) {
  const regions = new Map(session.map.rooms.filter(({ floor, region }) => floor === mapFloor && region).map(({ region }) => [region.name, region.shade]));
  const entry = (node, text) => {
    const item = make("li");
    item.append(node, make("span", text));
    return item;
  };
  const swatch = (shade) => {
    const node = make("span", undefined, "map-swatch");
    node.style.setProperty("--map-shade", regionShade(shade));
    node.setAttribute("aria-hidden", "true");
    return node;
  };
  const mark = (glyph, kind) => markNode({ glyph, kind });
  const stub = make("span", "?", "map-stub");
  stub.setAttribute("aria-hidden", "true");
  element("map-key").replaceChildren(
    ...[...regions].map(([name, shade]) => entry(swatch(shade), name)),
    ...(withStubs ? [entry(stub, "Not yet explored")] : []),
    entry(mark("■", "door"), "Door, shut (□ open)"),
    entry(mark("!", "trap"), "Trap you found"),
    entry(mark("✕", "closed"), "Way closed"),
    entry(mark("↕", "door"), "Stairs, ladder or shaft"),
  );
}

// The record of the room chosen on the map (#405).
function renderMapRecord() {
  const record = element("map-record");
  const room = session.knownRooms.flatMap(({ rooms }) => rooms).find(({ id }) => id === mapRecordId);
  record.hidden = !room;
  record.replaceChildren(...(room ? recordNodes(room) : []));
}

// The character's own gear in "You carry" (#209): what it wears and the
// weapons in hand head the list, its arrows and bolts (#230) go with the
// consumables and its stowed gear with the other things (#432), each kind
// once with a count. Each entry's slot says which verbs go on it: Unequip on
// what is equipped, Wield, Equip and Drop on what is stowed; in the shop
// (#515), Sell. Its state says where it is; a magic item explains its bonus
// (#345).
function gearEntries(gear) {
  const counted = (items, slot, state, group) => {
    const counts = new Map();
    for (const { id, name, icon, magic, stats } of items) counts.set(id, { name, icon, magic, stats, count: (counts.get(id)?.count ?? 0) + 1 });
    return [...counts].map(([id, { name, icon, magic, stats, count }]) => ({ id, slot, group, state, name: count === 1 ? name : name + " (" + count + ")", icon, description: stats ? "" : magic ?? "", ...(stats ? { stats } : {}) }));
  };
  return [
    ...counted(gear.worn, "equipped", "Worn", "gear"),
    ...counted(gear.held, "equipped", "In hand", "gear"),
    ...counted(gear.stowed, "stowed", "Stowed", "other"),
    ...gear.ammunition.map(({ id, name, icon, count }) => ({ id, slot: "stowed", group: "consumable", state: "", name: name + " (" + count + ")", icon, description: "Ammunition: each shot spends one." })),
  ];
}

// "You carry" (#432) sorts what the character carries into groups, each a
// compact list: a line per entry with its icon, name and state, and its
// verbs on the right (renderActions puts them there, #198). An entry's
// description opens from its name. Treasure starts collapsed when it is long.
const CARRIED_GROUPS = [["gear", "Worn and wielded"], ["consumable", "Consumables"], ["treasure", "Treasure"], ["other", "Other"]];
// Treasure starts collapsed above this many entries.
const TREASURE_COLLAPSE_ABOVE = 4;
// The entries whose description the player opened, by id and slot, and
// whether the player opened (true) or closed (false) the treasure, or null
// for its default: both hold until the next adventure.
const openCarried = new Set();
let treasureOpen = null;

const carryingText = ({ weight, capacity }) => capacity === undefined ? "Carrying " + weight + " lb." : "Carrying " + weight + " lb of the " + capacity + " lb your Strength allows.";

function renderInventory(room) {
  const entries = [...gearEntries(room.gear), ...room.inventory];
  // The purse shows with what the character carries, once it holds coin.
  element("purse").replaceChildren(...(room.purse ? [icon(${JSON.stringify(COIN_ICON)}), "Purse: " + room.purse] : []));
  element("purse").hidden = !room.purse;
  element("carrying").textContent = carryingText(room.carrying);
  element("inventory-group").hidden = entries.length === 0 && !room.purse;
  element("inventory").replaceChildren(...CARRIED_GROUPS.flatMap(([group, title]) => {
    const members = entries.filter((entry) => entry.group === group);
    if (!members.length) return [];
    const list = make("ul", undefined, "carry-list");
    list.append(...members.map(carriedEntry));
    if (group === "treasure") {
      const box = make("details", undefined, "carry-group");
      box.dataset.group = group;
      box.open = treasureOpen ?? members.length <= TREASURE_COLLAPSE_ABOVE;
      // The player's click, not the toggle event, which setting open fires too.
      const summary = make("summary", title + " (" + members.length + ")", "carry-title");
      summary.addEventListener("click", () => {
        treasureOpen = !box.open;
      });
      box.append(summary, list);
      return [box];
    }
    const box = make("div", undefined, "carry-group");
    box.dataset.group = group;
    const heading = make("h4", title, "carry-title");
    heading.id = "carry-" + group;
    list.setAttribute("aria-labelledby", heading.id);
    box.append(heading, list);
    return [box];
  }));
}

// An item's stats (#504): a fact a line, then for gear not equipped what
// equipping it would do, set against what the character uses now.
function statsNodes(stats) {
  const facts = make("ul", undefined, "item-stats");
  facts.append(...stats.facts.map((fact) => make("li", fact)));
  return [facts, ...(stats.compare || []).map((line) => make("p", line, "item-compare"))];
}

// Room loot's stats (#504), behind a Stats toggle
// named for the item. The toggles the player opened, by key, stay open
// until the next adventure, as "You carry" entries do.
const openStats = new Set();
function statsToggle(key, name, stats) {
  const more = make("details", undefined, "stats-more");
  more.open = openStats.has(key);
  const summary = make("summary", "Stats");
  summary.addEventListener("click", () => {
    if (more.open) openStats.delete(key);
    else openStats.add(key);
  });
  summary.setAttribute("aria-label", "Stats: " + name);
  more.append(summary, ...statsNodes(stats));
  return more;
}

// One "You carry" entry: its line, which opens its description and its
// stats (#504) when it has them, and the controls renderActions fills.
function carriedEntry(entry) {
  const item = make("li");
  item.dataset.id = entry.id;
  if (entry.slot) item.dataset.slot = entry.slot;
  // A gem or art object shows its value (#239), a wand its charges (#346).
  // An item's icon before its name (#377).
  const name = make("strong", entry.name + (entry.value ? " (" + entry.value + ")" : "") + (entry.charges ? " (" + entry.charges + ")" : ""));
  const line = [...iconned(entry.icon, name), ...(entry.state ? [" ", make("span", entry.state, "carry-state")] : [])];
  if (entry.description || entry.stats) {
    const key = entry.id + "/" + (entry.slot ?? "");
    const more = make("details", undefined, "carry-more");
    more.open = openCarried.has(key);
    const summary = make("summary");
    summary.addEventListener("click", () => {
      if (more.open) openCarried.delete(key);
      else openCarried.add(key);
    });
    if (entry.description) summary.title = entry.description;
    summary.append(...line);
    more.append(summary, ...(entry.description ? [make("p", entry.description, "carry-text")] : []), ...(entry.stats ? statsNodes(entry.stats) : []));
    item.append(more);
  } else {
    const text = make("p", undefined, "carry-line");
    text.append(...line);
    item.append(text);
  }
  item.append(make("div", undefined, "controls"));
  return item;
}

function renderRoom(room) {
  // Its backdrop (#517), if it has one; an SVG element has no hidden property.
  for (const drawing of element("scene-backdrop").children) {
    drawing.toggleAttribute("hidden", drawing.dataset.backdrop !== room.backdrop);
  }
  element("room-region").textContent = room.region ?? "";
  element("room-region").hidden = room.region === undefined;
  element("room-title").textContent = room.name;
  // Once raised, the alarm (#401) stays shown, as a standing line.
  element("room-alarm").textContent = room.alarm ?? "";
  element("room-alarm").hidden = room.alarm === undefined;
  // The encounter waiting here (#530) heads Here; its opponents trading
  // while their band offers it (#305), a creature with the encounter's id,
  // are that card, not one of their own.
  const { waiting } = room;
  for (const list of ROOM_LISTS) {
    const head = list.key === "creatures" && waiting ? [waitingCard(waiting)] : [];
    const entries = room[list.key].filter(({ id }) => !head.length || id !== waiting.id);
    element(list.id + "-group").hidden = entries.length + head.length === 0;
    element(list.id).replaceChildren(...head, ...entries.map((entry) => {
      const item = make("li", undefined, "thing");
      item.dataset.id = entry.id;
      // The card's head (#520): its name and description, and its buttons
      // on the right, which renderActions fills.
      const head = make("div", undefined, "thing-head");
      const text = make("p", undefined, "thing-text");
      // An item's icon before its name (#377); an exit's way (#458).
      text.append(...iconned(entry.icon, make("strong", wayName(entry.direction, entry.name))), document.createTextNode(" — " + entry.description));
      head.append(text, make("div", undefined, "controls thing-controls"));
      item.append(head);
      if (entry.stats) item.append(statsToggle(list.id + "/" + entry.id, entry.name, entry.stats));
      // A creature's topics, under "Ask about" (#520), filled by renderActions.
      if (list.key === "creatures") {
        const ask = make("div", undefined, "ask-row");
        ask.setAttribute("role", "group");
        ask.setAttribute("aria-label", "Ask " + entry.name + " about");
        ask.hidden = true;
        item.append(ask);
      }
      if (entry.discovery) item.append(make("p", "You found: " + entry.discovery, "discovery"));
      // An exit's door and found trap (#132), a way a check opened or closed
      // (#282) or a flag opened or closed (#397), and what each topic drew
      // from a creature.
      if (entry.route) item.append(make("p", entry.route === "closed" ? "The way is closed." : entry.route === "open-now" ? "The way is open now." : "A way you found.", "route"));
      if (entry.door) item.append(make("p", entry.door.name + ": " + (entry.door.open ? "open" : "shut") + ". " + entry.door.description, "door"));
      if (entry.trap) item.append(make("p", entry.trap.name + ": " + TRAP_STATES[entry.trap.state] + ". " + entry.trap.description, "trap"));
      for (const topic of entry.topics || []) {
        if (topic.said) item.append(make("p", "About " + topic.name + ": " + topic.said, "discovery"));
      }
      return item;
    }));
  }
  renderInventory(room);
  element("room-empty").hidden = room.exits.length + room.features.length + room.creatures.length + room.items.length > 0 || Boolean(waiting);
}

// The opponents waiting in the room while their fight has not begun (#530):
// one card for the encounter, at the top of Here and stronger than the
// rest, as the centre of events there. Its state in words, each opponent's
// icon, name and description, and the buttons that act on them all, which
// renderActions puts on it: Ambush while unseen, the reaction's options
// while they react (and Trade while their band offers it). The fight
// panel's foe cards take over once the fight begins.
// Unseen, by one opponent or several.
const UNSEEN_TAGS = ["Hasn't seen you", "Haven't seen you"];
function waitingCard(waiting) {
  const item = make("li", undefined, "thing opponents-card");
  item.dataset.id = waiting.id;
  item.dataset.state = waiting.state;
  const several = waiting.opponents.length > 1;
  const state = waiting.state === "unseen" ? UNSEEN_TAGS[several ? 1 : 0] : REACTION_TAGS[waiting.state];
  item.append(make("p", state, "tag opponents-state"));
  for (const opponent of waiting.opponents) {
    const line = make("p", undefined, "opponent");
    line.append(...iconned(opponent.icon, make("strong", opponent.name, "opponent-name")));
    if (opponent.description) line.append(make("span", opponent.description, "opponent-text"));
    item.append(line);
  }
  item.append(make("div", undefined, "controls thing-controls opponents-controls"));
  return item;
}

// In a fight (#525) the room folds to its heading and one line naming its
// items and features, #room-fold, which opens them; out of a fight they are
// shown, as they are while a card offers an action the character can take
// (a way out once every foe is turned, #341). A control shown only with the
// reason it cannot be used, such as a merchant's Trade in a fight, offers
// nothing. A room with creatures but nothing to name stays open, so they
// are not hidden with no line to open them.
function renderRoomFold(fighting) {
  const { room } = session;
  const names = [...room.items, ...room.features].map(({ name }) => name);
  const offers = element("room-things").querySelector(".thing-controls > :not([data-unavailable])") !== null;
  const folding = fighting && !offers && (names.length > 0 || room.creatures.length === 0);
  const fold = element("room-fold");
  fold.hidden = !folding || names.length === 0;
  fold.textContent = names.join(", ");
  fold.title = fold.textContent;
  fold.setAttribute("aria-expanded", String(roomUnfolded));
  element("room-things").hidden = folding && !roomUnfolded;
}

// The character's AC and attacks from its gear as it stands (#209), in the
// status strip so a swap in a fight shows at once. Stowed gear is listed
// with what the character carries. The arrows and bolts held follow (#230),
// and a ranged weapon's own kind shows even when none are left.
function renderGear(gear) {
  const worn = gear.worn.map(({ name }) => name.toLowerCase()).join(", ");
  const shooting = gear.attack.ammunition;
  const ammunition = [...(shooting && !gear.ammunition.some(({ id }) => id === shooting) ? [{ id: shooting, count: 0 }] : []), ...gear.ammunition];
  element("gear-numbers").textContent = "AC " + gear.armorClass + (worn ? " (" + worn + ")" : "") + " · " + gear.attack.weapon + " " + attackText(gear.attack) + (gear.attack.grip === "two-handed" ? ", two-handed" : "") + (gear.lightAttack ? "; " + gear.lightAttack.weapon + " " + attackText(gear.lightAttack) + " as an extra attack" : "") + (ammunition.length ? "; " + ammunition.map(ammunitionText).join(", ") : "") + (gear.strengthShortfall ? "; speed −10 ft (Strength below " + gear.strengthShortfall.strength + ")" : "") + (gear.stealthDisadvantage ? "; Stealth disadvantage" : "") + untrainedText(gear) + ".";
}

/** A condition (#232) as a tag, such as "Prone", with its source and how it ends spoken. */
const conditionTag = (condition) => {
  const tag = make("span", condition.name, "tag condition");
  tag.dataset.condition = condition.kind;
  tag.append(spoken(": " + condition.text));
  return tag;
};
/** An ongoing spell effect (#337) as a tag, what it does spoken. */
const effectTag = (effect) => {
  const tag = make("span", effect.spell, "tag effect");
  tag.append(spoken(": " + effect.text));
  return tag;
};

// The fight panel (#525), at the top of the centre column while a fight is
// under way: "Fight · Round N" and the turn order, the character's card
// (its HP and every way to heal) beside each foe's card (its HP, what is on
// it and one attack), then the fight's other rows (the action bar moves
// in) and a footer of Flee, the turn's pips and End turn. The rolls behind
// the turn order are in the history's arrival entry (#524).
const MORALE_TAGS = { fleeing: "Fleeing", fled: "Fled", surrendering: "Surrendering", surrendered: "Surrendered" };
const TURN_UNDEAD_ID = ${JSON.stringify(TURN_UNDEAD_ID)};
/** A foe out of the fight, or turned, shows its state in place of an attack (#525). */
const foeState = (combatant) =>
  combatant.defeated ? "Fallen" : combatant.morale === "fled" ? "Fled" : combatant.morale === "surrendered" ? "Surrendered" : combatant.effects.some(({ spellId }) => spellId === TURN_UNDEAD_ID) ? "Turned" : "";

/** A card's name, with its icon (#377), and AC. */
function cardHead(combatant) {
  const head = make("div", undefined, "card-head");
  const name = make("strong", undefined, "card-name");
  name.append(...iconned(combatant.icon, combatant.name));
  head.append(name, make("span", "AC " + combatant.armorClass, "card-ac"));
  return head;
}

/** HP in large type ("4 / 10 HP") over its bar; screen readers hear "HP 4 of 10". */
function hpNodes({ hp, maxHp }) {
  const line = make("p", undefined, "card-hp");
  line.append(spoken("HP " + hp + " of " + maxHp), unspoken(make("span", String(hp), "hp-now")), unspoken(make("span", " / " + maxHp + " HP", "hp-max")));
  const bar = unspoken(make("span", undefined, "hp-bar"));
  const fill = make("span", undefined, "hp-fill");
  fill.style.width = (maxHp > 0 ? (100 * hp) / maxHp : 0) + "%";
  bar.append(fill);
  return [line, bar];
}

function renderFight(encounter) {
  element("encounter-title").textContent = "Fight · Round " + encounter.round;
  // The turn order on one line, the current turn in bold.
  element("turn-order").replaceChildren(spoken("Turn order: "), ...encounter.combatants.flatMap((combatant, index) => {
    const current = combatant.id === encounter.currentTurn;
    const whose = current ? (combatant.id === encounter.playerId ? " · your turn" : " · their turn") : "";
    const entry = make(current ? "strong" : "span", combatant.name + " " + combatant.initiative.total + whose, "turn-entry" + (foeState(combatant) ? " out" : ""));
    entry.dataset.combatant = combatant.id;
    if (current) entry.setAttribute("aria-current", "true");
    return [...(index > 0 ? [unspoken(make("span", " → ", "turn-arrow")), spoken(", ")] : []), entry];
  }));
  const self = encounter.combatants.find(({ id }) => id === encounter.playerId);
  // The character's card: its healing goes in #heal-controls (renderActions).
  const you = element("you-card");
  you.dataset.combatant = self.id;
  you.dataset.health = session.room.character.health;
  const heal = make("div", undefined, "controls card-controls");
  heal.id = "heal-controls";
  heal.setAttribute("role", "group");
  heal.setAttribute("aria-label", "Heal");
  // Its conditions (#232) and Hide (#307), as the status strip has them too.
  const own = make("p", undefined, "card-tags");
  // And whether it was surprised (#303).
  const surprised = self.initiative.mode?.disadvantage.includes("surprised") ? [make("span", "Surprised", "tag surprised")] : [];
  for (const node of [...self.conditions.map(conditionTag), ...(self.hidden ? [make("span", "Hidden", "tag")] : []), ...surprised]) own.append(...(own.childNodes.length ? [" "] : []), node);
  you.replaceChildren(cardHead(self), ...hpNodes(self), ...(own.childNodes.length ? [own] : []), heal);
  // A card per foe: its attack goes in its .foe-controls (renderActions).
  element("foe-cards").replaceChildren(...encounter.combatants.filter(({ id, side }) => id !== self.id && side !== self.side).map((foe) => {
    const card = make("li", undefined, "fight-card foe-card");
    card.dataset.combatant = foe.id;
    const state = foeState(foe);
    if (state) card.dataset.state = state.toLowerCase();
    if (foe.id === encounter.currentTurn) card.setAttribute("aria-current", "true");
    const tags = make("p", undefined, "card-tags");
    const tag = (node) => tags.append(...(tags.childNodes.length ? [" "] : []), node);
    // What is on it, unless it is out of the fight.
    if (!foe.defeated && foe.morale !== "fled" && foe.morale !== "surrendered") {
      foe.conditions.forEach((condition) => tag(conditionTag(condition)));
      foe.effects.forEach((effect) => tag(effectTag(effect)));
      if (foe.sapped) tag(make("span", "Sapped", "tag"));
      if (foe.hidden) tag(make("span", "Hidden", "tag"));
      // Morale (#237): a fleeing opponent leaves on its turn. One that may
      // surrender (#238) yields on its turn instead.
      if (foe.morale) tag(make("span", MORALE_TAGS[foe.morale], "tag morale"));
    }
    if (foe.initiative.mode?.disadvantage.includes("surprised")) tag(make("span", "Surprised", "tag surprised"));
    const controls = make("div", undefined, "controls card-controls foe-controls");
    // A turned foe (#341) may still be attacked, which ends its turning.
    card.append(cardHead(foe), ...hpNodes(foe), ...(tags.childNodes.length ? [tags] : []), ...(state ? [make("p", state, "card-state")] : []), ...(!state || state === "Turned" ? [controls] : []));
    return card;
  }));
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
  let answered = false;
  // What the answer changes, for its sounds: the history it adds, the fight
  // and the ending, which sounds only when this answer brings it (#483).
  const { history: earlier, encounter: before, ending: ended } = session;
  try {
    const result = await request(path, { sessionId: session.id, sequence: session.sequence, ...body });
    library = result.library;
    session = result.session;
    if (result.rejection) element("adventure-error").textContent = result.rejection;
    answered = true;
    return true;
  } catch (error) {
    element("adventure-error").textContent = error.message;
    return false;
  } finally {
    if (button) clearBusy(button);
    acting = false;
    renderAdventure();
    if (answered) {
      playSounds(resultSounds({
        character: findEntry(session.characterId)?.sheet.name ?? "",
        cards: session.history.slice(earlier.length).flatMap(({ cards }) => cards),
        before,
        after: session.encounter,
        ending: ended || !session.ending ? undefined : { kind: session.ending.kind, objective: session.ending.objective, levelUp: Boolean(session.ending.rewards?.levelUp) },
      }));
    }
  }
}

// The action bar (#156) and the room's cards (#520): every action the
// session view projects, in its order. In a fight the bar holds the
// character's whole toolkit; exploring, each move, examination and take is on
// the card of the thing it acts on. An action the engine would refuse stays
// in place, disabled, with the engine's reason beside it.
// Each action's words. A label or busy name is followed by its target's name.
// Exploring, the card names its thing and its buttons show short verbs
// (#157); each button's accessible name is still the full "Examine Iron-Bound
// Chest". Each thing has its own card (#214), its verbs at its right.
// While its request runs (#185) a button shows its busy label ("Attacking…")
// and is named in full ("Attacking Goblin Warrior…"). Each button is sized for
// the wider of its labels, so a fight button's busy label must be no wider
// than its idle one, so the bar never reflows when an action starts.
const ACTIONS = {
  attack: { label: "Attack ", busy: "Attacking ", busyLabel: "Attacking…" },
  "light-attack": { label: "Extra attack on ", busy: "Extra attack on ", busyLabel: "Attacking…" },
  use: { label: "Drink ", short: "Drink", busy: "Drinking ", busyLabel: "Drinking…" },
  "regain-slot": { label: "Regain a spell slot with ", short: "Regain a slot", busy: "Regaining a spell slot with ", busyLabel: "Regaining…" },
  move: { label: "Go to ", short: "Go", busy: "Going to ", busyLabel: "Going…" },
  sneak: { label: "Sneak into ", short: "Sneak", busy: "Sneaking into ", busyLabel: "Sneaking…" },
  ambush: { label: "Ambush in ", short: "Ambush", busy: "Ambushing in ", busyLabel: "Ambushing…" },
  // A reaction's option (#304) is named in full by its target: "Attack", "Pass peacefully".
  react: { label: "", busy: "", busyLabel: "Answering…" },
  examine: { label: "Examine ", short: "Examine", busy: "Examining ", busyLabel: "Examining…" },
  take: { label: "Take ", short: "Take", busy: "Taking ", busyLabel: "Taking…" },
  // Using a carried item on a feature (#400), in the feature's row by the item's name.
  "use-on": { label: "Use ", short: "Use", busy: "Using ", busyLabel: "Using…" },
  // A fight action (#402): a feature used against an opponent, in the Use the room row.
  "use-feature": { label: "Use ", busy: "Using ", busyLabel: "Using…" },
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
  // Cunning Action's Disengage, and fleeing a fight by an exit (#396).
  disengage: { label: "Disengage", busy: "Disengaging", busyLabel: "Disengaging…" },
  flee: { label: "Flee to ", busy: "Fleeing to ", busyLabel: "Fleeing…" },
  // Channel Divinity (#341): Divine Spark is chosen with its target and
  // mode beside the button; Spiritual Weapon's attack names its target.
  "divine-spark": { label: "Divine Spark", busy: "Using Divine Spark", busyLabel: "Channelling…" },
  "turn-undead": { label: "Turn Undead", busy: "Turning undead", busyLabel: "Turning…" },
  "preserve-life": { label: "Preserve Life", busy: "Using Preserve Life", busyLabel: "Healing…" },
  "spectral-attack": { label: "Spiritual Weapon: ", busy: "Striking with your spiritual weapon at ", busyLabel: "Striking…" },
  // Vampiric Touch's touch again (#344) names its target.
  "drain-attack": { label: "Vampiric Touch: ", busy: "Touching ", busyLabel: "Touching…" },
  // The answers to a hit Uncanny Dodge could halve (#308).
  "uncanny-dodge": { label: "Uncanny Dodge", busy: "Using Uncanny Dodge", busyLabel: "Dodging…" },
  "take-hit": { label: "Take the hit", busy: "Taking the hit", busyLabel: "Taking…" },
  // Falling rather than drinking a potion as Last Stand (#499).
  fall: { label: "Fall", busy: "Falling", busyLabel: "Falling…" },
  // A spell (#337), chosen with its slot level and target beside the button.
  cast: { label: "Cast", busy: "Casting", busyLabel: "Casting…" },
  // A healing spell on the character's card in a fight (#525).
  "heal-spell": { label: "Cast ", busy: "Casting ", busyLabel: "Casting…" },
  // A scroll's or wand's cast in a fight (#392), in the Items row.
  "cast-item": { label: "Use", busy: "Using", busyLabel: "Using…" },
  // A spell scroll read, or a wand used, outside a fight (#346), on its
  // "You carry" entry.
  read: { label: "Read ", short: "Read", busy: "Reading ", busyLabel: "Reading…" },
  "use-wand": { label: "Use ", short: "Use", busy: "Using ", busyLabel: "Using…" },
  "end-turn": { label: "End turn", busy: "Ending turn", busyLabel: "Ending" },
  // On the check just failed (#315): a use of Second Wind adds 1d10.
  "tactical-mind": { label: "Tactical Mind: add 1d10", busy: "Using Tactical Mind", busyLabel: "Adding…" },
  // A short rest (#334), in the character column with its choice of hit dice.
  rest: { label: "Short rest", busy: "Resting", busyLabel: "Resting…" },
  // A long rest at a rest site (#335), in the character column.
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
// In a fight a weapon's verbs say what they do (#392), "Swap Mace for
// Dagger" and "Hold Dagger in your other hand"; renderActions builds those
// labels, and these are their busy words.
const FIGHT_GEAR = {
  swap: { busy: "Swapping to ", busyLabel: "Swapping…" },
  equip: { busy: "Taking in hand ", busyLabel: "Taking…" },
};
const fightingNow = () => Boolean(session.encounter && session.encounter.currentTurn !== null);
const wordsOf = (action) => action === "end-turn" && paralysed() ? WAIT : fightingNow() && FIGHT_GEAR[action] ? FIGHT_GEAR[action] : ACTIONS[action];
// Leave names the adventure, not the room it is taken from.
// An item's use (#400) names the item, then the feature.
// A fight action (#402) names the feature, then its opponent.
// The way an exit leads (#458), from the room's exits: an action through an
// exit says it between its verb and the room ("Go west to Alcove"), and its
// target is shown as the Exits list shows it ("West: Alcove").
const THROUGH_EXITS = { move: ["Go", "to"], flee: ["Flee", "to"], sneak: ["Sneak", "into"] };
const directionOf = (action, target) => THROUGH_EXITS[action] ? session.room.exits.find(({ id }) => id === target.id)?.direction : undefined;
const wayName = (direction, name) => direction ? titleCase(direction) + ": " + name : name;
const wayLabel = (action, label, direction) => direction ? THROUGH_EXITS[action][0] + " " + direction + " " + THROUGH_EXITS[action][1] + " " : label;
const named = (action, target, item, feature) => feature ? feature.name + " against " + target.name : item ? item.name + " on " + target.name : target && action !== "leave" ? target.name : "";
// An attack names the weapon it is made with (#392).
const weaponOf = (action) => {
  const { gear } = session.room;
  return action === "attack" ? gear.attack.weapon : action === "light-attack" && gear.lightAttack ? gear.lightAttack.weapon : "";
};
const withWeapon = (action) => weaponOf(action) ? " with " + weaponOf(action) : "";
// The weapons held, each kind once with a count as "You carry" shows them:
// "Mace", "Shortsword and Dagger", "Dagger (2)".
const heldNames = (held) => {
  const counts = new Map();
  for (const { name } of held) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count === 1 ? name : name + " (" + count + ")")).join(" and ");
};
const busyName = ({ action, target, item, feature }) => wordsOf(action).busy + named(action, target, item, feature) + withWeapon(action) + "…";
// The attacks on one of several foes, beside its name (#392): their words
// without it.
const FOE_WORDS = { attack: "Attack", "light-attack": "Extra attack", "spectral-attack": "Spiritual Weapon", "drain-attack": "Vampiric Touch" };
const FIGHT_FEATURES = ["second-wind", "action-surge", "hide", "steady-aim", "disengage", "turn-undead", "preserve-life", "end-turn", "uncanny-dodge", "take-hit", "fall"];
const GEAR = ["equip", "unequip", "swap", "drop"];
// Buying and selling (#210, #239), made only in the shop (#515).
const TRADES = ["buy", "sell", "sell-equipped", "sell-treasure"];
// A weapon verb the engine refuses for what is held (#392): a second
// weapon beside one that isn't light, or with a shield or two weapons in
// hand, or a two-handed weapon with a shield. In a fight only Wield and
// Equip are offered, so only another weapon change, on a later turn, could
// make one work: the bar leaves them out (owner decision, 12 October 2026).
const HELD_REFUSALS = ${JSON.stringify([SHORT_REASONS["not-light"], SHORT_REASONS["hands-full"], SHORT_REASONS["two-handed"]])};
// The fight's rows (#392), in order, each named by its words; End turn's
// row has none. "answer" holds the answers to a hit waiting for a reaction,
// reaction spells such as Shield among them; "last-stand" every option
// while the character's fall waits for Last Stand (#499); "other" any fight
// action FIGHT_ROW doesn't place.
const FIGHT_ROWS = [["attack", "Attack"], ["cast", "Cast a spell"], ["channel-divinity", "Channel Divinity"], ["fighter", "Fighter features"], ["rogue", "Rogue features"], ["items", "Items"], ["weapons", "Weapons"], ["last-stand", "Last Stand"], ["answer", "Answer the hit"], ["room", "Use the room"], ["other", "Other actions"]];
// The row each of the fight's actions goes in.
const FIGHT_ROW = { attack: "attack", "light-attack": "attack", "spectral-attack": "attack", "drain-attack": "attack", "divine-spark": "channel-divinity", "turn-undead": "channel-divinity", "preserve-life": "channel-divinity", "second-wind": "fighter", "action-surge": "fighter", "tactical-mind": "fighter", hide: "rogue", "steady-aim": "rogue", disengage: "rogue", "use-feature": "room", use: "items", equip: "weapons", unequip: "weapons", swap: "weapons", drop: "weapons", "uncanny-dodge": "answer", "take-hit": "answer", fall: "last-stand" };
// What End turn would leave unused (#392), by the engine's option kinds.
const UNUSED_NAMES = { attack: "Attack", "light-attack": "Extra attack", "second-wind": "Second Wind", "action-surge": "Action Surge", hide: "Hide", "steady-aim": "Steady Aim", "drink-potion": "Drink", cast: "Cast a spell", "divine-spark": "Divine Spark", "turn-undead": "Turn Undead", "preserve-life": "Preserve Life", "spectral-attack": "Spiritual Weapon", "drain-attack": "Vampiric Touch" };
// The ways to heal on the character's card (#525), in this order.
const HEALS = ["second-wind", "use", "heal-spell", "preserve-life"];
// Whom a Channel Divinity action that takes no choice reaches (#392).
const CHANNEL_REACH = { "turn-undead": "every undead foe", "preserve-life": "heals you" };
// The ways out a flight (#396) can't take: the bar leaves them out.
const UNUSABLE_WAYS = ${JSON.stringify([SHORT_REASONS["door-shut"], SHORT_REASONS["route-closed"]])};
// A topic asked (#490) says so only in its description and title.
const ALREADY_ASKED = ${JSON.stringify(SHORT_REASONS["already-asked"])};
/** A talk option's topic and the creature it belongs to (#490). */
const topicAndCreature = (target) => {
  for (const creature of session.room.creatures) {
    const topic = creature.topics.find(({ id }) => id === target.id);
    if (topic) return { creature, topic };
  }
  return undefined;
};
const EXPLORING = ["ambush", "move", "sneak", "examine", "take", "use-on", "force", "pick", "break", "unlock", "search", "disarm", "talk", "regain-slot"];
// The way-out room's Leave (#520), on its heading.
const WAY_OUT = "Way out · Leave";
/**
 * The room's card an action's target is on (#520), as its list and id: an
 * exit by the room it leads to or by its door or found trap, else the
 * creature, item or feature (a body among them) of that id. None for the
 * room itself, a reaction's option or no target.
 */
const cardOf = (target) => {
  if (!target) return undefined;
  const { room } = session;
  const exit = room.exits.find(({ id, door, trap }) => id === target.id || door?.id === target.id || trap?.id === target.id);
  if (exit) return "exits/" + exit.id;
  const list = ROOM_LISTS.find(({ key }) => room[key].some(({ id }) => id === target.id));
  return list ? list.id + "/" + target.id : undefined;
};

/**
 * The attacks a flight would draw (#396), as Flee's menu says them (#525):
 * "Draws attacks from Snagtooth and Wick".
 */
function drawnAttacks(attackers) {
  if (!attackers || !attackers.length) return "Draws no attacks";
  const names = attackers.map(({ name }) => name);
  const all = names.length < 2 ? names[0] : names.slice(0, -1).join(", ") + " and " + names.at(-1);
  return (names.length < 2 ? "Draws an attack from " : "Draws attacks from ") + all;
}

/**
 * Flee (#525): one button opening a short menu of the ways out, headed by
 * the attacks a flight draws, or disabled with the reason every flight is
 * refused. The menu is a disclosure: Escape closes it and returns focus to
 * Flee, as choosing elsewhere on the page does.
 */
function renderFlee(ways, option) {
  element("flee-control").hidden = ways.length === 0;
  const refused = !option || !option.available;
  if (refused) fleeOpen = false;
  element("flee-toggle").disabled = acting || refused;
  element("flee-reason").textContent = option && refused ? option.reason : "";
  element("flee-attacks").textContent = option && !refused ? drawnAttacks(option.attackers) : "";
  element("flee-ways").replaceChildren(...ways);
  showFleeMenu(fleeOpen);
}

function showFleeMenu(open) {
  fleeOpen = open;
  element("flee-toggle").setAttribute("aria-expanded", String(open));
  element("flee-menu").hidden = !open;
}

function renderActions() {
  // The ending (#158) takes the bar's place; an ended adventure projects no actions.
  element("action-bar").hidden = session.status !== "playing";
  const { encounter, features } = session;
  const fighting = Boolean(encounter && encounter.currentTurn !== null);
  const attacks = session.actions.filter(({ action, cunningStrike: effect }) => action === "attack" && !effect).length;
  const ATTACKS = ["attack", "light-attack"];
  const left = (feature) => " (" + feature.uses + " of " + feature.max + " left)";
  const groups = { attack: [], feature: [], leave: [], carried: [] };
  // What is done in the room (#520): each card's buttons by
  // its list and id, and the row under the room's heading.
  const cards = new Map();
  const roomWide = [];
  // In a fight each control goes in its row (#392) instead of a group.
  const rows = Object.fromEntries(FIGHT_ROWS.map(([key]) => [key, []]));
  const carried = new Set(session.room.inventory.map(({ id }) => id));
  const { gear } = session.room;
  // While the character's fall waits (#499), its potions and Fall make the
  // Last Stand row.
  const lastStand = fighting && Boolean(session.encounter.pendingReaction && session.encounter.pendingReaction.lastStand);
  // Cunning Strike (#308): the effects the engine offers with some attack
  // go in one choice beside the turn's features, not on buttons of their
  // own; an attack that can't take the chosen one is disabled.
  const strikes = session.actions.filter((option) => option.cunningStrike);
  const effects = [...new Map(strikes.map(({ cunningStrike: effect }) => [effect.id, effect])).values()];
  if (!effects.some(({ id }) => id === cunningStrike)) cunningStrike = "";
  // In a fight every way to attack a foe is a chip in the attack chooser
  // (#526), and each foe's card carries the chosen one.
  const choices = fighting ? attackChoices() : [];
  // In a fight Cunning Strike sits under the attack chooser (#526), shown
  // only while a weapon attack is chosen there, the one it goes with; the
  // choice is kept while a spell is chosen.
  const weaponChosen = choices.length > 0 && chosenAttack(choices).choice.group === "weapon";
  if (effects.length && !fighting) groups.feature.push(strikeChoice(effects));
  element("strike-control").replaceChildren(...(effects.length && weaponChosen ? [strikeChoice(effects)] : []));
  const struck = (action, target) => strikes.some((option) => option.action === action && option.target.id === target.id && option.cunningStrike.id === cunningStrike);
  renderChooser(choices, struck, effects);
  // The ways to heal on the character's card (#525), with what each
  // restores and the action it takes; not while a fall waits for Last
  // Stand, whose row has its potions.
  const heals = session.healing || [];
  const healOf = (option) => {
    if (!fighting || lastStand) return undefined;
    const { action, target } = option;
    if (action === "second-wind" || action === "preserve-life") return heals.find((heal) => heal.action === action);
    if (action === "use") return heals.find((heal) => heal.action === "use" && heal.id === target.id);
    return undefined;
  };
  const healWraps = [];
  const fleeWraps = [];
  let fleeOption;
  const endWraps = [];
  renderRest(session.actions.find(({ action }) => action === "rest"), fighting);
  renderLongRest(session.actions.find(({ action }) => action === "long-rest"), fighting);
  // Spells (#337) go in one choice of spell and target, with Cast. A
  // scroll's or wand's (#346) go in a choice of their own in a fight's Items
  // row (#392), and outside a fight on its "You carry" entry. In a fight a
  // cast at a foe is the attack chooser's (#526): the rows keep the casts
  // on the character, its buffs and its healing at every slot.
  const casts = session.actions.filter(({ action, spell }) => action === "cast" && !spell.item);
  // While a hit waits, a reaction spell is one of its answers.
  const answering = session.actions.some(({ action }) => action === "take-hit");
  const own = (option) => !fighting || !atFoe(option);
  if (casts.some(own)) (fighting ? rows[answering ? "answer" : "cast"] : groups.feature).push(castPanel(casts.filter(own)));
  // A healing spell on the character (#525) is a button of its own on its
  // card, at the lowest slot it could spend now; Cast still offers it at
  // every slot.
  if (fighting && !lastStand && !answering) {
    const healOn = ({ spell, target }) => heals.find((heal) => heal.action === "cast" && heal.id === spell.id && (heal.slotLevel ?? 0) === (spell.slotLevel ?? 0) && target && target.id === encounter.playerId);
    const healing = casts.filter(healOn);
    for (const id of new Set(healing.map(({ spell }) => spell.id))) {
      const own = healing.filter(({ spell }) => spell.id === id);
      const chosen = own.find(({ available }) => available) || own[0];
      healWraps.push(healSpellButton(chosen, healOn(chosen)));
    }
  }
  const itemCasts = session.actions.filter(({ action, spell }) => action === "cast" && spell.item);
  if (fighting && itemCasts.some(own)) rows.items.push(castPanel(itemCasts.filter(own), "item"));
  session.actions.forEach((option, index) => {
    if (option.action === "cast" && option.spell.item && !fighting) groups.carried.push(itemRead(option, index));
  });
  // Divine Spark (#341): one choice of target and mode, with its button; in
  // a fight, where it is only ever at a foe, the attack chooser's (#526).
  const sparks = session.actions.filter(({ action }) => action === "divine-spark");
  if (sparks.length && !fighting) groups.feature.push(sparkPanel(sparks));
  session.actions.forEach((option, index) => {
    const { action, target } = option;
    // Trades are made in the shop (#515).
    if (option.cunningStrike || action === "rest" || action === "long-rest" || action === "cast" || action === "divine-spark" || TRADES.includes(action)) return;
    // In a fight the attacks are the chooser's (#526).
    if (fighting && FOE_WORDS[action] !== undefined) return;
    // A weapon verb that can't work with what is held is left out (#392).
    // So is swapping a weapon for another of the same kind.
    if (fighting && GEAR.includes(action) && !option.available && HELD_REFUSALS.includes(option.reason)) return;
    if (fighting && action === "swap" && gear.held.length && gear.held.every(({ id }) => id === target.id)) return;
    // A flight (#396) shows only through a way out the character could use.
    if (action === "flee" && !option.available && UNUSABLE_WAYS.includes(option.reason)) return;
    const exploring = EXPLORING.includes(action) || (action === "use" && !fighting);
    // Gear changes go on the gear's entry in "You carry" (#209), or in a
    // fight with the turn's other options, as Drink does.
    const group = ATTACKS.includes(action) || action === "spectral-attack" || action === "drain-attack" ? "attack" : action === "leave" ? "leave" : GEAR.includes(action) ? (fighting ? "feature" : "carried") : exploring && carried.has(target.id) ? "carried" : exploring ? "explore" : "feature";
    const words = wordsOf(action);
    const direction = directionOf(action, target);
    // A check with several approaches (#283) offers one button per skill;
    // a parley (#305) names its DC too.
    const dc = option.approach && option.approach.dc !== undefined ? " DC " + option.approach.dc : "";
    const way = option.approach ? " with " + option.approach.name + dc : "";
    // Another try the module offers (#284) says so, and why, under it.
    const again = option.retry ? "Try again: " : "";
    // Extra Attack's second attack (#287) says so; any opponent may take it.
    const second = action === "attack" && session.turn && session.turn.attacks > 0;
    // Channel Divinity's uses show once, on its row (#392).
    const label = fighting && action === "swap" ? "Swap " + heldNames(gear.held) + " for " + target.name : fighting && action === "equip" ? "Hold " + target.name + " in your other hand" : again + (second ? "Second attack on " : wayLabel(action, words.label, direction)) + named(action, target, option.item, option.feature) + withWeapon(action) + way + (action === "second-wind" ? left(features.secondWind) : action === "action-surge" ? left(features.actionSurge) : action === "tactical-mind" ? " (" + features.secondWind.uses + " of " + features.secondWind.max + " Second Wind left)" : "");
    const short = group === "explore" || group === "carried";
    // An Examine already made (#491) says so, muted but still there to use;
    // the engine never marks a check's Try again, which keeps its own words.
    const examined = option.examined === true;
    const button = make("button");
    // A parley's button keeps the verb; its skill and DC go under it (#305).
    const parley = action === "react" && option.approach;
    // A flight (#396) sits in the Flee row by the name of the room it leads to.
    const fleeing = fighting && action === "flee";
    // A way to heal (#525) on the character's card, with what it restores.
    const heal = healOf(option);
    const detail = heal ? heal.amount + " · " + heal.cost : "";
    // A topic sits in its creature's row (#490), by the topic's name.
    const asking = action === "talk" && short ? topicAndCreature(target) : undefined;
    // Leave sits on the way-out room's heading (#520), named in full.
    const leaving = action === "leave";
    const face = make("span", option.retry ? (short ? "Try again" : label) : asking ? asking.topic.name : examined ? "✓ Examined" : short ? (option.item ? "Use " + option.item.name : ACTIONS[action].short) : parley ? target.name : fleeing ? wayName(direction, target.name) : leaving ? WAY_OUT : label);
    if (detail) {
      const small = make("small", detail, "act-detail");
      small.id = "action-detail-" + index;
      face.append(" ", small);
    }
    button.append(face);
    button.dataset.busyLabel = words.busyLabel;
    button.type = "button";
    if (short || parley || fleeing) button.setAttribute("aria-label", label + (examined ? " (examined)" : ""));
    if (leaving) button.setAttribute("aria-label", WAY_OUT + " the adventure");
    // One opponent makes attacking the fight's primary action; several are peers.
    button.className = heal ? "heal secondary" : action === "attack" ? "attack " + (attacks === 1 ? "primary" : "secondary") : action === "light-attack" || action === "spectral-attack" || action === "drain-attack" ? "attack secondary" : action === "end-turn" ? "secondary" : group + (action === "move" ? " primary" : " secondary");
    // "act" marks an action control, in the bar or on a carried item.
    button.classList.add("act");
    if (examined) button.classList.add("examined");
    button.dataset.action = action;
    if (target) button.dataset.target = target.id;
    if (option.item) button.dataset.item = option.item.id;
    if (option.feature) button.dataset.feature = option.feature.id;
    if (option.approach) button.dataset.approach = option.approach.id;
    if (option.retry) button.dataset.retry = "true";
    button.disabled = acting || !option.available;
    button.addEventListener("click", () => action === "leave" ? openLeave() : perform(option));
    const wrap = make("span", undefined, "action");
    wrap.append(button);
    if (!option.available) wrap.dataset.unavailable = "true";
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
    // A flight's reason is its row's, said once (#396).
    const why = fleeing ? "" : !option.available ? option.reason : words === WAIT ? "You are paralysed, so you can only wait." : "";
    if (why) {
      const reason = make("span", why, "reason");
      reason.id = "action-reason-" + index;
      button.setAttribute("aria-describedby", reason.id);
      // A topic asked is greyed out with no caption under it (#490).
      if (asking && why === ALREADY_ASKED) {
        reason.hidden = true;
        button.title = why;
      }
      wrap.append(reason);
    }
    if (heal) {
      wrap.dataset.heal = action;
      healWraps.push(wrap);
      return;
    }
    if (group === "carried") {
      wrap.dataset.target = target.id;
      if (GEAR.includes(action)) wrap.dataset.slot = action === "unequip" ? "equipped" : "stowed";
      groups.carried.push(wrap);
      return;
    }
    // End turn says what it gives up (#392): what the engine would still
    // accept this turn, named as the bar names it. With nothing left the
    // turn ends by itself, so End turn only ever ends one early.
    // A few spells left to cast are named: "Cast a spell: Healing Word".
    const spellsLeft = [...new Set(session.actions.filter((option) => option.action === "cast" && option.available).map(({ spell }) => spell.name))];
    const unusedName = (kind) => (kind === "cast" && spellsLeft.length && spellsLeft.length <= 3 ? UNUSED_NAMES.cast + ": " + spellsLeft.join(", ") : UNUSED_NAMES[kind]);
    const unused = fighting && action === "end-turn" && words !== WAIT && session.turn ? session.turn.options.filter((kind) => UNUSED_NAMES[kind]).map(unusedName) : [];
    if (unused.length) {
      const line = make("span", undefined, "row-line end-line");
      const note = make("span", "Left unused: " + unused.join(", "), "end-note");
      note.id = "end-note";
      button.setAttribute("aria-describedby", [button.getAttribute("aria-describedby"), note.id].filter(Boolean).join(" "));
      line.append(note, wrap);
      endWraps.push(line);
      return;
    }
    // End turn closes the panel's footer (#525).
    if (fighting && action === "end-turn" && !lastStand) {
      endWraps.push(wrap);
      return;
    }
    // Each Channel Divinity action takes a line of its own, saying whom it
    // reaches when it needs no choice, so none reads as part of another's.
    // Every flight (#396) draws the same attacks: Flee's menu (#525) says
    // whose once, over the ways out.
    if (fleeing) {
      fleeOption ??= option;
      if (option.available && !fleeOption.available) fleeOption = option;
      button.setAttribute("aria-describedby", [button.getAttribute("aria-describedby"), "flee-attacks"].filter(Boolean).join(" "));
      fleeWraps.push(wrap);
      return;
    }
    const reach = CHANNEL_REACH[action];
    if (fighting && reach) {
      const line = make("span", undefined, "row-line");
      const hint = make("span", reach, "reach");
      hint.id = "action-reach-" + index;
      button.setAttribute("aria-describedby", [button.getAttribute("aria-describedby"), hint.id].filter(Boolean).join(" "));
      line.append(wrap, hint);
      rows[FIGHT_ROW[action]].push(line);
      return;
    }
    if (fighting && (group === "attack" || group === "feature")) {
      rows[(lastStand ? "last-stand" : FIGHT_ROW[action]) || "other"].push(wrap);
      return;
    }
    if (group === "attack" || group === "leave") {
      groups[group].push(wrap);
      return;
    }
    // The rest is done in the room (#520): on the card of the thing it acts
    // on, a creature's topics in its "Ask about" row (#490), and what acts
    // on no thing (a search of the room, Tactical Mind) in the row under the
    // room's heading.
    // Ambush and a reaction's options act on the whole encounter waiting
    // here (#530), so they go on its card, which has the encounter's id and
    // so gets the reacting opponents' Trade as a merchant card would.
    const waiting = (action === "ambush" || action === "react") && session.room.waiting;
    const card = asking ? "creatures/" + asking.creature.id : waiting ? "creatures/" + waiting.id : cardOf(target);
    if (!card) {
      roomWide.push(wrap);
      return;
    }
    if (!cards.has(card)) cards.set(card, { verbs: [], topics: [] });
    cards.get(card)[asking ? "topics" : "verbs"].push(wrap);
  });
  // In a fight the Attack row heads the bar and the others follow it.
  const fightRows = FIGHT_ROWS.filter(([key]) => rows[key].length).map(([key, name]) => actionRow(key, name, rows[key]));
  element("attack-controls").classList.toggle("rows", fighting);
  element("feature-controls").classList.toggle("rows", fighting);
  element("attack-controls").replaceChildren(...(fighting ? fightRows.filter(({ dataset }) => dataset.row === "attack") : groups.attack));
  element("feature-controls").replaceChildren(...(fighting ? fightRows.filter(({ dataset }) => dataset.row !== "attack") : groups.feature));
  // Each card's buttons (#520): its verbs on the right, then a merchant's
  // Trade (#515); a creature's topics under "Ask about".
  for (const list of ROOM_LISTS) {
    for (const card of element(list.id).children) {
      const placed = cards.get(list.id + "/" + card.dataset.id) ?? { verbs: [], topics: [] };
      const merchant = list.key === "creatures" ? session.room.creatures.find(({ id, wares }) => id === card.dataset.id && wares) : undefined;
      card.querySelector(".thing-controls").replaceChildren(...placed.verbs, ...(merchant ? [tradeControl(merchant)] : []));
      const ask = card.querySelector(".ask-row");
      if (ask) {
        ask.replaceChildren(...(placed.topics.length ? [unspoken(make("span", "Ask about", "ask-label")), ...placed.topics] : []));
        ask.hidden = placed.topics.length === 0;
      }
    }
  }
  element("room-actions").replaceChildren(...roomWide);
  // The fight panel's healing, Flee and End turn (#525).
  element("heal-controls")?.replaceChildren(...healWraps.sort((one, other) => HEALS.indexOf(one.dataset.heal) - HEALS.indexOf(other.dataset.heal)));
  element("end-controls").replaceChildren(...endWraps);
  renderFlee(fleeWraps, fleeOption);
  element("leave-controls").replaceChildren(...groups.leave);
  // A carried item's verbs go on its entry in "You carry" (#198).
  for (const entry of document.querySelectorAll("#inventory li[data-id]")) {
    const verbs = groups.carried.filter((wrap) => wrap.dataset.target === entry.dataset.id && wrap.dataset.slot === entry.dataset.slot);
    const controls = entry.querySelector(".controls");
    controls.replaceChildren(...verbs);
    controls.hidden = verbs.length === 0;
  }
  // While Leave asks for confirmation, the question stands in its place.
  const asking = confirmingLeave && groups.leave.length > 0;
  element("leave-controls").hidden = asking;
  element("leave-confirm").hidden = !asking;
  // The engine names the ending leaving would bring, and warns when it falls
  // short of the module's objective (#475).
  const leaving = session.actions.find(({ action }) => action === "leave")?.leaving;
  const ending = leaving ? " as " + leaving.ending.title + (leaving.ending.xp === undefined ? "" : " (" + leaving.ending.xp + " XP)") : "";
  element("leave-question").textContent = "Leave " + session.adventure.title + "? This ends the adventure here" + ending + ". Any treasure or coin you carry out is yours to keep; you cannot come back to this adventure.";
  element("leave-warning").textContent = leaving?.warning ?? "";
  element("confirm-leave").disabled = acting;
  element("cancel-leave").disabled = acting;
}

// One of the fight's rows (#392): its name and, for Channel Divinity, the
// uses its actions share, then its controls. The group is named by both.
// End turn's row has no name.
function actionRow(key, name, controls) {
  const row = make("div", undefined, "action-row");
  row.dataset.row = key;
  const label = make("div", undefined, "row-label");
  if (name) {
    label.id = "row-" + key;
    label.append(make("span", name, "row-name"));
    const uses = key === "channel-divinity" && session.channelDivinity;
    if (uses) label.append(make("span", uses.uses + " of " + uses.max + " left", "row-uses"));
    row.setAttribute("role", "group");
    row.setAttribute("aria-labelledby", label.id);
  }
  const body = make("div", undefined, "row-controls");
  body.append(...controls);
  row.append(label, body);
  return row;
}

// "2 of 2 left", or "unlimited" by the adventure's settings (#508).
const restsLeft = ({ left, max, unlimited }) => unlimited ? "unlimited" : left + " of " + max + " left";
// "2 of 2 left in this region", or "unlimited".
const restsLeftIn = (rests) => restsLeft(rests) + (rests.unlimited ? "" : " in this " + (rests.per || "adventure"));
const noneLeft = ({ left, unlimited }) => !unlimited && left === 0;

// The Rest section (#521) in the character column, shown whenever the
// adventure is in play. In a fight it says why not, with the rests left.
// Otherwise the short rest (#334): the short rests and hit dice left, how
// many hit dice to spend (the most the engine accepts unless the player
// chose fewer) and Short rest, disabled with its reason when the engine
// would refuse, or when it offers no rest because none is left or a rest
// would restore nothing.
function renderRest(option, fighting) {
  element("rest-group").hidden = session.status !== "playing";
  element("rest-fight").hidden = !fighting;
  element("short-rest").hidden = fighting;
  if (fighting) {
    element("rest-counts").textContent = "Short rests " + restsLeft(session.shortRests) + " · Long rests " + restsLeft(session.longRests);
    element("rest-controls").replaceChildren();
    return;
  }
  const { available, total, sides } = session.hitDice;
  element("rest-summary").replaceChildren(make("b", "Short rest"), " " + restsLeftIn(session.shortRests) + " · Hit dice " + available + " of " + total + " d" + sides + " left");
  if (!option) {
    element("rest-controls").replaceChildren(restButton("rest", { available: false, reason: noneLeft(session.shortRests) ? "No short rests left" : "Nothing to recover" }, () => {}));
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
  if (option.available && option.rest.memorize) controls.push(...memorizeControls(option.rest.memorize));
  controls.push(restButton("rest", option, () => takeRest(Number(element("rest-dice").value))));
  element("rest-controls").replaceChildren(...controls);
}

// Memorize Spell's choices (#344): a prepared spell to forget and one in
// the spellbook to prepare instead. Choosing one picks the other's first
// when it has none; "none" in either clears both. When the swap is all the
// rest would bring, there is no "none".
function memorizeControls(memorize) {
  const spells = { forget: memorize.forget, learn: memorize.learn };
  for (const key of ["forget", "learn"]) {
    if (restSwap[key] && !spells[key].some(({ id }) => id === restSwap[key])) restSwap = { forget: "", learn: "" };
  }
  if (memorize.only && !restSwap.forget) restSwap = { forget: memorize.forget[0].id, learn: memorize.learn[0].id };
  const hint = make("p", "Memorize Spell: swap one prepared spell for another in your spellbook until the adventure ends.", "hint");
  hint.id = "rest-memorize";
  const field = (key, text, none) => {
    const label = make("label", text);
    const select = make("select");
    select.id = "rest-" + key;
    select.disabled = acting;
    const choices = [...(memorize.only ? [] : [{ id: "", name: none }]), ...spells[key].map(({ id, name, level }) => ({ id, name: name + " (" + ordinalLevel(level) + ")" }))];
    for (const { id, name } of choices) {
      const choice = make("option", name);
      choice.value = id;
      choice.selected = id === restSwap[key];
      select.append(choice);
    }
    select.addEventListener("change", () => {
      const other = key === "forget" ? "learn" : "forget";
      restSwap = select.value ? { ...restSwap, [key]: select.value, [other]: restSwap[other] || spells[other][0].id } : { forget: "", learn: "" };
      element("rest-forget").value = restSwap.forget;
      element("rest-learn").value = restSwap.learn;
    });
    label.append(select);
    return label;
  };
  return [hint, field("forget", "Forget ", "Keep my spells"), field("learn", "Prepare ", "No swap")];
}

// "1st", "2nd", "3rd": a spell's level in a choice.
function ordinalLevel(level) {
  return level + (level === 1 ? "st" : level === 2 ? "nd" : level === 3 ? "rd" : "th");
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

// The long rest (#335, #521): at a rest site the long rests left and Long
// rest, disabled with the engine's reason when it would refuse (foes here, or
// the long rest already taken) or with why the engine offers none. Elsewhere
// one line: only at a rest site, or none left. In a fight it is hidden.
function renderLongRest(option, fighting) {
  element("long-rest").hidden = fighting;
  const controls = element("long-rest-controls");
  const label = make("b", "Long rest");
  const spent = noneLeft(session.longRests);
  if (fighting || !session.room.restSite) {
    const reason = make("span", spent ? "No long rest left" : "Only at a rest site", "reason");
    reason.id = "long-rest-reason";
    element("long-rest-summary").replaceChildren(label, " ", reason);
    controls.replaceChildren();
    return;
  }
  element("long-rest-summary").replaceChildren(label, " " + restsLeftIn(session.longRests) + ". This is a safe place to rest.");
  controls.replaceChildren(restButton("long-rest", option ?? { available: false, reason: spent ? "No long rest left" : "Nothing to recover" }, takeLongRest));
}

async function takeLongRest() {
  await act("/api/5e/session/long-rest", {}, "button.act[data-action=long-rest]", ACTIONS["long-rest"].busy + "…");
  keepFocus("long-rest", "");
}

async function takeRest(hitDice) {
  const { forget, learn } = restSwap;
  restDice = null;
  restSwap = { forget: "", learn: "" };
  await act("/api/5e/session/rest", { hitDice, ...(forget && learn ? { memorize: { forget, learn } } : {}) }, "button.act[data-action=rest]", ACTIONS.rest.busy + "…");
  keepFocus("rest", "");
}

// The shop (#515): a merchant's Trade opens it over the session area, and
// Leave the shop (or Esc) returns to the room, with focus on Trade. Its
// wares, the details of the item chosen from them or the pack, with its one
// Buy or Sell, and the pack, grouped by what the merchant pays: treasure at
// its full value (with Sell all treasure), gear at the buy-back price,
// ammunition by the 20, and what the merchant doesn't buy. Each trade's
// result shows in the receipt line, and its history entry is the usual one.
const merchantHere = () => session.room.creatures.find(({ wares }) => wares);
const minutesText = (minutes) => minutes + (minutes === 1 ? " minute" : " minutes");

/** Closes the shop and any question it asks, without rendering. */
function resetShop() {
  shop = null;
  confirmingSale = null;
  confirmingSellAll = false;
}
const tradeOption = (action, id) => session.actions.find((option) => option.action === action && option.target.id === id);
// The sale each "You carry" slot offers: a gem or art object has none.
const SALE_OF = { equipped: "sell-equipped", stowed: "sell" };
// The pack's groups, in order; the last is named for the merchant.
const SHELVES = [["treasure", "Treasure"], ["gear", "Gear"], ["ammunition", "Ammunition"], ["unsold", ""]];

/** The merchant's Trade, on its card in the room: disabled in a fight. */
function tradeControl(merchant) {
  const button = make("button", "Trade", "secondary");
  button.id = "open-shop";
  button.type = "button";
  button.setAttribute("aria-label", "Trade with " + merchant.name);
  button.disabled = acting || fightingNow();
  button.addEventListener("click", () => openShop(merchant.id));
  const wrap = make("span", undefined, "action");
  wrap.append(button);
  if (fightingNow()) {
    wrap.dataset.unavailable = "true";
    const reason = make("span", "Not while you are fighting", "reason");
    reason.id = "open-shop-reason";
    button.setAttribute("aria-describedby", reason.id);
    wrap.append(reason);
  }
  return wrap;
}

/**
 * What the character carries, as the shop's pack shows it: each entry with
 * its sale, if the merchant makes one, its shelf and what it sells for.
 */
function packEntries(room, merchant) {
  const ammunition = new Set(room.gear.ammunition.map(({ id }) => id));
  return [...gearEntries(room.gear), ...room.inventory].map((entry) => {
    const option = tradeOption(entry.slot ? SALE_OF[entry.slot] : "sell-treasure", entry.id);
    const shelf = !option ? "unsold" : entry.value ? "treasure" : ammunition.has(entry.id) ? "ammunition" : "gear";
    const price = entry.value ?? merchant.salePrices.find(({ id }) => id === entry.id)?.price;
    return { ...entry, option, shelf, price };
  });
}

const chosenIs = (list, id, slot = "") => Boolean(shop.chosen) && shop.chosen.list === list && shop.chosen.id === id && shop.chosen.slot === slot;

/** A row of the wares or the pack: the item's icon, name and price, which chooses it. */
function shopRow(list, entry, price) {
  const slot = entry.slot ?? "";
  const row = make("li");
  if (list === "ware") row.dataset.ware = entry.id;
  else {
    row.dataset.id = entry.id;
    row.dataset.slot = slot;
  }
  const button = make("button", undefined, "shop-item secondary");
  button.type = "button";
  button.setAttribute("aria-pressed", String(chosenIs(list, entry.id, slot)));
  const name = make("span", undefined, "shop-name");
  name.append(...iconned(entry.icon, entry.name));
  // Gear is marked worn or in hand.
  if (entry.slot === "equipped") name.append(" ", make("span", entry.state, "shop-state"));
  button.append(name);
  if (price) button.append(spoken(", "), make("span", price, "shop-price"));
  button.addEventListener("click", () => chooseInShop(list, entry.id, slot));
  row.append(button);
  return row;
}

function renderShop() {
  const merchant = merchantHere();
  // The shop closes when trade does: the adventure over, the merchant gone
  // (moved away, or the reaction's band ended) or a fight begun.
  if (shop && (session.status !== "playing" || !merchant || merchant.id !== shop.merchant || fightingNow())) {
    const inside = element("shop").contains(document.activeElement);
    resetShop();
    element("shop").hidden = true;
    element("session-layout").hidden = false;
    if (inside) element(session.ending ? "ending-title" : "adventure-title").focus();
  }
  element("session-layout").hidden = Boolean(shop);
  element("shop").hidden = !shop;
  if (!shop) return;
  const { room } = session;
  element("shop-title").replaceChildren(merchant.name, " ", make("span", "open for trade", "shop-open"));
  element("shop-greeting").textContent = merchant.description;
  element("shop-terms").textContent = "Each trade takes " + minutesText(merchant.tradeMinutes) + ". " + merchant.name + " pays " + merchant.buyBack + " for gear and full value for gems and art objects.";
  element("shop-purse").replaceChildren(icon(${JSON.stringify(COIN_ICON)}), "Purse: " + (room.purse ?? "empty"));
  element("shop-load").textContent = carryingText(room.carrying);
  // A trade in flight, Sell all's included, finishes before the shop closes.
  element("leave-shop").disabled = acting;
  element("shop-ware-list").replaceChildren(...merchant.wares.map((ware) => shopRow("ware", ware, ware.price)));
  const pack = packEntries(room, merchant);
  if (confirmingSellAll && !(merchant.treasureSale && pack.some(({ shelf }) => shelf === "treasure"))) confirmingSellAll = false;
  element("shop-pack-groups").replaceChildren(...SHELVES.flatMap(([shelf, title]) => {
    const members = pack.filter((entry) => entry.shelf === shelf);
    if (!members.length) return [];
    const group = make("div", undefined, "shop-group");
    group.dataset.shelf = shelf;
    const head = make("div", undefined, "shop-group-head");
    const heading = make("h5", shelf === "unsold" ? merchant.name + " doesn't buy these" : title);
    heading.id = "shop-shelf-" + shelf;
    head.append(heading);
    if (shelf === "treasure" && merchant.treasureSale && !confirmingSellAll) head.append(sellAllControl());
    const list = make("ul", undefined, "shop-list");
    list.setAttribute("aria-labelledby", heading.id);
    list.append(...members.map((entry) => shopRow("pack", entry, entry.shelf === "unsold" ? "" : entry.price)));
    group.append(head, ...(shelf === "treasure" && confirmingSellAll ? [sellAllQuestion(merchant)] : []), list);
    return [group];
  }));
  renderShopDetail(merchant, pack);
  const receipt = element("shop-receipt");
  receipt.textContent = shop.receipt ? shop.receipt.text : "";
  receipt.classList.toggle("error", Boolean(shop.receipt && shop.receipt.error));
}

/** The chosen item's details: what it is and costs or fetches, its stats (#504) and its one Buy or Sell. */
function renderShopDetail(merchant, pack) {
  const box = element("shop-detail");
  const chosen = shop.chosen;
  const ware = chosen && chosen.list === "ware" ? merchant.wares.find(({ id }) => id === chosen.id) : undefined;
  const entry = chosen && chosen.list === "pack" ? pack.find(({ id, slot }) => id === chosen.id && (slot ?? "") === chosen.slot) : undefined;
  if (!ware && !entry) {
    if (confirmingSale) confirmingSale = null;
    box.replaceChildren(make("p", "Choose an item to see its details.", "shop-note"));
    return;
  }
  const item = ware ?? entry;
  const title = make("h4");
  title.id = "shop-item-name";
  title.append(...iconned(item.icon, item.name));
  if (entry && entry.slot === "equipped") title.append(" ", make("span", entry.state, "shop-state"));
  const price = ware
    ? "Price: " + ware.price
    : entry.shelf === "treasure"
      ? "Worth " + entry.price + ": " + merchant.name + " pays its full value."
      : entry.shelf === "ammunition"
        ? merchant.name + " pays " + entry.price + " for a bundle of 20."
        : entry.shelf === "gear"
          ? merchant.name + " pays " + entry.price + " (" + merchant.buyBack + ")."
          : merchant.name + " doesn't buy this.";
  const option = ware ? tradeOption("buy", ware.id) : entry.option;
  const asking = option && option.action === "sell-equipped" && confirmingSale === option.target.id;
  if (!asking && confirmingSale) confirmingSale = null;
  box.replaceChildren(
    title,
    make("p", price, entry && entry.shelf === "unsold" ? "shop-note" : "shop-price-line"),
    ...(entry && entry.description ? [make("p", entry.description, "shop-text")] : []),
    ...(item.stats ? statsNodes(item.stats) : []),
    ...(!option ? [] : asking ? [saleQuestion(option.target, entry.price)] : [shopTradeButton(option, ware ? ware.price : entry.price)]),
  );
}

/** The details' Buy or Sell, by its price; disabled with the engine's reason. */
function shopTradeButton(option, price) {
  const { action, target } = option;
  const verb = action === "buy" ? "Buy" : "Sell";
  const button = make("button", undefined, "act primary");
  button.append(make("span", verb + " for " + price));
  button.type = "button";
  button.dataset.action = action;
  button.dataset.target = target.id;
  button.dataset.busyLabel = ACTIONS[action].busyLabel;
  button.setAttribute("aria-label", verb + " " + target.name + " for " + price);
  button.disabled = acting || !option.available;
  button.addEventListener("click", () => (action === "sell-equipped" ? openSale(option) : shopTrade(option)));
  const wrap = make("span", undefined, "action");
  wrap.append(button);
  if (!option.available) {
    const reason = make("span", option.reason, "reason");
    reason.id = "shop-reason";
    button.setAttribute("aria-describedby", reason.id);
    wrap.append(reason);
  } else {
    // What the trade leaves in the purse.
    const purse = parseCoins(session.room.purse ?? "");
    const after = action === "buy" ? purse - parseCoins(price) : purse + parseCoins(price);
    const left = make("span", "Purse after: " + (after === 0 ? "empty" : formatCoins(after)), "purse-after");
    left.id = "shop-purse-after";
    button.setAttribute("aria-describedby", left.id);
    wrap.append(left);
  }
  return wrap;
}

function openShop(merchantId) {
  const merchant = merchantHere();
  if (!merchant || acting) return;
  const [first] = merchant.wares;
  shop = { merchant: merchantId, chosen: first ? { list: "ware", id: first.id, slot: "" } : null, receipt: null };
  confirmingSale = null;
  confirmingSellAll = false;
  renderShop();
  element("shop-title").focus();
  // The bell over the shop's door.
  playSounds(["shop-bell"]);
}

function closeShop() {
  if (!shop || acting) return;
  resetShop();
  renderShop();
  const trade = element("open-shop");
  if (trade) trade.focus();
}

function chooseInShop(list, id, slot) {
  shop.chosen = { list, id, slot };
  confirmingSale = null;
  renderShop();
  const row = list === "ware" ? "#shop-ware-list li[data-ware=" + JSON.stringify(id) + "]" : "#shop-pack-groups li[data-id=" + JSON.stringify(id) + "][data-slot=" + JSON.stringify(slot) + "]";
  document.querySelector(row + " button").focus();
}

/**
 * Sets the receipt to the history entries since before, or the refusal or
 * error; a request that never reached the server leaves it as it was.
 */
function receiptSince(before, done) {
  const error = element("adventure-error").textContent;
  if (error) shop.receipt = { text: error, error: true };
  else if (done) shop.receipt = { text: session.history.slice(before).flatMap(({ cards }) => cards.map(({ text }) => text)).join(" "), error: false };
}

/**
 * After a trade, focus stays on its button while it is still enabled, and
 * otherwise moves to the receipt, the trade's result.
 */
function shopFocus(action, targetId) {
  if (!shop) return;
  const same = [...document.querySelectorAll("#shop-detail button.act")].find((button) => button.dataset.action === action && button.dataset.target === targetId);
  if (same && !same.disabled) same.focus();
  else element("shop-receipt").focus();
}

async function shopTrade(option) {
  const { action, target } = option;
  const before = session.history.length;
  const done = await act("/api/5e/session/explore", { action, target: target.id }, "#shop-detail button.act[data-action=" + JSON.stringify(action) + "]", busyName(option));
  if (!shop) return;
  receiptSince(before, done);
  renderShop();
  shopFocus(action, target.id);
}

// The question an equipped item's Sell asks first, in the shop's details (#210).
function saleQuestion(target, price) {
  const merchant = merchantHere();
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
  renderShop();
  element("confirm-sale").focus();
}

function cancelSale() {
  const itemId = confirmingSale;
  confirmingSale = null;
  renderShop();
  const sell = document.querySelector("button.act[data-action=sell-equipped][data-target=" + JSON.stringify(itemId) + "]");
  if (sell) sell.focus();
}

async function sellEquipped() {
  const option = session.actions.find(({ action, target }) => action === "sell-equipped" && target.id === confirmingSale);
  if (!option) return;
  const before = session.history.length;
  const done = await act("/api/5e/session/explore", { action: "sell-equipped", target: option.target.id }, "#confirm-sale", "Selling…");
  if (!shop) return;
  // A failed request leaves the question open to try again.
  if (done) confirmingSale = null;
  receiptSince(before, done);
  renderShop();
  if (confirmingSale) element("confirm-sale").focus();
  else shopFocus("sell-equipped", option.target.id);
}

// Sell all treasure (#515): every gem and art object, one trade each, after
// a question naming the coin and the minutes they take.
function sellAllControl() {
  const button = make("button", "Sell all treasure", "secondary");
  button.id = "sell-all-treasure";
  button.type = "button";
  button.disabled = acting || !session.actions.some(({ action, available }) => action === "sell-treasure" && available);
  button.addEventListener("click", openSellAll);
  return button;
}

function sellAllQuestion(merchant) {
  const { count, coin, minutes } = merchant.treasureSale;
  const box = make("div", undefined, "confirm");
  box.id = "sell-all-confirm";
  const question = make("p", "Sell " + (count === 1 ? "your gem or art object" : "all " + count + " gems and art objects") + " to " + merchant.name + " for " + coin + "? " + (count === 1 ? "It takes " + minutesText(minutes) + "." : "Each trade takes " + minutesText(merchant.tradeMinutes) + ": " + minutes + " minutes in all."));
  question.id = "sell-all-question";
  const confirm = make("button", "Sell all", "primary danger");
  confirm.id = "confirm-sell-all";
  confirm.type = "button";
  confirm.disabled = acting;
  confirm.setAttribute("aria-describedby", question.id);
  confirm.addEventListener("click", sellAllTreasure);
  const cancel = make("button", "Keep them", "secondary");
  cancel.id = "cancel-sell-all";
  cancel.type = "button";
  cancel.disabled = acting;
  cancel.addEventListener("click", cancelSellAll);
  const controls = make("div", undefined, "controls");
  controls.append(confirm, cancel);
  box.append(question, controls);
  return box;
}

function openSellAll() {
  confirmingSellAll = true;
  renderShop();
  element("confirm-sell-all").focus();
}

function cancelSellAll() {
  confirmingSellAll = false;
  renderShop();
  element("sell-all-treasure").focus();
}

async function sellAllTreasure() {
  const merchant = merchantHere();
  const sale = merchant.treasureSale;
  const before = session.history.length;
  const sales = session.actions.filter(({ action, available }) => action === "sell-treasure" && available);
  let sold = 0;
  for (const option of sales) {
    if (!shop || !confirmingSellAll) break;
    const done = await act("/api/5e/session/explore", { action: "sell-treasure", target: option.target.id }, "#confirm-sell-all", "Selling…");
    if (!done || element("adventure-error").textContent) break;
    sold += 1;
  }
  if (!shop) return;
  confirmingSellAll = false;
  // All sold, the receipt says so in one line; otherwise what went wrong.
  if (sold === sales.length && sold === sale.count) shop.receipt = { text: "You sell " + (sold === 1 ? "your gem or art object" : sold + " gems and art objects") + " to " + merchant.name + " for " + sale.coin + ". " + (sold === 1 ? "The trade takes " : "The trades take ") + minutesText(sale.minutes) + ". Purse: " + (session.room.purse ?? "empty") + ".", error: false };
  else receiptSince(before, sold > 0);
  renderShop();
  element("shop-receipt").focus();
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
const castKey = ({ spell }) => spell.id + ":" + (spell.slotLevel || "") + ":" + (spell.damageType || "") + ":" + (spell.curse || "") + ":" + (spell.item ? spell.item.id : "");

// A scroll's or wand's cast (#346) as the Cast choice names it: "Magic
// Missile — Wand of Magic Missiles, 2nd level for 2 charges (7 left)".
function fromItem({ item, level, slotLevel }) {
  if (!item) return "";
  if (!item.charges) return " — " + item.name;
  const spent = slotLevel - level + 1;
  return " — " + item.name + ", " + ORDINALS[slotLevel] + " level for " + spent + (spent === 1 ? " charge" : " charges") + " (" + item.charges.left + " left)";
}

/**
 * A spell scroll read, or a wand used, outside a fight (#346): a button on
 * its "You carry" entry, disabled with the engine's reason when it would
 * refuse.
 */
function itemRead(option, index) {
  const { spell, target } = option;
  const verb = spell.item.kind === "scroll" ? "read" : "use-wand";
  const typed = spell.damageType ? " (" + spell.damageType + ")" : "";
  const button = make("button");
  button.append(make("span", ACTIONS[verb].short + typed));
  button.dataset.busyLabel = ACTIONS[verb].busyLabel;
  button.type = "button";
  button.className = "carried secondary act";
  button.dataset.action = verb;
  button.dataset.target = spell.item.id;
  button.setAttribute("aria-label", ACTIONS[verb].label + spell.item.name + typed);
  button.disabled = acting || !option.available;
  button.addEventListener("click", () => castSpell(spell, [target.id], "button.act[data-action=" + verb + "][data-target=" + JSON.stringify(spell.item.id) + "]"));
  const wrap = make("span", undefined, "action");
  wrap.dataset.target = spell.item.id;
  wrap.append(button);
  if (!option.available) {
    const reason = make("span", option.reason, "reason");
    reason.id = "read-reason-" + index;
    button.setAttribute("aria-describedby", reason.id);
    wrap.append(reason);
  }
  return wrap;
}

/**
 * Casting (#337): a choice of spell, each at each slot level it may spend
 * (a cantrip spends none), "on" and a choice of its target, then Cast,
 * disabled with the engine's reason for that choice. An area spell (#338)
 * offers a box for each foe it may catch, the first ones ticked, up to its
 * most. Exploring, only spells cast outside a fight are offered; answering
 * a hit, only reaction spells. In a fight a scroll's or wand's casts (#346)
 * are a choice of their own in the Items row (#392), kind "item", whose
 * button is Use.
 */
function castPanel(casts, kind = "spell") {
  const state = casting[kind];
  const prefix = kind === "spell" ? "cast" : "item-cast";
  const verb = kind === "spell" ? "cast" : "cast-item";
  const spells = [...new Map(casts.map((option) => [castKey(option), option.spell])).entries()];
  // Keep the player's choice while it is offered; else the first that can
  // be cast now, or the first.
  const usable = casts.find(({ available }) => available) || casts[0];
  // A choice that can't be cast now gives way to one that can (#392): once
  // the action is spent, a bonus-action spell such as Healing Word.
  const castable = (key) => casts.some((option) => castKey(option) === key && option.available);
  if (!spells.some(([key]) => key === state.choice) || (!castable(state.choice) && usable.available)) state.choice = castKey(usable);
  const options = casts.filter((option) => castKey(option) === state.choice);
  const wrap = make("span", undefined, "action cast-choice");
  // An area spell has one entry, with the foes to choose among.
  const area = options[0].targets ? options[0] : null;
  if (area) {
    const most = area.spell.maxTargets;
    const ids = area.targets.map(({ id }) => id);
    // A newly chosen area spell starts with the first foes ticked.
    if (state.targetsOf !== state.choice) {
      state.targets = ids.slice(0, most);
      state.targetsOf = state.choice;
    }
    state.targets = state.targets.filter((id) => ids.includes(id)).slice(0, most);
  } else if (!options.some(({ target }) => target.id === state.target)) state.target = (options.find(({ available }) => available) || options[0]).target.id;
  const chosen = area || options.find(({ target }) => target.id === state.target);
  const spellSelect = make("select");
  spellSelect.id = prefix + "-spell";
  spellSelect.setAttribute("aria-label", kind === "spell" ? "Spell" : "Scroll or wand");
  spellSelect.disabled = acting;
  for (const [key, spell] of spells) {
    // Resistance's resisted type (#339); Chromatic Orb's dealt type (#340).
    const typed = !spell.damageType ? "" : spell.damageTypeUse === "dealt" ? " of " + spell.damageType : " against " + spell.damageType;
    // Bestow Curse's curse (#342).
    const cursed = spell.curseName ? ": " + spell.curseName : "";
    // One that can't be cast now says why, and can't be chosen unless
    // none can (#392).
    const why = castable(key) ? "" : casts.find((option) => castKey(option) === key).reason;
    const choice = make("option", spell.name + typed + cursed + (spell.item ? fromItem(spell) : spell.level === 0 ? "" : " (" + ORDINALS[spell.slotLevel] + "-level slot)") + (why ? " — " + why : ""));
    choice.value = key;
    choice.disabled = Boolean(why) && usable.available;
    choice.selected = key === state.choice;
    spellSelect.append(choice);
  }
  spellSelect.addEventListener("change", () => {
    state.choice = spellSelect.value;
    renderActions();
    element(prefix + "-spell").focus();
  });
  const button = make("button");
  button.append(make("span", ACTIONS[verb].label));
  button.dataset.busyLabel = ACTIONS[verb].busyLabel;
  button.type = "button";
  button.className = "secondary act";
  button.dataset.action = verb;
  // An area spell needs at least one target ticked.
  const why = !chosen.available ? chosen.reason : area && !state.targets.length ? "Choose a target" : "";
  button.disabled = acting || Boolean(why);
  button.addEventListener("click", () => castSpell(chosen.spell, area ? state.targets : [chosen.target.id], "button.act[data-action=" + verb + "]", verb));
  // An area spell's boxes say how many they take; one target is "on" it.
  // Outside a fight the bar is as it was (#392): no joining word.
  wrap.append(spellSelect, ...(area ? [areaTargets(area, state, prefix)] : [...(fightingNow() ? [joiner("on")] : []), targetChoice(options, state, prefix)]), button);
  if (why) {
    const reason = make("span", why, "reason");
    reason.id = prefix + "-reason";
    button.setAttribute("aria-describedby", reason.id);
    wrap.append(reason);
  }
  return wrap;
}

/**
 * A healing spell on the character's card (#525): Cast, its name and slot,
 * what it restores and the action it takes, disabled with the engine's
 * reason when it would refuse.
 */
function healSpellButton(option, heal) {
  const { spell } = option;
  const button = make("button");
  const face = make("span", spell.name + (spell.slotLevel ? " (" + ORDINALS[spell.slotLevel] + "-level slot)" : ""));
  face.append(" ", make("small", heal.amount + " · " + heal.cost, "act-detail"));
  button.append(face);
  button.dataset.busyLabel = ACTIONS["heal-spell"].busyLabel;
  button.type = "button";
  button.className = "heal secondary act";
  button.dataset.action = "heal-spell";
  button.dataset.target = spell.id;
  button.disabled = acting || !option.available;
  const control = "button.act[data-action=heal-spell][data-target=" + JSON.stringify(spell.id) + "]";
  button.addEventListener("click", async () => {
    await act("/api/5e/session/cast", { spellId: spell.id, slotLevel: spell.slotLevel || null, targetIds: [option.target.id] }, control, ACTIONS["heal-spell"].busy + spell.name + "…");
    keepFocus("heal-spell", spell.id);
  });
  const wrap = make("span", undefined, "action");
  wrap.dataset.heal = "heal-spell";
  wrap.append(button);
  if (!option.available) {
    const reason = make("span", option.reason, "reason");
    reason.id = "heal-reason-" + spell.id;
    button.setAttribute("aria-describedby", reason.id);
    wrap.append(reason);
  }
  return wrap;
}

// A word joining a button or choice to the choice it names (#392), as in
// "Divine Spark on Zombie: radiant damage". The choice has its own
// accessible name, so the word is not spoken.
const joiner = (word) => unspoken(make("span", word, "joiner"));

// Divine Spark's choice (#341): kept while it is offered.
let sparkChoice = "";

/**
 * Divine Spark (#341): its button, "on", and one choice of each target and
 * what it does to it ("Zombie: radiant damage"); disabled with the engine's
 * reason when it would refuse. Channel Divinity's uses show on its row
 * (#392).
 */
function sparkPanel(sparks) {
  const key = ({ target, mode }) => target.id + ":" + mode;
  if (!sparks.some((option) => key(option) === sparkChoice)) sparkChoice = key(sparks.find(({ available }) => available) || sparks[0]);
  const chosen = sparks.find((option) => key(option) === sparkChoice);
  // Divine Spark's line in the Channel Divinity row (#392).
  const wrap = make("span", undefined, "action cast-choice row-line");
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
  button.append(make("span", ACTIONS["divine-spark"].label));
  button.dataset.busyLabel = ACTIONS["divine-spark"].busyLabel;
  button.type = "button";
  button.className = "secondary act";
  button.dataset.action = "divine-spark";
  button.disabled = acting || !chosen.available;
  button.addEventListener("click", async () => {
    await act("/api/5e/session/divine-spark", { targetId: chosen.target.id, mode: chosen.mode }, "button.act[data-action=divine-spark]", ACTIONS["divine-spark"].busy + "…");
    keepFocus("divine-spark", "");
  });
  wrap.append(button, joiner("on"), select);
  if (!chosen.available) {
    const reason = make("span", chosen.reason, "reason");
    reason.id = "spark-reason";
    button.setAttribute("aria-describedby", reason.id);
    wrap.append(reason);
  }
  return wrap;
}

// A spell's one target: a foe, or "Yourself" for a healing spell or buff.
function targetChoice(options, state, prefix) {
  const select = make("select");
  select.id = prefix + "-target";
  select.setAttribute("aria-label", "Target");
  select.disabled = acting;
  for (const { target } of options) {
    const choice = make("option", target.id === (session.encounter?.playerId ?? "pc") ? "Yourself" : target.name);
    choice.value = target.id;
    choice.selected = target.id === state.target;
    select.append(choice);
  }
  select.addEventListener("change", () => {
    state.target = select.value;
    renderActions();
    element(prefix + "-target").focus();
  });
  return select;
}

// An area spell's targets (#338): a box per foe, at most its most ticked;
// the rest are disabled once that many are.
function areaTargets(area, state, prefix) {
  const most = area.spell.maxTargets;
  const group = make("span", undefined, "cast-targets");
  group.id = prefix + "-targets";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Targets, up to " + most);
  group.append(make("span", "Up to " + most + ":", "approach"));
  for (const { id, name } of area.targets) {
    const label = make("label");
    const box = make("input");
    box.type = "checkbox";
    box.value = id;
    box.checked = state.targets.includes(id);
    box.disabled = acting || (!box.checked && state.targets.length >= most);
    box.addEventListener("change", () => {
      state.targets = box.checked ? [...state.targets, id] : state.targets.filter((other) => other !== id);
      renderActions();
      const again = document.querySelector("#" + prefix + "-targets input[value=" + JSON.stringify(id) + "]");
      if (again) again.focus();
    });
    label.append(box, " " + name);
    group.append(label);
  }
  return group;
}

// A cast from the Items row (#392) is named by its scroll or wand. One at a
// foe's card (#526) keeps focus on that card's button.
async function castSpell(spell, targetIds, control = "button.act[data-action=cast]", verb = "cast", focusTarget = "") {
  // A scroll or wand (#346) names its item.
  await act("/api/5e/session/cast", { spellId: spell.id, slotLevel: spell.slotLevel || null, targetIds, ...(spell.damageType ? { damageType: spell.damageType } : {}), ...(spell.curse ? { curse: spell.curse } : {}), ...(spell.item ? { itemId: spell.item.id } : {}) }, control, ACTIONS[verb].busy + " " + (verb === "cast-item" ? spell.item.name : spell.name) + "…");
  keepFocus(verb, focusTarget);
}

// The attack chooser (#526): pick what on your side, then who on theirs.
// The player's pick, a chip's key, is kept across turns while the page is
// open (never saved); so are each chip's slot level and its damage type,
// curse or Divine Spark's damage, by its key; and an area spell's ticked
// foes, in the order ticked, with the chip they were ticked for.
const chooser = { pick: "", slots: {}, variants: {}, targets: [], targetsOf: "" };
// Its groups, in order: the weapon attacks, the attacks an ongoing spell
// gives (Spiritual Weapon's, Vampiric Touch's again), cantrips, each spell
// level with its slots left, the scrolls and wands, and Divine Spark.
const CHOOSER_GROUPS = [["weapon", "Weapon"], ["ongoing", "Ongoing"], ["cantrips", "Cantrips"], ["level-1", "1st"], ["level-2", "2nd"], ["level-3", "3rd"], ["level-4", "4th"], ["level-5", "5th"], ["items", "Items"], ["channel", "Channel Divinity"]];
const WEAPON_CHOICES = ["attack", "light-attack"];
/** Whether a cast is at a foe: an area spell's, or one with a foe as its target. */
const atFoe = (option) => Boolean(option.targets) || (option.target !== undefined && option.target.id !== session.encounter?.playerId);
/** A cast's chip: its spell, and the scroll or wand it is cast from. */
const castChoice = ({ spell }) => "cast:" + spell.id + (spell.item ? ":" + spell.item.id : "");
/** What a chip varies by besides its slot: Chromatic Orb's damage type, Bestow Curse's curse, Divine Spark's damage. */
const variantOf = (option) => (option.action === "divine-spark" ? option.mode : option.spell ? option.spell.damageType || option.spell.curse || "" : "");
const slotOf = (option) => (option.spell && option.spell.slotLevel ? String(option.spell.slotLevel) : "");
const usable = (options) => options.some(({ available }) => available);
/** The value of values kept: the remembered one while it is usable, else the first usable, else the remembered one, else the first. */
const kept = (values, remembered, works) => (values.includes(remembered) && works(remembered) ? remembered : values.find(works) ?? (values.includes(remembered) ? remembered : values[0]));

/**
 * Every way to attack a foe the engine offers this turn (#526), each a
 * chip with its options, in the chooser's groups' order: the weapon's
 * attack and the off-hand light attack, the attacks an ongoing spell
 * gives, each spell cast at a foe by its level (a scroll's or wand's among
 * the items), and Divine Spark. Cunning Strike's attacks are its choice's.
 */
function attackChoices() {
  const choices = new Map();
  for (const option of session.actions) {
    const { action, spell } = option;
    if (option.cunningStrike) continue;
    let key = action;
    let group;
    if (WEAPON_CHOICES.includes(action)) group = "weapon";
    else if (action === "spectral-attack" || action === "drain-attack") group = "ongoing";
    else if (action === "divine-spark") group = "channel";
    else if (action === "cast" && atFoe(option)) {
      key = castChoice(option);
      group = spell.item ? "items" : spell.level === 0 ? "cantrips" : "level-" + spell.level;
    } else continue;
    if (!choices.has(key)) choices.set(key, { key, group, options: [] });
    choices.get(key).options.push(option);
  }
  const order = CHOOSER_GROUPS.map(([key]) => key);
  return [...choices.values()].sort((one, other) => order.indexOf(one.group) - order.indexOf(other.group));
}

/** A chip's name: the weapon, the scroll or wand, or the spell or feature. */
function choiceName({ options: [option] }) {
  const { gear } = session.room;
  if (option.action === "attack") return gear.attack.weapon;
  if (option.action === "light-attack") return gear.lightAttack ? gear.lightAttack.weapon : FOE_WORDS["light-attack"];
  if (option.action === "cast") return option.spell.item ? option.spell.item.name : option.spell.name;
  return FOE_WORDS[option.action] ?? ACTIONS[option.action].label;
}

/**
 * What an option does (#526): a weapon's to-hit and damage as the sheet
 * gives them (#504), or the fight view's for a spell, Divine Spark or an
 * ongoing spell's attack; "+7" or "DC 15", "2d10", and the sheet's words.
 */
function shownStats(option) {
  const { gear } = session.room;
  const profile = option.action === "attack" ? gear.attack : option.action === "light-attack" ? gear.lightAttack : undefined;
  if (profile) return { hit: signed(profile.bonus), damage: damageText(profile.damage), text: attackText(profile) };
  const { spell } = option;
  const dealt = spell && spell.damageTypeUse === "dealt" ? spell.damageType : "";
  const stats = (session.attackStats || []).find((entry) =>
    entry.action === option.action &&
    (!spell || (entry.spellId === spell.id && (entry.slotLevel || 0) === (spell.slotLevel || 0) && (entry.itemId || "") === (spell.item ? spell.item.id : "") && (entry.damageType || "") === dealt)) &&
    (option.action !== "divine-spark" || entry.mode === option.mode));
  return stats || { text: spell ? spellInfo(spell.id).summary : "" };
}

/** The chip chosen now, with its slot and variant, and its options at them. */
function chosenAttack(choices) {
  const picked = choices.find(({ key }) => key === chooser.pick);
  const choice = picked && usable(picked.options) ? picked : choices.find(({ options }) => usable(options)) || picked || choices[0];
  const at = (slot) => choice.options.filter((option) => slotOf(option) === slot);
  const slots = [...new Set(choice.options.map(slotOf))];
  const slot = kept(slots, chooser.slots[choice.key], (value) => usable(at(value)));
  const variants = [...new Set(at(slot).map(variantOf))];
  const variant = kept(variants, chooser.variants[choice.key], (value) => usable(at(slot).filter((option) => variantOf(option) === value)));
  return { choice, slots, slot, variants, variant, options: at(slot).filter((option) => variantOf(option) === variant) };
}

/** The spell slots or Channel Divinity uses a group's pips show, if any. */
function groupUses(group) {
  if (group === "channel") return session.channelDivinity;
  return group.startsWith("level-") && session.spellSlots ? session.spellSlots[Number(group.slice(6)) - 1] : undefined;
}

/** A chip (#526): a radio styled as one, greyed with the engine's reason while it would be refused. */
function chooserChip(choice, chosen) {
  const label = make("label", undefined, "chip");
  label.dataset.choice = choice.key;
  const input = make("input");
  input.type = "radio";
  input.name = "attack-choice";
  input.value = choice.key;
  input.checked = choice === chosen.choice;
  const works = usable(choice.options);
  input.disabled = acting || (!works && !input.checked);
  input.setAttribute("aria-describedby", "chooser-group-" + choice.group);
  input.addEventListener("change", () => {
    chooser.pick = choice.key;
    renderActions();
    document.querySelector("#chooser-chips input[value=" + JSON.stringify(choice.key) + "]")?.focus();
  });
  label.append(input, make("span", choiceName(choice), "chip-name"));
  // An area spell says so; the off-hand weapon's is the extra attack.
  const [first] = choice.options;
  const tag = first.action === "light-attack" ? "extra" : first.targets && shownStats(first).area ? "area" : "";
  if (tag) label.append(make("span", tag, "chip-tag"));
  if (!works) {
    label.classList.add("off");
    label.append(make("small", first.reason, "chip-reason"));
  }
  if (input.checked) label.classList.add("on");
  return label;
}

/**
 * The chosen chip's line (#526): its name, a levelled spell's slot level
 * (a wand's charges), a damage type, curse or Divine Spark's damage to
 * choose, then what it does in the sheet's words and whom it needs.
 */
function chooserDetail(chosen) {
  const { choice, slots, slot, variants, variant, options } = chosen;
  const [option] = options;
  const { spell } = option;
  const nodes = [make("strong", choiceName(choice))];
  // A levelled spell names its slot even when it has only the one.
  if (slots.length > 1 || (spell && spell.slotLevel)) {
    const select = make("select");
    select.id = "chooser-slot";
    select.setAttribute("aria-label", spell.item ? "Charges" : "Slot level");
    select.disabled = acting;
    for (const value of slots) {
      const at = choice.options.filter((each) => slotOf(each) === value);
      const level = Number(value);
      const spent = spell.item ? level - spell.level + 1 : 0;
      const why = usable(at) ? "" : at[0].reason;
      const entry = make("option", ORDINALS[level] + (spell.item ? " level, " + spent + (spent === 1 ? " charge" : " charges") : "-level slot") + (why ? " — " + why : ""));
      entry.value = value;
      entry.selected = value === slot;
      entry.disabled = Boolean(why) && usable(choice.options);
      select.append(entry);
    }
    select.addEventListener("change", () => {
      chooser.slots[choice.key] = select.value;
      renderActions();
      element("chooser-slot")?.focus();
    });
    nodes.push(select);
  }
  if (variants.length > 1) {
    const select = make("select");
    select.id = "chooser-variant";
    select.setAttribute("aria-label", option.action === "divine-spark" ? "Damage" : spell.curse ? "Curse" : "Damage type");
    select.disabled = acting;
    for (const value of variants) {
      const each = choice.options.find((other) => slotOf(other) === slot && variantOf(other) === value);
      const entry = make("option", each.spell && each.spell.curseName ? each.spell.curseName : option.action === "divine-spark" ? value + " damage" : value);
      entry.value = value;
      entry.selected = value === variant;
      select.append(entry);
    }
    select.addEventListener("change", () => {
      chooser.variants[choice.key] = select.value;
      renderActions();
      element("chooser-variant")?.focus();
    });
    nodes.push(select);
  }
  const stats = shownStats(option);
  const most = option.targets ? option.spell.maxTargets : 1;
  const whom = option.targets ? (stats.area ? "Catches up to " + most + ": tick who's in the blast." : "Up to " + most + " targets: tick them.") : "Choose an enemy.";
  // A scroll's or wand's line names its spell.
  const what = (spell && spell.item ? spell.name + ": " : "") + stats.text;
  nodes.push(make("span", " · " + (what ? what + ". " : "") + whom, "chooser-text"));
  return nodes;
}

/**
 * The attack chooser (#526) under the character's card, and the chosen
 * attack on each foe's card: one button with its to-hit and damage, or, for
 * an area spell or Scorching Ray's rays, a tick box with one Cast button
 * under the foes. With one way to attack, the chooser hides and each
 * foe's button names it. struck says whether an attack takes the
 * Cunning Strike chosen among effects.
 */
function renderChooser(choices, struck, effects) {
  const box = element("attack-chooser");
  const area = element("area-cast");
  box.hidden = choices.length < 2;
  area.replaceChildren();
  const foeControls = [...element("foe-cards").querySelectorAll(".foe-controls")];
  for (const controls of foeControls) controls.replaceChildren();
  if (!choices.length) {
    element("chooser-chips").replaceChildren();
    element("chooser-detail").replaceChildren();
    return;
  }
  const chosen = chosenAttack(choices);
  // A hidden chooser holds no chips.
  element("chooser-chips").replaceChildren(...(box.hidden ? [] : CHOOSER_GROUPS).filter(([key]) => choices.some(({ group }) => group === key)).map(([key, name]) => {
    const row = make("div", undefined, "chooser-group");
    row.dataset.group = key;
    const label = make("span", undefined, "chooser-label");
    label.id = "chooser-group-" + key;
    label.append(name);
    const uses = groupUses(key);
    if (uses) label.append(unspoken(make("span", "●".repeat(uses.uses) + "○".repeat(Math.max(0, uses.max - uses.uses)), "chooser-pips")), spoken(", " + uses.uses + " of " + uses.max + " left"));
    const chips = make("span", undefined, "chips");
    chips.append(...choices.filter(({ group }) => group === key).map((choice) => chooserChip(choice, chosen)));
    row.append(label, chips);
    return row;
  }));
  element("chooser-detail").replaceChildren(...(box.hidden ? [] : chooserDetail(chosen)));
  const [first] = chosen.options;
  if (first.targets) {
    areaControls(chosen, first, foeControls);
    return;
  }
  for (const controls of foeControls) {
    const option = chosen.options.find(({ target }) => target.id === controls.parentElement.dataset.combatant);
    if (option) controls.append(foeAttack(option, struck, effects));
  }
}

/**
 * The chosen attack on one foe's card (#526): its name ("Attack with
 * Mace", "Fire Bolt"), then its to-hit and damage; disabled with the
 * engine's reason for this foe, or Cunning Strike's.
 */
function foeAttack(option, struck, effects) {
  const { action, target, spell } = option;
  const verb = action === "cast" && spell.item ? "cast-item" : action;
  const stats = shownStats(option);
  // Extra Attack's second attack (#287) says so.
  const second = action === "attack" && session.turn && session.turn.attacks > 0;
  const name = action === "cast" ? spell.name : WEAPON_CHOICES.includes(action) ? (second ? "Second attack" : FOE_WORDS[action]) + withWeapon(action) : choiceName({ options: [option] });
  const slot = spell && spell.slotLevel && !spell.item ? " with a " + ORDINALS[spell.slotLevel] + "-level slot" : "";
  const typed = spell && spell.damageType ? " (" + spell.damageType + ")" : spell && spell.curseName ? " (" + spell.curseName + ")" : "";
  const full = action === "cast" ? (spell.item ? "Use " + spell.item.name + " on " + target.name + typed : "Cast " + spell.name + " at " + target.name + slot + typed) : action === "divine-spark" ? ACTIONS[action].label + " on " + target.name + ": " + option.mode + " damage" : (second ? "Second attack on " : ACTIONS[action].label) + target.name + withWeapon(action);
  const button = make("button");
  const face = make("span", name);
  const detail = [stats.hit, stats.damage].filter(Boolean).join(" · ");
  const id = "foe-attack-" + target.id;
  if (detail) {
    const small = make("small", detail, "act-detail");
    small.id = id + "-detail";
    face.append(" ", small);
  }
  button.append(face);
  button.type = "button";
  // An attack is .attack, as the fight's attacks have been; a spell or
  // Divine Spark is .cast.
  button.className = (FOE_WORDS[action] !== undefined ? "attack" : "cast") + " primary act";
  button.dataset.action = verb;
  button.dataset.target = target.id;
  if (spell) {
    button.dataset.spell = spell.id;
    if (spell.slotLevel) button.dataset.slot = String(spell.slotLevel);
    if (spell.item) button.dataset.item = spell.item.id;
  }
  button.dataset.busyLabel = ACTIONS[verb].busyLabel;
  button.setAttribute("aria-label", full);
  // An attack the chosen Cunning Strike can't go with (#308).
  const strike = WEAPON_CHOICES.includes(action) && cunningStrike ? effects.find(({ id: effect }) => effect === cunningStrike) : undefined;
  const unstruck = Boolean(strike) && option.available && !struck(action, target);
  button.disabled = acting || !option.available || unstruck;
  const control = "#foe-cards li[data-combatant=" + JSON.stringify(target.id) + "] button.act";
  button.addEventListener("click", async () => {
    if (action === "cast") await castSpell(spell, [target.id], control, verb, target.id);
    else if (action === "divine-spark") {
      await act("/api/5e/session/divine-spark", { targetId: target.id, mode: option.mode }, control, ACTIONS[action].busy + " on " + target.name + "…");
      keepFocus(action, target.id);
    } else perform(strike ? { ...option, cunningStrike } : option);
  });
  const wrap = make("span", undefined, "action");
  wrap.append(button);
  const why = !option.available ? option.reason : unstruck ? "Not with " + strike.name : "";
  if (why) {
    const reason = make("span", why, "reason");
    reason.id = id + "-reason";
    button.setAttribute("aria-describedby", reason.id);
    wrap.append(reason);
  } else if (detail) button.setAttribute("aria-describedby", id + "-detail");
  return wrap;
}

/**
 * An area spell or Scorching Ray's rays chosen (#526, #338): a tick box on
 * each foe's card it may catch, the first ones ticked, up to its most (the
 * rest disabled once that many are), and one Cast button under the foes
 * naming how many, disabled with the engine's reason or until one is
 * ticked. The rays are split among the ticked foes as the engine splits
 * them, the first ticked taking any more.
 */
function areaControls(chosen, option, foeControls) {
  const { spell } = option;
  const most = spell.maxTargets;
  const ids = option.targets.map(({ id }) => id);
  const area = shownStats(option).area;
  // A newly chosen spell starts with the first foes ticked.
  if (chooser.targetsOf !== chosen.choice.key) {
    chooser.targets = ids.slice(0, most);
    chooser.targetsOf = chosen.choice.key;
  }
  chooser.targets = chooser.targets.filter((id) => ids.includes(id)).slice(0, most);
  for (const controls of foeControls) {
    const id = controls.parentElement.dataset.combatant;
    if (!ids.includes(id)) continue;
    const label = make("label", undefined, "blast-tick");
    const box = make("input");
    box.type = "checkbox";
    box.id = "blast-" + id;
    box.value = id;
    box.checked = chooser.targets.includes(id);
    box.disabled = acting || (!box.checked && chooser.targets.length >= most);
    box.addEventListener("change", () => {
      chooser.targets = box.checked ? [...chooser.targets, id] : chooser.targets.filter((other) => other !== id);
      renderActions();
      element("blast-" + id)?.focus();
    });
    // Each box is named by its foe for screen readers.
    box.setAttribute("aria-label", option.targets.find((target) => target.id === id).name + (area ? " in the blast" : " targeted"));
    label.append(box, area ? "In the blast" : "Targeted");
    controls.append(label);
  }
  const verb = spell.item ? "cast-item" : "cast";
  const button = make("button");
  const count = chooser.targets.length;
  button.append(make("span", "Cast " + spell.name + " on " + count));
  button.type = "button";
  button.className = "cast primary act";
  button.dataset.action = verb;
  button.dataset.spell = spell.id;
  if (spell.slotLevel) button.dataset.slot = String(spell.slotLevel);
  if (spell.item) button.dataset.item = spell.item.id;
  button.dataset.busyLabel = ACTIONS[verb].busyLabel;
  if (spell.item) button.setAttribute("aria-label", "Use " + spell.item.name + " on " + count);
  const why = !option.available ? option.reason : count === 0 ? "Choose a target" : "";
  button.disabled = acting || Boolean(why);
  button.addEventListener("click", () => castSpell(spell, chooser.targets, "#area-cast button.act", verb));
  const wrap = make("span", undefined, "action");
  wrap.append(button);
  if (why) {
    const reason = make("span", why, "reason");
    reason.id = "area-cast-reason";
    button.setAttribute("aria-describedby", reason.id);
    wrap.append(reason);
  }
  element("area-cast").append(wrap);
}

/**
 * Cunning Strike's choice (#308), named by its visible label: none, or one
 * of the effects the engine offers with an attack now. It applies to the
 * next attack clicked, so it comes before the attacks in their row (#392).
 */
function strikeChoice(effects) {
  const wrap = make("label", "Cunning Strike ", "action strike-choice");
  const select = make("select");
  select.id = "cunning-strike";
  select.disabled = acting;
  for (const [value, text] of [["", "None"], ...effects.map(({ id, name }) => [id, name + " (−1d6)"])]) {
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
  wrap.append(select);
  return wrap;
}

async function perform({ action, target, item, feature, approach, retry, cunningStrike: effect }) {
  const targetId = target ? target.id : "";
  // The clicked control, found again after the bar re-renders, shows busy.
  const control = "button.act[data-action=" + JSON.stringify(action) + "]" + (targetId ? "[data-target=" + JSON.stringify(targetId) + "]" : ":not([data-target])") + (item ? "[data-item=" + JSON.stringify(item.id) + "]" : "") + (feature ? "[data-feature=" + JSON.stringify(feature.id) + "]" : "") + (approach ? "[data-approach=" + JSON.stringify(approach.id) + "]" : "") + (retry ? "[data-retry]" : ":not([data-retry])");
  const busy = busyName({ action, target, item, feature });
  // The chosen Cunning Strike (#308) goes with this attack only.
  if (action === "attack" || action === "light-attack") {
    cunningStrike = "";
    await act("/api/5e/session/" + action, { actorId: session.encounter.playerId, targetId, ...(effect ? { cunningStrike: effect } : {}) }, control, busy);
  } else if (action === "spectral-attack" || action === "drain-attack") await act("/api/5e/session/" + action, { targetId }, control, busy);
  else if (FIGHT_FEATURES.includes(action) || action === "tactical-mind") await act("/api/5e/session/action", { action }, control, busy);
  // An item's use (#400) sends its feature and item as one target.
  // A fight action (#402) sends its feature and opponent as one target.
  else await act("/api/5e/session/explore", { action, target: feature ? feature.id + ":" + targetId : item ? targetId + ":" + item.id : targetId, ...(approach ? { approach: approach.id } : {}), ...(retry ? { retry: true } : {}) }, control, busy);
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
  else focusTurnEntry();
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
  const pending = library.pendingCreation;
  choicesFor = pending.number;
  return {
    class: id,
    // A point buy's scores, or the rolls or standard array placed (#509).
    ...(pending.pointBuy ? { scores: { ...pending.defaultScores[id] } } : { placement: { ...pending.defaultPlacements[id] } }),
    ...structuredClone(classEntry(id).defaults),
  };
}

/** The pending creation the choices are for (#509): a new one starts afresh. */
let choicesFor;

/**
 * What the creation screen says of its ability-score method (#509), from the
 * numbers the server sends.
 */
function renderMethod() {
  const pending = library.pendingCreation;
  const after = " then make your other choices.";
  const values = (pending.rolls || []).map((roll) => roll.total);
  element("method-hint").textContent = pending.method === "point-buy"
    ? "Point buy: spend up to " + pending.pointBuy.points + " points on scores from " + pending.pointBuy.min + " to " + pending.pointBuy.max + ". Choose a class, buy your ability scores," + after
    : pending.method === "standard-array"
      ? "The standard array: " + values.slice(0, -1).join(", ") + " and " + values[values.length - 1] + ". Choose a class, place the six scores on your abilities in any order," + after
      : (pending.method === "roll-reroll" ? "Rolled once, with one reroll of the whole set. " : "Rolled once. No rerolls. ") + "Choose a class, place the six rolls on your abilities in any order," + after;
  element("placing-hint").textContent = pending.method === "point-buy"
    ? "Choose each ability's score; each costs the points shown."
    : "Place one " + (pending.method === "standard-array" ? "score" : "roll") + " on each ability; choosing " + (pending.method === "standard-array" ? "a score" : "a roll") + " that is already placed swaps the two.";
  element("base-heading").textContent = pending.method === "point-buy" ? "Bought" : pending.method === "standard-array" ? "Array" : "Roll";
  element("points-status").hidden = pending.method !== "point-buy";
  renderReroll();
}

/** The one reroll (#509): offered until it is used. */
function renderReroll() {
  const reroll = library.pendingCreation.reroll;
  element("reroll-controls").hidden = !reroll;
  if (!reroll) return;
  element("reroll").hidden = reroll.used;
  element("reroll-status").textContent = reroll.used ? "Rerolled: you keep these dice." : "You may roll the whole set again once, and must keep the new set.";
}

/** Rolls the whole set again, once (#509); the new rolls go down the class's order. */
async function rerollDice() {
  const button = element("reroll");
  if (isBusy(button)) return;
  setBusy(button, "Rerolling…");
  try {
    library = await request("/api/5e/creation/reroll", { revision: library.revision });
    choices.placement = { ...library.pendingCreation.defaultPlacements[choices.class] };
    element("creation-error").textContent = "";
    clearBusy(button);
    renderReroll();
    element("reroll-status").focus();
    changeAbilities();
  } catch (error) {
    clearBusy(button);
    element("creation-error").textContent = error.message;
  }
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
  // The standard array's scores have no dice (#509).
  const rolled = library.pendingCreation.method !== "standard-array";
  select.setAttribute("aria-label", titleCase(ability) + (rolled ? " roll" : " score"));
  if (rolled) select.setAttribute("aria-describedby", "dice-" + ability);
  library.pendingCreation.rolls.forEach((roll, index) => {
    const holder = library.abilities.find((candidate) => choices.placement[candidate] === index);
    const option = make("option", roll.total + (rolled ? " (roll " + (index + 1) + ")" : "") + (holder === ability ? "" : ", swaps with " + titleCase(holder)));
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

/** A point buy's score for an ability (#509), each option with its cost. */
function scoreSelect(ability) {
  const select = make("select");
  select.id = "place-" + ability;
  select.setAttribute("aria-label", titleCase(ability) + " score");
  for (const { score, cost } of library.pendingCreation.pointBuy.costs) {
    const option = make("option", score + " (" + cost + (cost === 1 ? " point" : " points") + ")");
    option.value = String(score);
    select.append(option);
  }
  select.value = String(choices.scores[ability]);
  select.addEventListener("change", () => {
    choices.scores[ability] = Number(select.value);
    changeAbilities(select.id);
  });
  return select;
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
    const name = make("th", titleCase(ability));
    name.scope = "row";
    const roll = make("td");
    // A point buy's score, or the roll or array score placed (#509).
    const pending = library.pendingCreation;
    if (pending.pointBuy) roll.append(scoreSelect(ability));
    else roll.append(rollSelect(ability), ...(pending.method === "standard-array" ? [] : [placedDice(ability)]));
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
  // The points a point buy spends (#509).
  const points = projection && projection.pointBuy;
  element("points-status").textContent = points ? "Points spent: " + points.spent + " of " + points.points + "." : "Points spent: …";
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
    text.append(make("small", titleCase(skill.ability) + ". " + skill.summary + "."));
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
    const text = make("span", skill.name);
    text.append(make("small", skill.summary + "."));
    label.append(box, text);
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
    element("scores-error").textContent = result.unfinished.scores || "";
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

// The Settings page (#506): what the server sends, drawn as it says.
async function openSettings(ticket) {
  let value;
  try {
    value = await request("/api/5e/settings");
  } catch (error) {
    if (ticket === routeTicket) lost(error.message);
    return;
  }
  if (ticket !== routeTicket) return;
  renderSettings(value);
  // The view Settings was opened from, if this entry remembers one.
  const from = history.state && history.state.settingsFrom;
  const trail = from ? from.trail.map((item, index) => index === from.trail.length - 1 ? { label: item.label, hash: from.hash } : item) : [];
  element("settings-back").textContent = "Back to " + (trail.length ? trail[trail.length - 1].label : "your characters");
  show("settings", "Settings", [...trail, { label: "Settings" }]);
  element("settings-title").focus();
}

// The entry before a remembered Settings is the view it came from.
function leaveSettings() {
  if (history.state && history.state.settingsFrom) history.back();
  else go("");
}

function goToSettings() {
  if (element("settings").hidden) go("#settings", false, { settingsFrom: { hash: location.hash, trail: shownTrail } });
}

function renderSettings(value) {
  // The sheets show the settings of the moment.
  library = value.library;
  element("settings-error").textContent = "";
  element("settings-in-progress").hidden = !value.adventureInProgress;
  element("settings-list").replaceChildren(...value.settings.map((setting) => {
    const fieldset = make("fieldset", undefined, "setting");
    fieldset.id = "setting-" + setting.id;
    const help = make("p", setting.text, "hint");
    help.id = "setting-" + setting.id + "-text";
    fieldset.setAttribute("aria-describedby", help.id);
    const choices = make("div", undefined, "setting-choices");
    for (const choice of setting.choices) {
      const label = make("label");
      const input = make("input");
      input.type = "radio";
      input.name = "setting-" + setting.id;
      input.id = "setting-" + setting.id + "-" + choice.value;
      input.value = String(choice.value);
      input.checked = choice.value === setting.value;
      input.addEventListener("change", () => changeSetting(setting, choice));
      label.append(input, " " + choice.label);
      if (choice.default) label.append(" ", make("span", "Default", "tag"));
      choices.append(label);
    }
    fieldset.append(make("legend", setting.name), help, choices);
    return fieldset;
  }));
}

async function changeSetting(setting, choice) {
  const list = element("settings-list");
  if (list.getAttribute("aria-busy") === "true") return;
  list.setAttribute("aria-busy", "true");
  try {
    const value = await request("/api/5e/settings", { id: setting.id, value: choice.value });
    renderSettings(value);
    feedback(setting.name + ": " + choice.label + ". Saved.");
  } catch (error) {
    // Show what the file holds now, with the refusal.
    element("settings-error").textContent = error.message;
    try {
      renderSettings(await request("/api/5e/settings"));
      element("settings-error").textContent = error.message;
    } catch {
      // The refusal already says what is wrong.
    }
  } finally {
    list.removeAttribute("aria-busy");
  }
  element("setting-" + setting.id + "-" + choice.value)?.focus();
}

async function resetSettings() {
  const reset = element("reset-settings");
  if (isBusy(reset)) return;
  setBusy(reset, "Resetting…");
  try {
    renderSettings(await request("/api/5e/settings/reset", {}));
    feedback("Every setting is back to its default.");
  } catch (error) {
    element("settings-error").textContent = error.message;
  } finally {
    clearBusy(reset);
    reset.disabled = false;
  }
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
  // Choices made for another creation start afresh (#509).
  if (!choices || choicesFor !== library.pendingCreation.number) choices = defaultChoices();
  projection = undefined;
  element("score-cap").textContent = library.pendingCreation.rules.scoreCap;
  renderMethod();
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
element("open-settings").addEventListener("click", goToSettings);
element("settings-back").addEventListener("click", leaveSettings);
element("reset-settings").addEventListener("click", resetSettings);
element("creation-form").addEventListener("submit", saveCharacter);
element("reroll").addEventListener("click", rerollDice);
element("close-creation").addEventListener("click", () => go(""));
for (const mode of ["two", "three"]) element("increase-mode-" + mode).addEventListener("change", changeIncreaseMode);
element("character-name").addEventListener("input", () => { element("name-error").textContent = ""; });
element("delete-character").addEventListener("click", openDelete);
for (const mode of ["two", "split"]) element("asi-mode-" + mode).addEventListener("change", changeAsiMode);
element("confirm-level-choice").addEventListener("click", confirmLevelChoice);
element("delete-confirm-name").addEventListener("input", () => { element("confirm-delete").disabled = !nameMatches() || isBusy(element("confirm-delete")); });
element("delete-form").addEventListener("submit", deleteCharacter);
element("cancel-delete").addEventListener("click", () => element("delete-dialog").close());
// The browser queues a dialog's close event, so by the time it runs the
// player may have moved focus on; restore focus only if it was left on the
// page or in the closed dialog.
const focusLeftIn = (dialog) => { const active = document.activeElement; return !active || active === document.body || dialog.contains(active); };
element("delete-dialog").addEventListener("close", () => { if (restoreFocusOnClose && focusLeftIn(element("delete-dialog"))) element("delete-character").focus(); });
element("message-form").addEventListener("submit", sendMessage);
if (soundControls) {
  renderSoundControls();
  element("sound-mute").addEventListener("click", () => changeSoundSettings({ muted: !soundSettings.muted }));
  element("settings-sound-on").addEventListener("change", (event) => changeSoundSettings({ muted: !event.target.checked }));
  for (const id of ["sound-volume", "settings-sound-volume"]) element(id).addEventListener("input", (event) => changeSoundSettings({ volume: Number(event.target.value) / 100 }));
}
element("open-map").addEventListener("click", openMap);
element("close-map").addEventListener("click", () => closeMap(true));
element("map-dialog").addEventListener("close", () => { if (restoreMapFocus && mapReturn && mapReturn.isConnected && focusLeftIn(element("map-dialog"))) mapReturn.focus(); });
// M opens the map (#457), but not while typing, as in the message box.
document.addEventListener("keydown", (event) => {
  if ((event.key !== "m" && event.key !== "M") || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
  if (openMap()) event.preventDefault();
});
element("leave-shop").addEventListener("click", closeShop);
// Esc (#515) answers the shop's open question with No, or leaves the shop;
// never while a dialog, such as the map, takes it.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !shop || acting || element("adventure").hidden || document.querySelector("dialog[open]")) return;
  event.preventDefault();
  if (confirmingSale) cancelSale();
  else if (confirmingSellAll) cancelSellAll();
  else closeShop();
});
element("ending-next").addEventListener("click", () => go(findEntry(session.characterId) ? "#character-" + session.characterId : ""));
element("confirm-leave").addEventListener("click", leaveAdventure);
element("cancel-leave").addEventListener("click", cancelLeave);
element("room-history-link").addEventListener("click", showArrival);
element("flee-toggle").addEventListener("click", () => {
  showFleeMenu(!fleeOpen);
  if (fleeOpen) element("flee-ways").querySelector("button:enabled")?.focus();
});
// Escape closes Flee's menu and returns focus to Flee (#525); so does
// choosing anything else on the page.
element("flee-control").addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !fleeOpen) return;
  event.preventDefault();
  event.stopPropagation();
  showFleeMenu(false);
  element("flee-toggle").focus();
});
document.addEventListener("click", (event) => {
  if (fleeOpen && !element("flee-control").contains(event.target)) showFleeMenu(false);
});
element("room-fold").addEventListener("click", () => {
  roomUnfolded = !roomUnfolded;
  renderRoomFold(fightingNow());
});
element("confirm-abandon").addEventListener("click", abandonAdventure);
element("cancel-abandon").addEventListener("click", closeAbandon);
// The skip link moves focus without adding a history entry.
document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  element("content").focus();
});
// A resized log re-wraps its entries and may scroll before the observer
// below places the turn again: that scroll is not the reader's.
element("log").addEventListener("scroll", () => {
  if (logSize(element("log")) === restSize) followHistory = onLatestTurn();
});
// When the column around the log changes, as the window is resized, the log
// changes size: a following reader stays on the latest turn (#221, #529).
new ResizeObserver(followTurn).observe(element("log"));
window.addEventListener("popstate", () => { if (library) route(true); });
request("/api/5e/library").then((value) => {
  library = value;
  // A reload returns to the view the URL names.
  route(false);
}, (error) => feedback(error.message));
`;
