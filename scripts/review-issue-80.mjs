import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { createOpenAiDmModel } from "../dist/openai-dm-model.js";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required");
}

const modelId = process.argv[2] ?? "gpt-5.6-luna";
const cases = [
  [
    "barricade-1",
    "bribed-crossroads",
    ["move square"],
    "Use that loose market cart to block the short passage to the hall.",
    "adjudicate",
  ],
  [
    "barricade-2",
    "bribed-crossroads",
    ["move square"],
    "Can you shove the market cart across the short passage? Do it.",
    "adjudicate",
  ],
  [
    "barricade-3",
    "bribed-crossroads",
    ["move square"],
    "Brace the square's short passage with the market cart.",
    "adjudicate",
  ],
  [
    "distraction-1",
    "bribed-crossroads",
    ["move cellar"],
    "Bang on the heavy crate so the guard looks away.",
    "distract",
  ],
  [
    "distraction-2",
    "bribed-crossroads",
    ["move cellar"],
    "Draw the cellar guard away by rattling the heavy crate.",
    "distract",
  ],
  [
    "distraction-3",
    "bribed-crossroads",
    ["move cellar"],
    "I want to make a racket with the heavy crate to distract the guard.",
    "distract",
  ],
  [
    "deception-1",
    "bribed-crossroads",
    [],
    "Convince Lysa that Neri made it to the safe route, even though that is false.",
    "deceive",
  ],
  [
    "deception-2",
    "bribed-crossroads",
    [],
    "Lie to Lysa and say Neri reached safety.",
    "deceive",
  ],
  [
    "deception-3",
    "bribed-crossroads",
    [],
    "Tell Lysa the untrue story that Neri is safe.",
    "deceive",
  ],
  [
    "offer-1",
    "bribed-crossroads",
    ["move cellar", "take tonic"],
    "Give my restorative tonic to the cellar guard as an offer.",
    "offer",
  ],
  [
    "offer-2",
    "bribed-crossroads",
    ["move cellar", "take tonic"],
    "Hand the tonic over to the guard in exchange for goodwill.",
    "offer",
  ],
  [
    "offer-3",
    "bribed-crossroads",
    ["move cellar", "take tonic"],
    "Offer the guard my sealed tonic.",
    "offer",
  ],
  [
    "follow-1",
    "day-raider-crossroads",
    ["move square", "move cellar", "wait days 1"],
    "Follow the guard's fresh trail into the square.",
    "follow",
  ],
  [
    "follow-2",
    "day-raider-crossroads",
    ["move square", "move cellar", "wait days 1"],
    "Go after the cellar guard while the trail is fresh.",
    "follow",
  ],
  [
    "follow-3",
    "day-raider-crossroads",
    ["move square", "move cellar", "wait days 1"],
    "Pursue the guard through that adjacent exit.",
    "follow",
  ],
  ["burn-stone", "bribed-crossroads", [], "Set the stone hall on fire.", null],
  [
    "ambiguous",
    "bribed-crossroads",
    ["move square"],
    "Maybe block one of the ways out somehow?",
    null,
  ],
  [
    "compound",
    "bribed-crossroads",
    ["move cellar"],
    "Distract the guard with the heavy crate and then stab him.",
    null,
  ],
  [
    "absent",
    "bribed-crossroads",
    [],
    "Offer the guard my tonic here at the hall.",
    null,
  ],
  [
    "hidden",
    "bribed-crossroads",
    [],
    "Follow Neri from here, although I cannot see them.",
    null,
  ],
];

const report = { issue: 80, requestedModel: modelId, cases: [] };
for (const [id, file, setup, input, expectedTool] of cases) {
  const bytes = await readFile(
    new URL(`../adventures/${file}.json`, import.meta.url),
  );
  const loaded = loadAdventure(bytes.toString("utf8"));
  if (!loaded.ok) {
    throw new Error(`${id}: ${JSON.stringify(loaded.diagnostics)}`);
  }
  const runtime = createDataRuntime(loaded.adventure);
  let state = runtime.createSession();
  for (const command of setup) {
    const result = runtime.handleAction(state, runtime.parseCommand(command), {
      roll: () => 20,
    });
    if (result.rejection) {
      throw new Error(`${id}: ${runtime.renderResult(result)}`);
    }
    state = result.state;
  }
  const live = createOpenAiDmModel({
    apiKey: process.env.OPENAI_API_KEY,
    model: modelId,
  });
  const providers = [];
  const turn = await runDmTurn({
    runtime,
    state,
    playerInput: input,
    transcript: [],
    random: { roll: () => 20 },
    model: {
      identity: live.identity,
      async respond(request) {
        const response = await live.respond(request);
        providers.push(response.provider ?? null);
        return response;
      },
    },
  });
  const changed = JSON.stringify(turn.state) !== JSON.stringify(state);
  const calls = turn.toolAttempts.map(({ call, disposition }) => ({
    name: call.name,
    argumentsJson: call.argumentsJson,
    disposition,
  }));
  const selectedTool =
    calls.find(
      ({ name }) =>
        !["inspect", "look", "journal", "inventory", "help"].includes(name),
    )?.name ?? null;
  const authorizedCommit = turn.toolResults.some(
    ({ call, result }) =>
      call.name === expectedTool && result.modelOutput.ok === true,
  );
  const category = id.replace(/-\d+$/u, "");
  report.cases.push({
    id,
    category,
    file,
    setup,
    input,
    expectedTool,
    selectedTool,
    selectionCorrect: expectedTool === selectedTool,
    changed,
    unauthorizedMutation: changed && !authorizedCommit,
    falseClaimReview: null,
    calls,
    mechanics: turn.mechanics,
    narration: turn.narration,
    diagnostics: turn.diagnostics,
    providers,
    identity: {
      contentSha256: createHash("sha256").update(bytes).digest("hex"),
      rules: runtime.rulesVersion,
      engine: runtime.engineVersion,
      prompt: runtime.promptVersion,
      tools: runtime.toolSchemaVersion,
    },
    beforeSha256: createHash("sha256")
      .update(JSON.stringify(state))
      .digest("hex"),
    afterSha256: createHash("sha256")
      .update(JSON.stringify(turn.state))
      .digest("hex"),
  });
  process.stdout.write(
    `${id}: ${report.cases.at(-1).selectedTool ?? "none"}, ${changed ? "changed" : "unchanged"}\n`,
  );
}
report.summary = {
  coherentSelections: report.cases.filter(
    ({ selectionCorrect }) => selectionCorrect,
  ).length,
  unauthorizedMutations: report.cases.filter(({ unauthorizedMutation }) =>
    Boolean(unauthorizedMutation),
  ).length,
  missesByCategory: Object.fromEntries(
    [...new Set(report.cases.map(({ category }) => category))].map(
      (category) => [
        category,
        report.cases.filter(
          (sample) => sample.category === category && !sample.selectionCorrect,
        ).length,
      ],
    ),
  ),
  narrationReviewComplete: false,
};
await writeFile(
  new URL("../docs/acceptance/issue-80-live.json", import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`,
);
