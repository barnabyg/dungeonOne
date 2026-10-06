# Increment 12 ticket proposal

Status: approved by the project owner and published as GitHub issues #206–#211 on 6 October 2026. Every issue has the `ready-for-agent` label and native blocking links. Source: the [D&D 5e expansion plan](dnd-expansion-implementation-plan.md), section 5, with the owner decisions in its section 10.

The published issues are the source of truth for each ticket's scope and acceptance criteria. This document is the publication record.

## Breakdown changes before publication

The plan's six slices were reworked into six vertical slices, each playable end to end in the browser:

- **Settlement first.** Since #133, settling _adds_ the treasure carried out to the sheet. Gear that can be dropped, swapped or sold needs settling to _replace_ the character's possessions with what it holds at the end. That change is gameplay-neutral, so it lands first as its own ticket (#206).
- **12.1 folded into 12.2.** A catalogue on its own is a data-only layer. The catalogue and the rules module that derives AC, attack and damage arrive with kit choice (#207), which also adds Weapon Mastery choice and the light-weapon bonus-action extra attack so a two-light-weapon kit is a real choice.
- **Coin added.** The plan had no slice that introduces currency, which merchants need. #208 adds it.
- **12.4 dropped.** The owner chose in-adventure merchants only (decision 8). Half-price selling moves to the merchant ticket (#210).

## Owner decisions

Settled on 6 October 2026 (plan section 10):

- **Currency:** copper, silver and gold, stored as copper and shown in mixed denominations.
- **Starting equipment:** named common-tier kits only, no starting coin.
- **Markets:** in-adventure merchants only. Merchants stock common items always, uncommon from level 3, and no rare items in this increment.

## Shared implementation contract

Every published issue repeats this contract:

- **Throwaway formats:** one format version per file type; older files refused with a clear message, never deleted or migrated.
- **Engine authority** over dice, AC, prices, stock and outcomes, with a rejection path for each new tool.
- **Found or given:** gear and coin are found, given or traded, never simply awarded.
- **Adventure rollback:** surviving completion keeps what the character holds at the end; defeat or abandonment restores the start.
- **Balance gate**, **no positions**, **common-tier starting gear** and **SRD 5.2 only**.
- **Testing:** commit per ticket, browser → API → storage for critical journeys, `npm.cmd run verify` with zero warnings before pushing.

## Publication index

| Issue                                                     | Plan slice            | Title                                                                      | Blocked by |
| --------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------- | ---------- |
| [#206](https://github.com/barnabyg/dungeonOne/issues/206) | 12.3 (settlement)     | Settle an adventure by replacing what the character holds                  | None       |
| [#207](https://github.com/barnabyg/dungeonOne/issues/207) | 12.1, 12.2            | Choose a starting kit and weapon masteries at creation                     | None       |
| [#208](https://github.com/barnabyg/dungeonOne/issues/208) | new                   | Find coin and carry it out                                                 | #206       |
| [#209](https://github.com/barnabyg/dungeonOne/issues/209) | 12.3                  | Find, equip, swap and drop gear during an adventure                        | #206, #207 |
| [#210](https://github.com/barnabyg/dungeonOne/issues/210) | 12.5 (+ 12.4 selling) | Trade with merchants inside adventures                                     | #208, #209 |
| [#211](https://github.com/barnabyg/dungeonOne/issues/211) | 12.6                  | Release an adventure with a merchant and found gear, and write the handoff | #210       |

#206 and #207 can start immediately and in parallel. After them, #208 and #209 can run in parallel.

#144 (Fighting Styles) is now blocked by #207 and #209.

One ticket pauses for the owner:

- #211: the owner approves the premise, room map, merchant stock and gear placement before content is written.
