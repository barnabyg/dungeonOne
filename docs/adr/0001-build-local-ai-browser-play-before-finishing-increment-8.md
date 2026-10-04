# Build local AI browser play before finishing increment 8

> **Superseded by [ADR 0005](0005-start-afresh-on-5e-and-suspend-compatibility.md)** where they conflict: the pre-5e game this ADR describes is removal pending (#139).

The current increment 8 plan is text-first, but player testing found that important context gets buried in the conversation and that checking inventory interrupts play. After issue #84, pause the remaining increment 8 tickets and complete increment 9 as a local browser experience for Hollow Beacon. The browser is the primary play surface, with a central conversation and persistent location, exits, time, and HP; gameplay requires the AI service. Command mode remains available for testing and compatibility. After increment 9, rewrite the remaining increment 8 tickets around the browser and then resume them.

This sequence adds UI work before the adventure is complete, but lets subsequent presentation, save/continue, live-AI, and player-qualification work target the intended play experience. Earlier adventures do not require browser support in increment 9, and unfamiliar-player qualification returns when increment 8 gameplay work resumes.
