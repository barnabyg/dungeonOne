# Verification dashboard guidance

Interactive full verification starts the observational dashboard automatically. It binds only to `127.0.0.1` and requests port `0`, allowing the operating system to allocate a free port for concurrent-run isolation. The verifier prints the resolved `TEST_DASHBOARD_URL`.

The dashboard must expose active stage, available test progress, elapsed time, recent output, failures, and final result. It is read-only and must never control verification.

After the final result is recorded, verification waits briefly for the open dashboard to fetch it. The wait is bounded so a closed or failed browser cannot hold verification open.

Use `VERIFY_DASHBOARD=0` to opt out and `VERIFY_DASHBOARD=1` to force startup without a TTY. CI disables it. Dashboard startup, state reporting, endpoint, and browser-launch errors must degrade to terminal output without changing verification order, result, or exit status.
