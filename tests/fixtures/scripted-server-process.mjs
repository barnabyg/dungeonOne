// Starts tests/fixtures/issue-93-server.mjs (the shipped browser server with a
// scripted provider) in its own process. stop() kills it without cleanup, as
// an abrupt Ctrl+C would; calls() counts provider calls in that process.
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("./issue-93-server.mjs", import.meta.url));

export async function launchScriptedServer({ savePath, seed, libraryPath }) {
  const child = fork(SERVER, [savePath, String(seed), libraryPath], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const url = await new Promise((resolve, reject) => {
    child.once("message", (message) => resolve(message.url));
    child.once("exit", () => reject(new Error(output)));
  });
  return {
    url,
    calls: () => output.split("provider-call\n").length - 1,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      const exited = new Promise((resolve) => {
        child.once("exit", resolve);
      });
      child.kill();
      await exited;
    },
  };
}
