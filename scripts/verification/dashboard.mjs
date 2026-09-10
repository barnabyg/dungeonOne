import { createServer } from "node:http";

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dungeon One verification</title>
  <style>
    :root { color-scheme: dark; font-family: ui-monospace, monospace; }
    body { max-width: 70rem; margin: 3rem auto; padding: 0 1.5rem; background: #101418; color: #e6edf3; }
    h1 { color: #d2a85a; } .ok { color: #72d572; } .failed { color: #ff7b72; }
    section { padding: 1rem; margin: 1rem 0; border: 1px solid #30363d; border-radius: .5rem; }
    pre { white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>Dungeon One verification</h1>
  <section><div id="summary">Connecting…</div></section>
  <section><strong>Test progress</strong><div id="progress">Not available</div></section>
  <section><strong>Failures</strong><pre id="failures">None</pre></section>
  <section><strong>Recent output</strong><pre id="output"></pre></section>
  <script>
    const render = async () => {
      try {
        const state = await fetch('/api/state', { cache: 'no-store' }).then(r => r.json());
        const resultClass = state.result === 'failed' ? 'failed' : state.result === 'passed' ? 'ok' : '';
        document.querySelector('#summary').innerHTML =
          'Stage: <strong>' + escapeHtml(state.activeStage || 'starting') + '</strong> · ' +
          'Elapsed: ' + (state.elapsedMs / 1000).toFixed(1) + 's · ' +
          'Result: <strong class="' + resultClass + '">' + escapeHtml(state.result) + '</strong>';
        document.querySelector('#progress').textContent = state.testProgress
          ? state.testProgress.total === null
            ? state.testProgress.completed + ' completed'
            : state.testProgress.completed + ' / ' + state.testProgress.total
          : 'Not available for this stage';
        document.querySelector('#failures').textContent = state.failures.join('\n') || 'None';
        document.querySelector('#output').textContent = state.recentOutput.join('\n');
      } catch { document.querySelector('#summary').textContent = 'Dashboard connection lost; see terminal output.'; }
    };
    const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    render(); setInterval(render, 500);
  </script>
</body>
</html>`;

function send(response, status, contentType, body) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": contentType,
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

export async function startDashboard(options = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const clock = options.clock ?? Date.now;
  const notifyError = (error) => {
    try {
      options.onError?.(error);
    } catch {
      // Observability must never affect verification.
    }
  };
  const startedAt = clock();
  const state = {
    activeStage: null,
    failures: [],
    recentOutput: [],
    result: "running",
    testProgress: null,
  };
  let finalObserved = false;
  let resolveFinalObservation;
  const finalObservation = new Promise((resolve) => {
    resolveFinalObservation = resolve;
  });

  const server = (options.serverFactory ?? createServer)(
    (request, response) => {
      try {
        if (request.url === "/health") {
          send(response, 200, "text/plain; charset=utf-8", "ok\n");
          return;
        }

        if (request.url === "/api/state") {
          send(
            response,
            200,
            "application/json; charset=utf-8",
            JSON.stringify({
              ...state,
              elapsedMs: Math.max(0, clock() - startedAt),
            }),
          );
          if (state.result !== "running" && !finalObserved) {
            finalObserved = true;
            resolveFinalObservation();
          }
          return;
        }

        if (request.url === "/") {
          send(response, 200, "text/html; charset=utf-8", PAGE);
          return;
        }

        send(response, 404, "text/plain; charset=utf-8", "Not found\n");
      } catch (error) {
        notifyError(error);
        if (response.headersSent) {
          response.destroy();
        } else {
          send(
            response,
            500,
            "text/plain; charset=utf-8",
            "Dashboard unavailable\n",
          );
        }
      }
    },
  );

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      server.on("error", notifyError);
      resolve();
    });
  });
  server.unref();

  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Dashboard did not receive a TCP address");
  }

  return {
    url: `http://${host}:${address.port}`,
    setStage(name, testProgress = null) {
      state.activeStage = name;
      state.testProgress = testProgress;
    },
    appendOutput(line) {
      state.recentOutput.push(line);
      state.recentOutput.splice(0, Math.max(0, state.recentOutput.length - 50));
    },
    fail(message) {
      state.failures.push(message);
    },
    finish(result) {
      state.result = result;
      state.activeStage = null;
      state.testProgress = null;
    },
    async waitForFinalObservation(timeoutMs = 1_500) {
      if (finalObserved) {
        return true;
      }

      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), timeoutMs);
        finalObservation.then(() => {
          clearTimeout(timeout);
          resolve(true);
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
