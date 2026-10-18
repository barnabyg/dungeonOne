# Settings

The Settings page (the header's **Settings** button) changes how the game plays. Its choices are kept in `settings.json` beside the character library; with no file every setting is at its default. The defaults are the game as balanced: the balance gate, the harness, the career simulation, the DM evaluations and the CLI always play at them, so a player who changes a setting makes the game easier or harder on purpose. There are no presets, only each setting and **Reset to defaults**. Characters are not marked for having played on other settings.

**Each adventure keeps its settings.** Starting an adventure copies every setting into its session, and it plays by that copy to the end, through reloads and restarts. A change made during an adventure applies from the next one. Between adventures the character sheet shows the settings of the moment.

**The file.** A setting missing from `settings.json` is at its default. A file that isn't valid JSON, names an unknown setting, holds a value its setting doesn't offer or is in another format version is refused with a message naming it: move it aside to play at the defaults.

| Setting           | Choices                                                                          | Default | Rules                                                                           |
| ----------------- | -------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------- |
| Carrying capacity | Strength × 10, × 15, × 20 or × 30 lb, or unlimited                               | × 15    | [Gear](gear.md#carrying-capacity)                                               |
| Treasure found    | 50%, 100%, 150% or 200% of coin taken and of gems' and art's value               | 100%    | [Gear](gear.md#treasure), [Characters](characters.md#leaving-coin-and-settling) |
| Items found       | Normal, or Scarce: each potion, gear, scroll or wand missing with an even chance | Normal  | [Gear](gear.md#treasure)                                                        |
| Merchant prices   | × 0.5, × 0.75, × 1, × 1.5 or × 2 the catalogue price                             | × 1     | [Gear](gear.md#trading-with-merchants)                                          |
| Merchant buy-back | 25%, 50%, 75% or 100% of the catalogue price                                     | 50%     | [Gear](gear.md#trading-with-merchants)                                          |
| Starting coin     | 0, 10, 25 or 50 gp, given when a new character is saved                          | 0 gp    | [Characters](characters.md#leaving-coin-and-settling)                           |
