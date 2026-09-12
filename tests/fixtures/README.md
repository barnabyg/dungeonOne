# Historical signet fixtures

Captured from commit `2e9a28cc416f42fa57b070e7d96ae6f2582de05d` on 12 September 2026,
before runtime edits, using the built CLI and checked-in acceptance inputs.
`historical-victory` and `historical-defeat` use command mode; `historical-ai-*`
use the corresponding scripted DM responses. Victory and failure use seed 0;
defeat uses seed 207. JSON exports are unmodified. Terminal goldens omit only
the final path-dependent `Trace exported to ...` line.

All player text and narration are synthetic checked-in acceptance data. There
are no live provider responses, credentials, headers, private user inputs, or
machine-specific paths. Both outcomes, command rejections, and a DM failure
after a committed mutation are covered. The existing
`format-1-command-rejections.json` preserves rules-v1 rejection behavior.

CLI tests compare new explicit-selector runs to these frozen JSON and terminal
outputs, then replay them. They also exercise supported prior DM prompt metadata,
missing adventure IDs, and mismatched/unknown versions without a provider.
Do not regenerate these expected outputs to accommodate a runtime change.
