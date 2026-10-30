# Characters

## In scope

Ability modifiers, proficiency bonus, saving throws, skills, advantage and
disadvantage, action, bonus action and reaction, the 5e XP table and SRD 5.2
stat blocks. Feats beyond the level-4 Ability Score Improvement, multiclassing,
species and backgrounds' features other than the ability increase are not used.

## Where class rules live

A class is data. Each class's definition lives in `src/<class>-5e.ts`
(`fighter`, `rogue`, `cleric`, `wizard`), in the shape `src/class-5e.ts` gives,
beside what every class shares (abilities, skills, Fighting Styles, Weapon
Mastery, the Ability Score Improvement). `src/character-5e.ts` builds, validates
and derives every sheet from its class's definition and never asks which class
it is; no class list outside the class registry names a class. Creation offers
every class but a test-only one (`testOnly`): the Test Caster
(`src/test-caster-class-5e.ts`) exists for tests and is never offered or gated.
What each class does beyond its data is in [classes.md](classes.md).

## Creating a character

Every character is created at level 1 with 0 XP and full health, from its
pending creation. The library refuses any other new sheet. The server validates
every choice and projects every derived number; the page computes none.

- **Ability scores.** The Ability scores setting ([settings.md](settings.md))
  picks the method when a creation starts. The pending creation in the library
  records it, with its dice when it rolls, before the player sees anything, so
  reloading, restarting the server with any seed, leaving the creation screen or
  changing the setting keeps the method and dice. Saving a character spends the
  pending creation; the next one starts by the setting of the moment. A fresh
  creation places its scores, highest first, down its class's ability priority
  (`abilityPriority`), tied totals keeping roll order.
  - **4d6 drop lowest** (default): the engine rolls 4d6, dropping the lowest
    die, six times from a seeded stream of its own (SHA-256 of the browser's
    startup seed and the library's creation number). There are no rerolls and no
    minimum set. The player places the six results freely.
  - **Standard array:** 15, 14, 13, 12, 10 and 8, placed freely.
  - **Point buy:** 27 points on scores of 8–15 before the background increase,
    at the SRD 5.2 costs (8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9).
    Points may be left unspent; a score or a total out of range is refused. A
    fresh buy is the standard array.
  - **4d6 drop lowest, one reroll:** as 4d6 drop lowest, but the player may roll
    the whole set again once, from a stream of its own, and must keep the second
    set. Whether the reroll is used is saved with the dice.
  - A sheet made by rolling keeps its dice; one from the standard array or point
    buy keeps its base scores instead.
- **Deleting.** Deleting a character is permanent and removes only that
  character. A pending creation keeps its dice and any unused reroll, so
  deleting is never a reroll.
- **Background increase.** After placement the player adds +2 to one ability and
  +1 to another, or +1 to three. No score can exceed 20. Backgrounds' other
  features are not used. Placement and the increase can change until the
  character is saved; the dice cannot.
- **Starting kit.** Each class offers named kits of common-tier gear and no
  starting coin unless the starting coin [setting](settings.md) gives some
  (below). Kits are stingy by design: a character finds better gear in its first
  dungeons. The Cleric's are the exception: both wear SRD 5.2's chain shirt and
  shield, so the weak Cleric keeps pace with the Fighter (#541). One class's
  kits are of equal value within 3 gp (`KIT_VALUE_TOLERANCE`); kits of different
  classes need not be. Any legal loadout is a valid sheet.
- **Weapon Mastery.** A class that masters weapons chooses them at creation from
  the catalogue weapons whose mastery the game uses and that it is proficient
  with (see [classes.md](classes.md)). A mastery applies only while the
  character wields that weapon.

## Experience and levels

- **Earning XP.** XP is credited only when an adventure ends with the character
  alive, in a victory or an escape. It comes from each encounter won (the
  stat-block XP of the opponents defeated in it, partial XP for those that fled
  or surrendered, and any XP its module awards for sparing one; see
  [talk-and-stealth.md](talk-and-stealth.md)) and from the ending's XP. A defeat
  or an abandoned adventure credits nothing.
- **Naming opponents.** XP lines, cards and refusals name creatures with no
  article ("Defeated Kennel Mastiff; drove off Hesk's Hound"). Doors, traps,
  features and rooms keep "the".
- **Treasure.** Treasure is an item found by examining a feature, by searching
  an opponent's body once its fight is won, or offered by a surrendered
  opponent, and carried out alive. A fled opponent leaves no body, and what it
  carried leaves with it. A surrendered one keeps what it carried unless its
  module has it hand something over.
- **The ledger.** Each XP award and each find (treasure, coin or gear) is earned
  once per character. The sheet's ledger records them apart from what the
  character holds, and a find in the ledger is not there to find on a later
  visit, even once the character no longer holds it.
- **XP rate.** Every award credited when the adventure settles (encounters,
  partial XP, sparing and ending XP) is multiplied by the XP rate setting (×
  0.5, × 1 by default, × 1.5 or × 2) and rounded down, each award on its own.
  The adventure uses the rate it started with, even when it settles after a
  restart, and the leave confirmation, the XP lines and the level-up show the
  scaled numbers. The balance gate, harness and career simulation play at × 1.
- **Levels.** Levels 1–5 follow the 5e XP table; XP above level 5's 6,500 is
  kept. The level follows the XP at once when the adventure settles, with its
  hit points and feature uses. Maximum HP is always derived from the current
  Constitution modifier, so a Constitution increase raises every level's.
- **Level-up choices.** A new level's choices are made on the character's sheet
  between adventures; the AI DM has no tool for them. They are the level-4
  Ability Score Improvement (+2 to one ability or +1 to two, none above 20;
  other feats are not used), the Fighter's fourth weapon mastery with it, a
  caster's new prepared spells and cantrips, and the Wizard's spellbook spells
  and Scholar's Expertise. A sheet may lack an owed choice (fewer prepared
  spells than its level's count, say) only while it owes it. The sheet in the
  library records what is owed, so it survives a reload or restart, and the
  library refuses to start an adventure until every owed choice is made. A
  character that jumps from level 3 to 5 still owes its level-4 choice.

## Leaving, coin and settling

- **Leaving.** In a room that is a way out, out of a fight, the character may
  leave the adventure; the player confirms first. Leaving ends it in the
  module's escape-with-loot ending when the character carries treasure, coin
  found there or sold treasure found there, and in its escape-without-loot
  ending otherwise. The confirmation names that ending and its XP, unless
  already credited. When the ending falls short of the module's objective (its
  victory if it has one, or else getting out with loot) and the objective's
  award was not credited before, it also warns what is unmet, the award given
  up, and that the XP for fights won is kept. The warning comes from a fixed
  template; modules author no text for it. The AI DM has no tool to leave.
- **Coin.** Coin is SRD 5.2 copper, silver and gold pieces. A purse is held in
  copper and shown in mixed denominations. A new character's purse holds the
  starting coin setting's 0 (the default), 10, 25 or 50 gp, as the settings are
  when it is saved; changing the setting changes no character saved before, and
  starting coin isn't loot: carrying it out doesn't make an escape _with loot_.
  A module authors coin as an item of kind `coin`, hidden in a feature or
  carried by an opponent; the engine, not the AI DM, decides how much it holds:
  the authored amount times the treasure found setting (50%, 75%, 100% by
  default or 150%), rounded down to the copper and at least 1 cp. Taking it
  empties it into the purse at once, and the ledger records it as a find.
  Carrying coin found in the adventure out counts as escaping with loot, even
  once it is spent. Coin buys gear only from merchants inside adventures; there
  is no market between adventures.
- **Settling.** An adventure starts holding the character's possessions: its
  equipment, the treasure it holds and its purse. Settling a victory or an
  escape replaces the sheet's possessions with what the character holds at the
  end, adds its new finds and XP awards to the ledger, and rests it to full
  health. A defeat or an abandonment leaves the possessions, the ledger and the
  XP exactly as at the start, so coin and gear gained in an adventure are kept
  only if the character survives it. A character at 0 HP is defeated at once;
  there are no death saving throws (house rule), though a potion may save it as
  Last Stand (see [combat.md](combat.md)). Settling happens once, in the same
  library write that frees the character, so an interruption between the session
  save and the library write is settled on the next request without duplicating
  or losing anything.
- **Rest between adventures.** A rest between adventures restores every hit
  point, feature use (spell slots included) and hit die, so each adventure
  starts with all of them.
