import { spawnSync } from "node:child_process";
import path from "node:path";

const USAGE = "Usage: npm run smoke:ai -- --model <model-id>";

function readModel(args) {
  if (
    args.length === 2 &&
    args[0] === "--model" &&
    args[1] !== undefined &&
    args[1].length > 0 &&
    !args[1].startsWith("--")
  ) {
    return args[1];
  }
  if (
    args.length === 1 &&
    args[0]?.startsWith("--model=") === true &&
    args[0].slice("--model=".length).length > 0
  ) {
    return args[0].slice("--model=".length);
  }
  throw new Error(USAGE);
}

let model;
try {
  model = readModel(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : USAGE}\n`);
  process.exit(2);
}

if (
  process.exitCode === undefined &&
  (process.env.OPENAI_API_KEY === undefined ||
    process.env.OPENAI_API_KEY.trim().length === 0)
) {
  process.stderr.write(
    "OPENAI_API_KEY is required for the live AI smoke test.\n",
  );
  process.exit(2);
}

if (process.exitCode === undefined) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "dist", "cli.js"),
      "--ai",
      "--model",
      model,
      "--seed",
      "0",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
      input: "What can I see?\nquit\n",
      timeout: 45_000,
    },
  );
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error !== undefined) {
    process.stderr.write("Live AI smoke test could not start the game.\n");
    process.exit(1);
  } else if (result.status !== 0) {
    process.exit(result.status ?? 1);
  } else if (
    /I couldn't complete that request safely|No further action was executed/u.test(
      result.stdout ?? "",
    )
  ) {
    process.stderr.write(
      "Live AI smoke test did not receive a usable response.\n",
    );
    process.exit(1);
  }
}
