# Settings

The Settings page (the gear button, **Settings**, at the end of the header)
changes how the game plays; its **Back to …** button returns to the adventure,
sheet or character list it was opened from. Its choices are kept in
`settings.json` beside the character library; with no file every setting is at
its default. The defaults are the game as balanced: the balance gate, the
harness, the career simulation, the DM evaluations and the CLI always play at
them, so a player who changes a setting makes the game easier or harder on
purpose. There are no presets, only each setting and **Reset to defaults**.
Characters are not marked for having played on other settings.

**Each adventure keeps its settings.** Starting an adventure copies every
setting into its session, and it plays by that copy to the end, through reloads
and restarts. A change made during an adventure applies from the next one.
Between adventures the character sheet shows the settings of the moment.

**The file.** A setting missing from `settings.json` is at its default. A file
that isn't valid JSON, names an unknown setting, holds a value its setting
doesn't offer or is in another format version is refused with a message naming
it: move it aside to play at the defaults.

**The Dungeon Master's model** is a menu of the models OpenAI's model list
offers the launch's `OPENAI_API_KEY`, fetched when Settings first opens and
kept for the launch. It offers the GPT 5 and later families and the o series,
since they take a thinking level, and leaves out image, audio, realtime,
transcription, speech, search, live, Codex, `-pro`, moderation and embedding
models, aliases such as `chat-latest`, and dated snapshots. The default and the
current model are always offered. Without a key, or when the list can't be
fetched, the menu offers only those and says why. Since the list changes, the
file may name any well-formed model id. The thinking level is sent as the
model's reasoning effort, and Model default sends none; a model that rejects
the chosen level can't answer typed messages until another level is chosen.
A call waits 30 s, 60 s at High and 120 s at Extra high.

| Setting                   | Choices                                                                          | Default         | Rules                                                                               |
| ------------------------- | -------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| Carrying capacity         | Strength × 5, × 10, × 15 or × 20 lb, or unlimited                                | × 15            | [Gear](gear.md#carrying-capacity)                                                   |
| Treasure found            | 50%, 75%, 100% or 150% of coin taken and of gems' and art's value                | 100%            | [Gear](treasure.md#treasure), [Characters](characters.md#leaving-coin-and-settling) |
| Items found               | Normal, or Scarce: each potion, gear, scroll or wand missing with an even chance | Normal          | [Gear](treasure.md#treasure)                                                        |
| Merchant prices           | × 0.5, × 0.75, × 1, × 1.5 or × 2 the catalogue price                             | × 1             | [Gear](gear.md#trading-with-merchants)                                              |
| Merchant buy-back         | 25%, 50%, 75% or 100% of the catalogue price                                     | 50%             | [Gear](gear.md#trading-with-merchants)                                              |
| Starting coin             | 0, 10, 25 or 50 gp, given when a new character is saved                          | 0 gp            | [Characters](characters.md#leaving-coin-and-settling)                               |
| Short rests per adventure | 0, 1, 2, 3, 4 or unlimited (per region in a long module)                         | 2               | [Rests](combat.md#rests)                                                            |
| Long rest at rest sites   | On or Off (no long rest anywhere)                                                | On              | [Rests](combat.md#rests)                                                            |
| Last Stand                | Off, DC 11, DC 10 or Automatic (no death save)                                   | DC 11           | [House rules](house-rules.md)                                                       |
| Opponent hit points       | 75%, 100%, 125% or 150% of the stat block's, rounded up                          | 100%            | [Combat](combat.md#combat)                                                          |
| Wandering encounters      | Off, Normal or Double chance (up to 100)                                         | Normal          | [Exploring](flags.md#wandering-encounter-tables)                                    |
| Fleeing draws attacks     | On or Off (no attacks, as after Disengage)                                       | On              | [Exploring](exploring.md)                                                           |
| Morale                    | Never flee, Normal or Flee easily (each DC +2)                                   | Normal          | [Morale](talk-and-stealth.md#morale-and-surrender)                                  |
| Ability scores            | 4d6 drop lowest, standard array, point buy, or 4d6 drop lowest with one reroll   | 4d6 drop lowest | [Characters](characters.md#creating-a-character)                                    |
| XP rate                   | × 0.5, × 1, × 1.5 or × 2                                                         | × 1             | [Characters](characters.md#experience-and-levels)                                   |
| Dungeon Master model      | OpenAI's listed models (see above)                                               | `gpt-6-luna`    | The OpenAI model the AI DM answers typed messages with; the session file records it |
| Dungeon Master thinking   | Model default, None, Low, Medium, High or Extra high                             | Model default   | How hard the AI DM's model reasons before it answers; the session file records it   |

**Sound** is on the Settings page too, but it is not a setting: it is the
header's mute button and volume slider again, kept by the browser rather than in
`settings.json`, applied at once (in an adventure too) and left alone by **Reset
to defaults**. With `--no-sound` the page says sound is off for this launch and
has no sound controls.
