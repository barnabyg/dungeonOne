// Runs the shipped browser launcher (`npm.cmd run browser`) as a player
// would, through quiet-launcher.mjs so no desktop window opens. Resolves
// once it prints its URL; `stop` presses Ctrl+C and waits for it to exit.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const launcher = fileURLToPath(
  new URL("./quiet-launcher.mjs", import.meta.url),
);

/**
 * Starts the launcher in `cwd` with `args` and no OpenAI key unless `apiKey`
 * is given. Resolves to its URL, everything it has printed so far, and stop.
 */
export async function launchDefault(cwd, args, apiKey = "") {
  const child = spawn(process.execPath, [launcher, ...args], {
    cwd,
    env: { ...process.env, OPENAI_API_KEY: apiKey },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  const exited = new Promise((resolve) => {
    child.once("exit", resolve);
  });
  // Startup reads the gate's recorded verdicts on the built-in modules
  // (src/gate-verdicts-5e.ts); a module changed since they were recorded is
  // gated afresh, which takes far longer under the full parallel suite.
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`No URL within 150 s:\n${output}`));
    }, 150000);
    child.once("exit", () => clearTimeout(timer));
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = /Dungeon One: (http:\/\/127\.0\.0\.1:\d+)\n/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.once("exit", () => reject(new Error(output)));
  });
  return {
    url,
    output: () => output,
    async stop() {
      if (child.exitCode === null) {
        child.kill("SIGINT");
      }
      await exited;
    },
  };
}
