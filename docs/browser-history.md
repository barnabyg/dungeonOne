# Browser history persistence contract

The engine save remains `dungeon-one-save`, format version 3. Versions 1–3 and
existing trace formats remain readable. Browser sessions add optional
`browserHistory` and `browserHistoryDigest` fields to the same save envelope;
no sidecar, browser storage, credentials, provider payloads, tool calls, or hidden
adventure snapshot are copied into the public history returned by the API.

`browserHistory.version` is 1. `progress` contains the verified checkpoint's
sequence, state digest, and RNG position. `turns` contains ordered records with
the checkpoint sequence, exact submitted message, displayed reply, optional NPC
speaker name, ordered result cards (`title`, `text`), committed flag, and displayed
save notice. It includes questions, failed service calls, and rejected actions.
The SHA-256 history digest detects accidental edits; it is not authentication.
Unknown versions, fields, malformed values, mismatched progress, checksum failures,
and impossible turn sequences fail before the occupied slot is replaced.

Before contacting the provider, the browser atomically saves a `pending` record
with the exact message, starting sequence, and initially empty recovery cards.
The engine atomically commits any action together with its public recovery card
and updated progress. Once narration completes, a second atomic write replaces
pending with the final display record before the HTTP response is sent. A read
request during a turn returns completed history only. Reads never write the slot.

Startup, and failure handling under the exclusive in-process turn lock, replace
an interrupted pending record with an explicit interruption reply. If progress
advanced, the committed result card is retained and the player is told not to
repeat the saved action; otherwise the player is told no action committed.
Recovery never executes a message or tool call or contacts the AI provider.
Closing the page or server never submits quit. Completed sessions remain readable.

Visible history is limited by the existing 16 MiB save bound and 10,000 turn
records, independently of model context. Route prompts take only the latest four
turns, further bounded by the DM's eight-entry/4,000-character budget. NPC prompts
continue to use only engine-approved speaker-scoped history. State and journal
remain authoritative. Engine-only saves open with empty conversation history;
unrecorded old conversations cannot be reconstructed. Subsequent CLI commits
retain prior browser history and advance its progress link without inventing chat.

Use one local launcher per slot. The existing save API does not coordinate
concurrent game writers in different processes. Choose separate save paths for
separate sessions. Automated restart/interruption checks are in
`tests/issue-100.test.mjs` and execute the page script against HTTP and disk with
deterministic AI fixtures, including an actual killed process after commit.
