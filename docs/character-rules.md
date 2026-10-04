# 5e rules

Dungeon One is moving to the 2024 fifth-edition rules in SRD 5.2 ([ADR 0005](adr/0005-start-afresh-on-5e-and-suspend-compatibility.md)). This section is the rules document for the new game. It is filled in as the increment 11 tickets land: character creation with #127, combat with #128–#130, and checks, traps and talk with #132. Until #137, 5e play is reached only through the browser's temporary `--5e` flag.

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

## In scope

Ability modifiers, proficiency bonus, saving throws, skills, advantage and disadvantage, action, bonus action and reaction, the 5e XP table and SRD 5.2 stat blocks. Feats beyond the level-4 Ability Score Improvement, multiclassing, species and backgrounds' features other than the ability increase are not used.

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
