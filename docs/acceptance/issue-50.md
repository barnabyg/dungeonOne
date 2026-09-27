# Issue #50: independent adventure

`adventures/tide-observatory.json` is a small external adventure. It begins in
the signal tower, uses a directed loop with a side store, reveals the keeper
only after the pier chart is searched, and offers a report after either the
vault log or the keeper's account. The private choice additionally requires
the log. It uses a blue tonic, a brass sentinel, and two authored endings.
No selector or runtime registration names this adventure.

`node dist/cli.js --validate-adventure adventures/tide-observatory.json`
accepts the file. Its six `analysis-incomplete` warnings are resolved by these
seeded route checks in `tests/issue-50.test.mjs`:

| Diagnostic entity | Route evidence |
| --- | --- |
| `sentinel-cleared` | Seed 0 defeats the brass sentinel in two attacks. |
| `log-reading`, `log-read` | The seed 0 CLI and scripted AI routes defeat the sentinel, then search the log. |
| `keeper-testimony`, `keeper-account` | The same routes return to the pier with the log reading and ask the keeper about the signal. |
| `/endings/any` | Both choices complete through CLI and scripted AI, with format-4 export and replay. |

The tests also rename identities and aliases, reorder entity lists, change
description and ending requirements in a copied JSON file, replay after
deleting a source copy, exercise healing and speaker visibility, and check
fresh sessions and tool intent. Reordering two matching speaker replies changes
the selected text, while reversing the full list is rejected because the
required final fallback would be displaced.

For a manual check after `npm.cmd run build`, run:

```text
node dist/cli.js --adventure-file adventures/tide-observatory.json --seed 0
move pier
search chart
move vault
attack sentinel
attack sentinel
search log
move tower
resolve private report
status
```

Expect the private report and `Fate: signal-unlit`. To inspect the optional
speaker route, return from the vault through the tower to the pier, ask the
keeper about the signal, then return to the tower. `--trace <path>` records a
self-contained trace that `--replay <path>` can replay after the source is
removed. The route evidence establishes these reachable outcomes for seed 0;
it does not prove every choice or random seed succeeds.

The active external runtime, tool projection, and CLI file route use the
validated definition's IDs and content. The audit found one hardcoded Tavi
label in the active runtime's status and journal; it now renders a generic
fate label. Legacy chapel and signet modules remain tied to their historical
formats and built-in defaults until the separate cutover ticket.
