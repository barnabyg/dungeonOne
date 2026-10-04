# Restore conversation without making narration authoritative

> **Superseded by [ADR 0005](0005-start-afresh-on-5e-and-suspend-compatibility.md)** where they conflict: the pre-5e game this ADR describes is removal pending (#139).

Players should recover their exact messages, AI replies, and authoritative result cards when continuing Hollow Beacon in the browser, but the existing engine save does not retain that presentation history. Persist a versioned browser conversation record linked to verified game progress, and restore it for reading without reexecuting messages or treating AI prose as game facts. This adds persistence and recovery work, but preserves the requested reading experience while canonical state, the journal, and bounded AI context continue to determine subsequent play.
