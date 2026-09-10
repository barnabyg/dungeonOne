export type SessionState = Readonly<{
  location: "entrance";
  status: "playing" | "quit";
}>;

export type Action = Readonly<
  | { type: "help" }
  | { type: "quit" }
  | { type: "empty" }
  | { type: "unknown"; input: string }
>;

export type Response =
  | Readonly<{ type: "help"; commands: readonly string[] }>
  | Readonly<{ type: "quit" }>
  | Readonly<{ type: "rejected"; reason: "empty" | "unknown"; input?: string }>;

export type ActionResult = Readonly<{
  state: SessionState;
  response: Response;
}>;

const COMMANDS = ["help", "quit"] as const;

export function createSession(): SessionState {
  return { location: "entrance", status: "playing" };
}

export function handleAction(
  state: SessionState,
  action: Action,
): ActionResult {
  if (action.type === "help") {
    return {
      state,
      response: { type: "help", commands: COMMANDS },
    };
  }

  if (action.type === "empty") {
    return {
      state,
      response: { type: "rejected", reason: "empty" },
    };
  }

  if (action.type === "unknown") {
    return {
      state,
      response: { type: "rejected", reason: "unknown", input: action.input },
    };
  }

  if (action.type === "quit") {
    return {
      state: { ...state, status: "quit" },
      response: { type: "quit" },
    };
  }

  action satisfies never;
  throw new Error("Unreachable action");
}
