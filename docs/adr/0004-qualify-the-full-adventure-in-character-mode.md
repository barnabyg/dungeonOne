# Qualify the full adventure in character mode

> **Superseded by [ADR 0005](0005-start-afresh-on-5e-and-suspend-compatibility.md)** where they conflict: the pre-5e game this ADR describes was removed in #139.

Increment 10 made the character library the default browser mode without a ticket, after the remaining increment 8 tickets (#93–#95) had been written around increment 9's single save slot. On 3 October 2026 the project owner confirmed that character mode is the intended player experience: players keep persistent characters and bring them to adventure modules aimed at a recommended level range, earning experience and levels, as at a tabletop. #93–#95 were revised to qualify the full adventure there, with Hollow Beacon v12 played by a new level-1 character. Continuation reruns the same launcher command, and replacing an active adventure is an explicit abandon, rest and new start that keeps the old journey reviewable.

The single save slot remains as the browser's `--legacy` mode only so released Hollow Beacon v4–v11 saves stay playable; the command-line app remains a testing and regression adapter. One release table (`src/browser-releases.ts`) states which releases each mode starts and which it only continues. This keeps released saves working without migration, at the cost of maintaining the legacy mode until a later explicit decision retires it.
