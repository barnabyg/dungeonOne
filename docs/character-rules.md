# 5e rules

Dungeon One is moving to the 2024 fifth-edition rules in SRD 5.2 ([ADR 0005](adr/0005-start-afresh-on-5e-and-suspend-compatibility.md)). This section is the rules document for the new game. It is filled in as the increment 11 tickets land: character creation with #127, combat with #128–#130, and checks, traps and talk with #132. Until #137, 5e play is reached only through the browser's temporary `--5e` flag.

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

## In scope

Ability modifiers, proficiency bonus, saving throws, skills, advantage and disadvantage, action, bonus action and reaction, the 5e XP table and SRD 5.2 stat blocks. Feats beyond the level-4 Ability Score Improvement, multiclassing, species and backgrounds' features other than the ability increase are not used.

## Creating a Fighter

Every character is a Fighter created at level 1 with 0 XP, using the fixed kit below. The library refuses any new sheet at another level, with XP, below full health, or not made from its pending dice.

**Ability scores.** The engine rolls 4d6 six times from a seeded stream of its own: SHA-256 of the browser's startup seed and the library's creation number and drops the lowest die of each roll. The six rolls are saved in the character library as a pending creation before the player sees them, and every die, including each dropped one, is shown. While the creation is pending, reloading the page, restarting the server (with any seed) or leaving the creation screen shows the same dice; there are no rerolls and no minimum set. The player places the six results on the six abilities in any order. Saving a character spends its dice; the next creation rolls a new set. Deleting a character and starting again is allowed. A character sheet's **Delete character** control opens a confirmation that says deletion is permanent; the final Delete button is enabled only once the player types the character's name exactly, case and spaces included. Cancel, Escape and closing the confirmation change nothing. There is no undo, archive or recycle bin. Deleting removes only that character: a pending creation keeps its dice, so deletion is never a reroll, and the only way to new dice is still to save a character and start another creation.

**Background increase.** After placement the player adds +2 to one ability and +1 to another, or +1 to three. No score can exceed 20. Backgrounds' other features are not used. Placement and the increase can change until the character is saved; the dice cannot.

**Modifiers.** (score − 10) / 2, rounded down: 3 is −4, 8–9 are −1, 10–11 are +0, 12–13 are +1, 18–19 are +4, 20 is +5.

**Kit.** A chain shirt (AC 13 + Dexterity modifier, at most +2), a shield (+2 AC) and a mace (1d6 bludgeoning, Sap mastery). This is common-tier gear, deliberately weaker than the 2024 Fighter's chain mail and greatsword. Kit choice comes in increment 12.

## The Fighter, levels 1–3

| Level | XP  | Proficiency bonus | HP                 | Features                                        |
| ----- | --- | ----------------- | ------------------ | ----------------------------------------------- |
| 1     | 0   | +2                | 10 + Con modifier  | Fighting Style, Second Wind, Weapon Mastery     |
| 2     | 300 | +2                | + 6 + Con modifier | Action Surge (1 use), Tactical Mind             |
| 3     | 900 | +2                | + 6 + Con modifier | Champion: Improved Critical, Remarkable Athlete |

Level 3 is the highest supported level; XP above 900 is kept.

