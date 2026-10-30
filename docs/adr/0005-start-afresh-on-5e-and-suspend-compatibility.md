# Start afresh on 5e and suspend compatibility until a stable release

The game moved to the 2024 fifth-edition rules in the System Reference Document 5.2 (SRD 5.2, CC-BY-4.0) instead of extending its own rules, as building every feature twice cost more than starting again. The pre-5e game, its adventures, characters, saves and traces were removed without migration; git history keeps them.

## Decision

**SRD 5.2 for everything.** Every character and adventure module uses SRD 5.2 rules, names and stat blocks. Content outside SRD 5.2 is not used. The rules document ([`docs/rules/README.md`](../rules/README.md)) carries the SRD 5.2 attribution.

**Characters outlive adventures.** A character lives in a persistent character library, independent of any adventure save, like a tabletop character brought to different modules. It stays saved when no adventure exists or one is cancelled. Each adventure session links to its character and keeps its starting sheet, so replays stay deterministic. Verified results advance the library character through a recoverable, once-only handoff; restarting an adventure never deletes the character or resets earned progress. The browser is the play surface, and conversation history is restored for reading only: AI prose is never a game fact.

**Throwaway formats.** Until a stable release, the character library, adventure save, trace, adventure module and layout sketch files each carry one format version. A change to a format bumps its version. A loader that meets an older version refuses the file with a message that names it and tells the player to move it aside. Files are never deleted, migrated or reinterpreted, and there are no compatibility shims, migrations, fallbacks or per-increment rules versions.

**Declaring a stable release.** Compatibility contracts resume only when the owner declares a release stable, in writing, in a new ADR that names the release and the format versions it freezes. From then on those formats are compatibility contracts: later builds keep reading them or offer an approved migration. No release is stable until that ADR exists, whatever its version number or tag.

**House rules.** Every departure from SRD 5.2 is a house rule, listed, with the SRD rule it replaces, in [`docs/rules/house-rules.md`](../rules/house-rules.md), and so is the handling of every rule that needs positions. The founding ones:

- A player character at 0 HP is defeated at once, with no death saving throws; a defeated character cannot start another adventure. Monsters at 0 HP are defeated as in 5e. (A later house rule, [Last Stand](../rules/house-rules.md), adds a single save.)
- Ability scores are rolled once with 4d6-drop-lowest from the seeded stream and placed freely. The set is saved before it is shown, so reloading or restarting creation shows the same set. There are no rerolls.
- Starting gear is common tier only, as early levels are the most dangerous; it departs from the 2024 starting equipment.
- Morale and reaction rolls are added, though neither is core 5e.

**Left out of 5e.** There is no tactical grid: the map lays out rooms, not positions inside them, so rules that need distance are abstracted or omitted. Feats other than the level-4 Ability Score Improvement, multiclassing and species are not used; one class per character keeps balance qualification tractable. Of a background, only the ability increase is kept, to keep creation small and gear common tier.

## Consequences

Players move old files aside rather than having them converted. In exchange, there is one rules engine, and agents must not add compatibility shims, migrations or rules-version branches until the stable-release ADR exists.
