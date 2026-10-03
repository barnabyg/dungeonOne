# Issue 109: contextual talk clicks are unambiguous to the live DM

Checked on 3 October 2026 on `fix/issue-109-talk-labels`, in the browser's
default character mode (Hollow Beacon v12).

## Change

Character adventures now use `character-adventure-tools-v2`. Only the `talk`
tool changes:

- **Labels and offered approaches.** The description lists each available
  topic with its player-facing label, the approaches the browser offers for it
  and its stakes text. At Vey it lists:
  - `plate-proof "Present the work order and setting plate" [ask only]`
  - `stand-down "Ask Vey to stand down" [ask or persuade]`

  It maps “Ask _speaker_ about _label_” to `ask` and “Persuade
  _speaker_ to discuss _label_” to `persuade`, and tells the model never to
  ask for an approach the player already named.

- **Approach enum.** It lists only the approaches offered somewhere in the
  scene (`ask`, `persuade`). `deceive` and `intimidate` are no longer offered
  to the model in character adventures. The browser never offered them.
- **One rule.** The browser's talk buttons and the tool share
  `offeredTalkApproaches` in `src/adventure-loader.ts`. Claims are
  persuade-only, corrections ask-only, and other topics offer persuade only
  when it can differ from asking (a social check or a persuade-specific
  reply).

Engine talk validation is unchanged. The model still selects the call, and the
click still has to match it. The release tuple (`character-adventure-rules-v1`,
engine v1, schema 17) is unchanged, so released character saves continue,
because saves do not record a tool version. Legacy single-slot Hollow Beacon
releases keep the generic `talk` tool. AI traces recorded under
`character-adventure-tools-v1` still replay, because replay re-dispatches each
recorded call; it does not re-offer tools.

## Scripted evidence

`tests/issue-109.test.mjs`:

- At Vey (the #94 scene), the v2 tool lists both topics with their labels and
  offered approaches, and the approach enum is `ask`, `persuade`.
- At the opening and at Vey, every talk button is a call the v2 tool offers,
  and its label and approach are listed together.
- `offeredTalkApproaches` covers claim, correction, plain, check and
  persuade-reply topics.
- Single-slot Hollow Beacon v11 keeps the generic four-approach tool.
- The Vey plate-proof click commits through `runDmTurn`, and the request the
  model received carried the v2 description.
- A character AI trace replays under v1 and v2; an unknown tool version is
  rejected.

## Live check

Budget agreed before the run: at most 20 provider calls. Ran
`scripts/qualify-talk-live.mjs`. It plays the #94 journey to Vey offline with
the scripted journey interpreter, reaching Beacon Tower at position 18, where
#94 stalled, with no provider calls. It then runs each click once on its own
copy of that library, through the shipped HTTP server and save authority.
Used: **14 calls, 21,156 input and 1,229 output tokens**, `gpt-5.6-luna`
requested and reported on every call. Full record:
[`issue-109-live.json`](issue-109-live.json).

| Click                                                    | Trials | Committed first time | Clarifications |
| -------------------------------------------------------- | ------ | -------------------- | -------------- |
| Ask Vey about “Present the work order and setting plate” | 5      | 5                    | 0              |
| Ask Vey about “Ask Vey to stand down”                    | 1      | 1                    | 0              |
| Persuade Vey to discuss “Ask Vey to stand down”          | 1      | 1                    | 0              |

Every trial selected exactly the clicked `talk` call and showed one
**Resolved action** card. The NPC replies were Vey's authored lines. Turn
latency was 4.1–4.9 s.

### Limits

The #94 failure was intermittent: one stall in two tries. Five plate-proof
successes in a row is good evidence, but it cannot prove that a clarification
will never happen. Typed requests still go through the model's own reading;
this run checked clicks only.