- **Armour class:** 15 + Dexterity modifier (at most +2), so 15–17 with Dexterity 10 or more and lower with less; +1 with the Defense style.
- **Initiative:** Dexterity modifier.
- **Mace attack:** Strength modifier + proficiency bonus to hit; 1d6 + Strength modifier bludgeoning damage. A critical hit needs a 20, or 19–20 from level 3.
- **Saving throws:** proficient in Strength and Constitution; the others use the ability modifier alone.
- **Skills:** two of Acrobatics, Animal Handling, Athletics, History, Insight, Intimidation, Perception, Persuasion and Survival.
- **Fighting Style:** Defense (+1 AC in armour), Great Weapon Fighting or Two-Weapon Fighting. Archery is left out because ranged weapons are deferred. Great Weapon Fighting and Two-Weapon Fighting have no effect with a mace and shield, and the creation screen says so.
- **Second Wind:** a bonus action to regain 1d10 + Fighter level HP; 2 uses, one regained on a short rest and all on a long rest.
- **Weapon Mastery:** the 2024 Fighter masters three kinds of weapon. The mace is the only weapon in the game, so its Sap is the only mastery used for now: a creature it hits has disadvantage on its next attack roll before the start of your next turn. Of the SRD masteries, Graze, Nick, Sap, Topple and Vex work without positions; Cleave, Push and Slow are omitted.
- **Action Surge (level 2):** one additional action on your turn, except Magic; 1 use per short or long rest.
- **Tactical Mind (level 2):** when you fail an ability check, you can expend a use of Second Wind to add 1d10 to it instead of healing; the use is kept if the check still fails.
- **Champion (level 3):** Improved Critical (critical hits on 19–20) and Remarkable Athlete (advantage on initiative and Strength (Athletics) checks; its movement after a critical hit is omitted).

## Combat

