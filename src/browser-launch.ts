import { spawn } from "node:child_process";

export async function openPlayerBrowser(url: string): Promise<void> {
  const [command, args] =
    process.platform === "win32"
      ? ["cmd.exe", ["/d", "/s", "/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Browser launcher timed out."));
    }, 5000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error("Browser launcher failed."));
      }
    });
  });
}

export async function announceBrowser(
  url: string,
  write: (message: string) => void,
  open: (url: string) => Promise<void> = openPlayerBrowser,
): Promise<void> {
  write(
    `Hollow Beacon: ${url}\nKeep this launcher running. Press Ctrl+C to stop; your save slot remains available.\n`,
  );
  try {
    await open(url);
  } catch {
    write(
      `Could not open the browser automatically. Open ${url} in your desktop browser.\n`,
    );
  }
}
