> Readable derived view. The original captured bytes are preserved in `browser-blocker.md.txt`, whose hash remains in `preserved-evidence.json`. This view also records the later alternate-executable attempt.

# Bulgarian Split Squat mobile-player environment blocker

Observed on 2026-10-05 in `/workspace/scratch/a307ac8d62f0/Maiin`, branch `codex/continue-exercise-art-oct05`.

## Result

The actual artwork player checks could not start because no compatible Chromium executable is available. The initial probe failed before creating a page. The three Bulgarian mobile tests remain **not run**. No screenshot, GIF, native-image inspection, test discovery result, or structural audit is counted as player evidence.

The source selection was still provisional during this setup work. No artwork target test was run against those provisional frames. Full final `npm run verify` remains a separate gate to run after the final selection is confirmed; its earlier clean baseline passed.

## Environment and unchanged test contract

- Ubuntu 24.04.3 LTS, x86_64.
- Node `v24.19.0`; npm `11.9.0`.
- Repository `@playwright/test`, `playwright`, and `playwright-core`: `1.60.0`.
- Default required browser: Chrome for Testing / Chromium revision `1223`, version `148.0.7778.96`.
- Expected full executable: `/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`.
- Expected default headless executable: `/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell`.
- Both executables are absent. Browser-path environment hints are unset.
- `playwright.form-art.config.ts` retains Chromium, a 393 × 852 viewport, device scale factor 1, one worker, zero retries, and the existing fixture server on `http://127.0.0.1:4176`.
- The artwork config has no `PW_CHROMIUM` executable override and has not been changed.

## Attempts and exact observed errors

| Attempt                                                                                           | Result                                                                         | Duration | Evidence                                                                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------- |
| Default Chromium launch, intended blank context only                                              | Exit 1 before a page was created; headless-shell executable does not exist     | 0.64 s   | `playwright-environment.log.txt`, `playwright-environment-result.json`                       |
| `npx playwright install chromium`                                                                 | Exit 1 after the downloader's five builtin attempts; archive validation failed | 71.19 s  | `playwright-install-chromium.log.txt`, `playwright-install-chromium-result.json`             |
| `npx playwright install chromium --only-shell`                                                    | Exit 1 after the downloader's five builtin attempts; archive validation failed | 58.79 s  | `playwright-install-headless-shell.log.txt`, `playwright-install-headless-shell-result.json` |
| `apt-get update -o Acquire::Retries=0 -o Acquire::http::Timeout=10 -o Acquire::https::Timeout=10` | Exit 100; APT identity transitions fail, followed by HTTPS subprocess exit 112 | 0.12 s   | `browser-fallback-apt-update.log.txt`, `browser-fallback-apt-update-result.json`             |

Both standard browser installers displayed `100% of 0 MiB`, then reported:

```text
End of central directory record signature not found. Either not a zip file, or file is truncated.
```

The full and headless-shell archive URLs were respectively:

```text
https://cdn.playwright.dev/builds/cft/148.0.7778.96/linux64/chrome-linux64.zip
https://cdn.playwright.dev/builds/cft/148.0.7778.96/linux64/chrome-headless-shell-linux64.zip
```

The package-index attempt reported:

```text
E: setgroups 65534 failed - setgroups (1: Operation not permitted)
E: setegid 65534 failed - setegid (22: Invalid argument)
E: seteuid 42 failed - seteuid (22: Invalid argument)
E: Method https has died unexpectedly!
E: Sub-process https returned an error code (112)
```

These are observed runtime errors. No automatic approval-review rejection was received, and the precise upstream cause of the invalid browser archives has not been established.

## Local fallback discovery

The normal system paths, browser caches, runtime-owned directories, hidden and ignored files, symlinks, compressed payload candidates, npm cache, installed system packages, and browser-related environment hints yielded no usable browser executable or bundled payload. No exposed dedicated browser-download tool was found. No remote browser session was initialized or probed.

`/opt/codex/runtimes/codex-primary-runtime` supplies `playwright-core` 1.62.1 metadata for Chromium revision 1234, but supplies no browser payload. That metadata does not satisfy the repository's browser requirement. The npm cache contains Playwright JavaScript packages and the `electron-to-chromium` version map, not a Chromium binary.

APT currently has zero package-index files. Read-only `apt-get --simulate install` attempts for `chromium`, `chromium-browser`, and `google-chrome-stable` each report that the package cannot be located. The configured repository host is `snapshot.ubuntu.com`. The one bounded normal index update failed as recorded above; package availability therefore could not be established from a usable index.

The repository's installed Playwright source supports the normal `chrome` channel and `/opt/google/chrome/chrome`. Its packaged `bin/reinstall_chrome_stable_linux.sh` first runs `apt-get update`, then downloads and installs Google's stable DEB using APT. The observed APT failure blocks that supported installer route here. The installer was inspected, not executed after that failure.

Switching to Chrome, if it becomes normally available, requires a deliberate `channel: "chrome"` configuration override: Playwright 1.60.0 has no `playwright test --channel` switch, and the artwork config does not select this channel. Such a run must retain every existing assertion and record its exact browser version and configuration. An arbitrary executable is not guaranteed to behave like the bundled browser.

## Supported continuation

1. Prefer a successful normal installation of the repository-pinned browser in an environment where its archive can be delivered correctly.
2. A compatible browser executable supplied through an authorized supported environment may be used with an explicit, reviewed environment configuration. Do not disguise a different browser/version as the expected cache payload.
3. The unchanged suite can run in the project's browser-equipped development or CI environment. No remote execution or push has been requested from this setup task.

Do not repeat the two identical archive routes until there is evidence that delivery has changed. Do not disable APT sandbox/identity handling, use an unapproved mirror or proxy, modify access controls, weaken test assertions, or convert missing evidence into approval.

After final frames, cues, plan hashes, and endpoint pins are refreshed, execute:

```bash
cd /workspace/scratch/a307ac8d62f0/Maiin
npx playwright test --config playwright.form-art.config.ts e2e/form-art-review.pw.ts --grep 'bulgarian-split:'
```

This must execute the three existing checks: six-frame player/real 6→1 loop in dark mode, the same in light mode, and reduced-motion/manual stepping. Inspect the resulting mobile images and interaction evidence. A passing command alone does not establish visual anatomy, contact, or equipment approval.

The local raw log captures named above are preserved beside this readable view as `.log.txt` files. Original scratch paths remain unchanged in the raw browser-blocker capture and execution metadata.

## Later bounded alternate-executable attempt

After the original capture, normal npm installation of `@sparticuz/chromium@148.0.0` succeeded in the separate temporary `verification/browser-alt` directory (18 packages, 45 seconds, install scripts disabled). This was a separately compiled alternative headless-shell package, not the default revision-1223 browser. Repository source, Playwright configuration and assertions remained unchanged.

The package's documented `executablePath()` extraction failed before browser startup:

```text
Error: EINVAL: invalid argument, chown '/workspace/scratch/a307ac8d62f0/verification/browser-alt/tmp/fonts'
```

No browser, page or test ran. The attempt stopped at that error without manual extraction, access-control changes or additional launch flags. All three mobile checks remain **not run**. The small exact attempt records are retained under `browser-alt/README.md`, `browser-alt/launch.json` and `browser-alt/blank-launch.mjs`; no package cache, temporary extraction directory or browser binary is included in this checkpoint.