Combat (#128) uses the numbers above. An encounter has two sides, the party and its opponents, and each side may hold several combatants; for now the party is one Fighter, and a module may set several opponents against it. Every die comes from the adventure session's own seeded stream and is recorded with the action that drew it.

- **Initiative.** When a fight begins, each combatant rolls d20 + its initiative bonus (Dexterity modifier). Higher totals act first. A tie goes to the higher Dexterity score; combatants still tied each roll a d20 roll-off, repeated among any still tied, and the higher roll acts first. The browser shows every combatant's roll, the order, hit points and whose turn it is.
- **Turns.** Combatants act in initiative order, round after round, skipping the defeated. On the player's turn the player attacks one living opponent of their choice, by its Attack button or by naming it to the AI DM. A defeated opponent drops out: it takes no more turns and cannot be targeted, and the fight goes on while any opponent stands.
- **Opponent targeting.** Each opponent attacks a living party combatant on its own turn. With one party combatant there is no choice and no die. With more (companions, later), the opponent rolls a die with one side per living party combatant, from the session's seeded stream, and attacks the one at that position counting in initiative order; the die is recorded with the attack.
- **Attacks.** d20 + attack bonus hits when it meets or beats the target's AC. A natural 20 (19–20 for a Champion) is a critical hit, which always hits and rolls the damage dice twice; a natural 1 always misses. Damage is the dice plus the damage modifier, never below 0.
- **Defeat.** A combatant at 0 HP is defeated. An opponent at 0 HP drops out of the fight, and when every opponent is defeated the module's victory ending follows. The player character at 0 HP is defeated at once (no death saving throws): the adventure ends in the module's defeat ending, the character's sheet is saved at 0 HP and marked defeated, and it cannot start another adventure. After a victory the character keeps its sheet as it was before the fight; XP, treasure and lasting damage arrive with #133.
- **Refused actions.** Acting out of turn, attacking an absent, friendly or defeated target, or attacking after the fight is over is refused with an engine-written reason. A refusal changes nothing and draws no dice.
- **Not used yet.** Weapon Mastery (Sap), Second Wind and Action Surge arrive in combat with #130, and advantage and disadvantage with them. Remarkable Athlete's advantage on initiative waits for level 3 characters (#133). An opponent uses its stat block's first melee attack; stat-block riders that need advantage (the Goblin Warrior's extra 1d4), bonus actions such as Nimble Escape, and ranged attacks are not used.

**The AI Dungeon Master.** The engine is the only authority over dice, turn order, targets, hits, damage, hit points and endings. The AI DM may only call three tools: `look` and `get_character_status` to read the scene, and `attack`, whose target must be one of the living opponents it lists and which is offered only on the player's turn. Opponents are listed by id and name; when the player's words fit exactly one ("attack the second minion"), the AI calls `attack` with it, and when they name none or fit several ("attack the goblin" with three goblins) it asks which one and calls nothing. It never guesses a target. It takes no roll, damage, advantage or outcome argument; any extra argument is refused before the engine is reached. The engine writes the reply to every attack it resolves or refuses, so the AI cannot narrate a different roll or result, and a reply without a tool call changes nothing.

## Adventure modules

A 5e adventure module is a JSON file in format version 1 (`src/adventure-5e.ts`). It declares its recommended levels (1–3) and a difficulty (easy, medium or hard), its rooms, the encounter in each room with each opponent's SRD 5.2 stat block inline (size, type, AC, average hit points and formula, ability scores, challenge rating, XP and melee attacks), and its victory and defeat endings. The validator rejects unknown room, encounter and ending references, an encounter whose victory or defeat ending names the wrong kind, a module without a victory ending, and two opponents in one encounter with the same name, since the player targets opponents by name. A module in another format version is refused with a message naming the file.

The built-in fixture `adventures/5e/cellar-goblin.json`, _The Goblin in the Cellar_, is one room with one SRD 5.2 Goblin Warrior (AC 15, 10 HP, Scimitar +4 for 1d6 + 2 slashing), for level 1 and declared Easy. `adventures/5e/goblin-storeroom.json`, _The Goblins in the Storeroom_, is one room with a group fight: two SRD 5.2 Goblin Minions (AC 12, 7 HP, Dagger +4 for 1d4 + 2 piercing) and a Goblin Warrior, for level 1 and declared Hard. Without Second Wind and Action Surge (#130), a level 1 Fighter that always attacks wins it about one time in five. The balance gate (#135) checks neither module yet.

## House rules

- A player character at 0 HP is defeated at once; there are no death saving throws.
- Ability scores are rolled once with 4d6-drop-lowest and placed freely; there are no rerolls.
- Starting gear is common tier only.
- Morale and reaction rolls are planned for later increments.

## Rules that need positions

The game has no grid or map. Each 5e rule that needs distance is listed here with how it is handled:

| Rule                                                   | Handling |
| ------------------------------------------------------ | -------- |
| Movement speed                                         | Omitted  |
| Reach                                                  | Omitted  |
| Opportunity attacks                                    | Omitted  |
| Areas of effect                                        | Omitted  |
| Ranged weapons and attacks                             | Deferred |
| Weapon masteries that move or need range, such as Push | Omitted  |
| Cleave, Push and Slow masteries                        | Omitted  |
| Remarkable Athlete's movement after a critical hit     | Omitted  |
| Who an opponent can reach                              | Every living party combatant is in reach |

Later tickets add rows when they meet another positional rule.

# Pre-5e house rules (removal pending #139)

The Fighter rules below belong to the pre-5e game. They still govern the default browser and the CLI until #139 removes them; they are not extended.

## Fighter rules, version 1

These are Dungeon One house rules inspired by early D&D. They retain ascending armor class and d20 attacks; they do not claim fidelity to a published edition. One Fighter plays at levels 1–3.

Scores use these modifiers: 3 = −3, 4–5 = −2, 6–8 = −1, 9–12 = 0, 13–15 = +1, 16–17 = +2, 18 = +3. Three balanced-total presets favor general play, strength/endurance, or agility/awareness. Scores remain fixed throughout a career.

All Fighters carry chain mail, a shield, and a longsword. Armor class is 16 plus Dexterity, with positive Dexterity capped at +1 by chain mail. Initiative uses Dexterity. Melee attack bonus is level + 1 + Strength. Longsword damage is 1d8 + Strength, with a minimum of 1 on a hit; critical hits roll two dice. Strength is applied once. Maximum HP is 18 + Constitution at level 1; each later level adds 8 + Constitution.

An authored check names one of the six abilities and adds that score's modifier to a d20. Difficulties and circumstances belong to the module. Optional checks never guard the only essential clue.

Level 2 starts at 1,000 XP; level 3 at 2,500 XP. XP above 2,500 remains recorded, while level 3 is the supported cap. Adventure XP is pending until surviving completion. Rewards have stable identities and are earned once per character across plays and module revisions. Level changes and permanent career rewards are accepted together after verified completion. Failure, abandonment, and defeat discard pending XP. Defeated characters cannot start another adventure.

Completion preserves remaining HP. An explicit between-adventure rest restores HP and clears transient adventure conditions before another start. Permanent equipment carries; quest items, discoveries, relationships, clocks, and remembered checks belong to their adventure. One character may have one active session. A frozen starting sheet, independent library revision, and accepted completion receipt protect replay and prevent competing careers.

## Fighter rules, version 2

Version 2 adds one way to make a Fighter: **roll abilities (3d6 in order)**. The engine rolls three d6 for each ability in order, Strength first and Charisma last, from a stream seeded by the browser's startup seed. The player sees every die before saving. The player may reroll the whole set as often as they like, but cannot reroll a single ability, keep part of a set, or rearrange scores. A set can make a Fighter only if it meets the Fighter minimums: Strength 9, Dexterity 9 and Constitution 7. A set below them must be rerolled.

The sheet records `rulesVersion: "fighter-rules-v2"` and the dice in `abilityRolls`, and each ability score must equal its three dice. Presets still make version 1 sheets, which never carry `abilityRolls`. Everything else in version 1 applies unchanged, so a module that declares `fighter-rules-v1` also accepts version 2 Fighters. The Strength and Dexterity minimums come from balance qualification: one band lower and survival in Hollow Beacon's level 1 fight falls below 80%. Constitution 7 is the traditional Fighter minimum. Balance alone would allow Constitution 4, and Constitution 3 fails. `tests/character-balance.test.mjs` qualifies every permitted modifier combination at each recommended level, with the other three abilities at 3, and checks that the excluded bands fail.

Builds that predate version 2 reject a version 2 sheet, so they cannot read a character library that contains a rolled character.

## Fighter rules, version 3

Version 3 adds treasure (#119). Every character created from now on uses it, whether from a preset or a roll; a rolled version 3 sheet records its dice in `abilityRolls` as version 2 does, and a preset one has none. The sheet adds `inventory`: whole `silver` (0–1,000,000) and up to 20 carried `items`. The only item is the **healing draught**: drinking it restores 1d4 + 1 HP, never above maximum HP, and uses it up. Drinking follows the existing healing-item rules, including spending a combat turn. Silver has no use yet. Version 1 and 2 characters load and play unchanged, but never receive treasure, and are never converted.

Treasure is always found or given, never simply awarded. A module under character adventure rules v3 (schema 18) lists silver in `treasure`, each with authored `text` that says where it comes from. Silver is either found, when examining something grants a named discovery, or given at completion by a named person (`giverId`), who must be alive to give it. Draughts are ordinary placed items: the player sees one, takes it and may drink it at once. `treasureItems` marks which placed items a version 3 character keeps if still carried, unused, on surviving completion. Defeats, checks and milestones award XP only; an enemy's loot lies among its belongings. The engine alone decides what is there. Treasure follows the XP rules: it is pending until surviving completion, and each treasure identity is earned once per character, in the same ledger as reward identities. A replay still shows the placed draught, which can be drunk but not kept again. Failure, abandonment and defeat discard pending treasure and restore the starting inventory, so a draught drunk in an abandoned or lost adventure is not spent. A defeated character keeps its inventory but cannot start another adventure. Carried draughts are in the inventory at the start of every adventure. Older characters can take and drink a placed draught but keep nothing.

Treasure stays rare and small. In Hollow Beacon v15 the raider's supply sack, reachable only after the optional ridge fight, holds a purse of 4 silver and a healing draught; at the end the tower runner gives 10 silver for the warning. In Stonebridge v2 the archive chest holds a forgotten purse of 5 silver, and a healing draught lies behind the stone cover in the optional raider's den. `tests/character-balance.test.mjs` qualifies both releases with every preset and permitted roll at their recommended levels. A character carrying one draught still qualifies there and survives at most six more of the 64 seeds. Drinking costs a turn, so on some seeds it does not help.

Builds that predate version 3 reject a version 3 sheet, so they cannot read a character library that contains a character made by this build.
