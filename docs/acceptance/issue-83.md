# Issue 83: Find a conversation from a person's name

## Player route

Prerequisite: Node.js 24 and `npm.cmd ci` in this checkout. Build once with
`npm.cmd run build`, then start a fresh session from the repository root:

```powershell
npm.cmd start -- --adventure-file .\adventures\hollow-beacon-conversations.json --seed 0 --save .\beacon-conversation-save.json
```

Type these commands at separate `>` prompts:

1. `talk to Captain Iona` — Iona's current subjects appear with complete `talk iona ... ask` commands. No day passes and she has not spoken yet.
2. `talk iona brief ask` — Iona names the approaching caravan, suggests asking Sera at the camp or inspecting Keeper's Path, and does not claim to know Sera's account.
3. `move refugee-camp` — Sera is visible. This local walk costs zero days.
4. `talk Sera` — the current `keeper-warning` subject and `talk sera keeper-warning ask` command appear.
5. `talk sera keeper-warning ask` — Sera attributes the warning to the missing keeper and says she saw no tampering. The journal gains her testimony and a lead to Iona.
6. `move watch-yard`, then `talk Captain Iona` — the `relay-warning` subject is now available.
7. `talk iona relay-warning ask`, then `talk iona brief ask` — Iona posts a yellow flag and sends runners; on revisit she remembers the caution without claiming Sera's unreported details. The clock remains at Day 0.

To check restart, wait for the next `>` prompt after the final action, press
Ctrl+C, then run:

```powershell
npm.cmd start -- --resume .\beacon-conversation-save.json
```

`talk iona response ask` should still describe the posted caution. `quit`
closes the saved session, so use Ctrl+C for the restart check.

## Unfamiliar reviewer feedback

On 30 September 2026, a read-only AI reviewer opened the command-mode journey
before reading the source, tests, or this handoff. From `People: Captain Iona`
and the opening `Try:` line, it typed `talk iona`, then `talk iona brief`, and
copied the offered `talk iona brief ask`. The answer gave Iona's lead while the
clock stayed at Day 0. The reviewer did not need an explanation of the full
person/topic/approach syntax. It found the prior menu's "No conversation was
recorded" wording mechanical. The menu now says that the named person can
discuss the listed subjects and asks the player to choose a command. The
reviewer also noticed Iona's first reply attributed the refugees' fear despite
her knowledge limit; content version 3 removes that claim while retaining the
lead to Sera. The reviewer was an AI reader of the CLI, not a human player or
a live model quality test.

## Automated coverage

`tests/issue-83.test.mjs` checks named and `talk to` menus, copyable commands,
no menu time or die cost, no false conversation, changing topics after Sera's
lead, Iona's remembered caution, speaker-scoped recorded facts, a truthful
empty-topic response, natural-language scripted AI tool routing, and an
authoritative reply plus resumable save after reply-provider failure. Scripted
AI demonstrates orchestration; it does not establish how reliably a live model
chooses the intended subject from varied player language.
