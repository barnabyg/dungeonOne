// Runs the shipped browser launcher with its real arguments, server and
// library. Only the desktop-browser opener is replaced so tests never open a
// window; the printed URL and Ctrl+C contract are unchanged.
import { EventEmitter } from "node:events";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

childProcess.spawn = () => {
  const child = new EventEmitter();
  child.kill = () => true;
  setImmediate(() => child.emit("close", 0));
  return child;
};
syncBuiltinESMExports();
await import("../../dist/browser-cli.js");
