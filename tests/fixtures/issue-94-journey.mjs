// Issue #94 full Hollow Beacon character journey (seed 0; v13 Examine since #110),
// scripted browser test and the opt-in live runner. Each step is what a player
// does in the browser: a typed ordinary-language message or a contextual click
// on an offered option, with the one engine call it must commit (or none).
export const JOURNEY_SEED = 0;

const call = (name, args) => ({ name, arguments: args });

/** Steps in play order. `restartAfter` marks the process-restart checkpoint. */
export const journey = [
  {
    id: "iona",
    say: "Captain, what's wrong with the beacon, and where should I start looking?",
    call: call("talk", {
      speakerId: "iona",
      topicId: "brief",
      approach: "ask",
    }),
  },
  {
    id: "sheet-check",
    click: "Try the wisdom check at beacon lamp",
    call: call("check_ability", { checkId: "read-beacon" }),
  },
  {
    id: "loft",
    say: "Head up to the watch loft.",
    call: call("move", { destinationId: "watch-loft" }),
  },
  {
    id: "records",
    say: "Go through to the signal records room next door.",
    call: call("move", { destinationId: "signal-records" }),
  },
  {
    id: "plate",
    say: "Look the setting plate over carefully.",
    call: call("examine", { target: "setting-plate" }),
  },
  {
    id: "component",
    say: "Grab the spare component off the plate.",
    call: call("take", { item_id: "signal-component" }),
  },
  {
    id: "back-to-loft",
    say: "Back out to the loft.",
    call: call("move", { destinationId: "watch-loft" }),
  },
  {
    id: "yard",
    say: "Return to the watch yard.",
    call: call("move", { destinationId: "watch-yard" }),
    restartAfter: true,
  },
  {
    id: "ridge",
    say: "Take the ridge trail toward the tower.",
    call: call("move", { destinationId: "ridge-trail" }),
  },
  {
    id: "fight",
    say: "Swing my longsword at the raider!",
    call: call("attack", { opponent_id: "ridge-raider" }),
    untilCombatEnds: true,
  },
  {
    id: "shelter",
    say: "Make my way to the ridge shelter.",
    call: call("move", { destinationId: "ridge-shelter" }),
  },
  {
    id: "dressing",
    click: "Recover at camp dressing station",
    call: call("recover", { target: "dressing-station" }),
  },
  {
    id: "avoid-sentry",
    say: "Avoid the sentry: slip around by the drainage walk instead.",
    call: call("move", { destinationId: "drainage-walk" }),
  },
  {
    id: "tower",
    say: "Climb into the beacon tower.",
    call: call("move", { destinationId: "beacon-tower" }),
  },
  {
    id: "work-order",
    say: "Read through the tower work order.",
    call: call("examine", { target: "tower-work-order" }),
  },
  {
    id: "vey",
    click: 'Ask Vey about "Present the work order and setting plate".',
    say: "I show Vey the signed work order and the setting plate as proof.",
    call: call("talk", {
      speakerId: "vey",
      topicId: "plate-proof",
      approach: "ask",
    }),
  },
  {
    id: "fit",
    say: "Fit the spare component into the beacon socket.",
    call: call("place_item", {
      item_id: "signal-component",
      target: "beacon-socket",
    }),
  },
  {
    id: "board",
    say: "Study the final warning board.",
    call: call("examine", { target: "final-warning-board" }),
  },
  {
    id: "ambiguous-ending",
    say: "Warn them.",
  },
  {
    id: "ending",
    click: "Resolve Verified safe signal",
    call: call("resolve_quest", { resolutionId: "verified-safe-signal" }),
  },
];

/** Repeated combat phrasing; the live runner and scripted model accept each. */
export const combatPhrases = [
  "Swing my longsword at the raider!",
  "Attack the raider again.",
  "Keep pressing the raider with my sword.",
  "Strike at the raider once more.",
  "Hit the raider again.",
  "Another blow at the raider.",
];

/** True when an offered browser action performs the expected call. */
export function sameCall(action, expected) {
  return (
    action.call.name === expected.name &&
    JSON.stringify(JSON.parse(action.call.argumentsJson)) ===
      JSON.stringify(expected.arguments)
  );
}

/**
 * Scripted interpreter: maps this journey's ordinary phrasing (and the exact
 * clicked option messages) to the expected call. Anything else, including the
 * ambiguous "Warn them.", receives a clarification and commits nothing.
 */
export function interpretJourneyMessage(message, offered) {
  const step = journey.find(({ say }) => say === message);
  if (step?.call !== undefined) {
    return step.call;
  }
  if (combatPhrases.includes(message)) {
    return call("attack", { opponent_id: "ridge-raider" });
  }
  const clicked = offered.find((action) => action.message === message);
  return clicked === undefined
    ? undefined
    : {
        name: clicked.call.name,
        arguments: JSON.parse(clicked.call.argumentsJson),
      };
}
