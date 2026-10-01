# Browser history persistence contract

The engine save remains `dungeon-one-save`, format version 3. Versions 1–3 and
existing trace formats remain readable. Browser sessions add optional
`browserHistory` and `browserHistoryDigest` fields to the same save envelope;
no browser storage, credentials, provider payloads, tool calls, or hidden
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
request during a turn also returns the pending message and available authoritative
recovery cards. GET reads never write the slot.

Startup and explicit recovery under the exclusive in-process turn lock replace
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


New saves carry an optional random `generation` identity; old saves remain readable.
Every typed or clicked POST turn supplies the visible revision, hashed from the
generation, verified progress, and conversation history. Once an attempt is saved,
its older revision cannot execute again, including questions or failed AI calls.
A stale request returns the current public view without contacting the provider.
Contextual offer IDs remain stable until authoritative progress changes.

Browser-history saves sync a temporary file, publish it as `<save>.recovery`, then
rename it to the primary slot. A leftover recovery journal takes precedence on
load and passes the same bounded envelope, engine replay, RNG and history checks.
Invalid journals fail closed. Startup recovery publishes interrupted history.
The journal contains the complete private save envelope, never an HTTP payload.
If persistence fails before a journal exists, the browser retains its session in
memory and blocks more turns. POST `/api/recover` retries only persistence/history
recovery, never AI or engine execution. The page invokes this from **Read current
state**. Do not stop a launcher with an unsaved in-memory result until recovery
succeeds; it cannot claim that such a result survives process termination.
Pending records may also contain an optional authored `reply` and `speaker`, which preserve
NPC dialogue across interrupted narration. Versions 1–3 remain readable.

Engine-only command saves retain their existing failure contract: failed primary
publication leaves the previous primary as the resumable position.
