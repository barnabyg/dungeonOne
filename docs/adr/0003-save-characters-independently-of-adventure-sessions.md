# Save characters independently of adventure sessions

> **Superseded by [ADR 0005](0005-start-afresh-on-5e-and-suspend-compatibility.md)** where they conflict: the pre-5e game this ADR describes is removal pending (#139).

The project owner confirmed on 2 October 2026 that a character sheet should be saved independently of a game, like a tabletop character brought to different adventure modules. Keep characters in a persistent character library, with creation and selection before adventure startup; a character remains saved even when no game exists or adventure selection is canceled.

Each adventure session links to its chosen character and retains its starting sheet for deterministic continuation and historical review. Verified results advance the independent character record through recoverable, once-only handoff; restarting an adventure does not delete the character or reset earned career progress. This adds coordination between records, but avoids tying a character's lifetime to a replaceable adventure save or letting later advancement alter an old game's replay.
