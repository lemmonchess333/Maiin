# Alternate Chromium: one bounded provisioning attempt

**Status: provisioning blocked before browser launch. No Playwright assertions ran.**

The root agent authorized one attempt to use the normal
`@sparticuz/chromium@148.0.0` npm package as an alternate executable for the
unchanged three Bulgarian split-squat Playwright checks. All temporary files,
dependencies, caches and attempted extraction paths are under this directory.
The repository's source, tests, manifests, package files and configs were not
changed.

## Primary package evidence read locally

- `node_modules/@sparticuz/chromium/package.json`: exact package version
  `148.0.0`; normal package includes `bin/chromium.br`, fonts and SwiftShader.
- `node_modules/@sparticuz/chromium/README.md`, Usage with Playwright: supported
  entrypoint `await chromium.executablePath()` supplied to Playwright launch.
- `node_modules/@sparticuz/chromium/build/esm/index.mjs`: executablePath inflates
  Chromium, fonts and SwiftShader into `os.tmpdir()` using the bundled inflate
  implementation and normal `tar-fs` extraction. No implementation was changed.

Environment: Linux x64, Node `v24.19.0`, npm `11.9.0`, repository Playwright
`1.60.0`.

## Commands and result

Installation succeeded: 18 packages installed in 45 seconds.

```sh
npm install --prefix /workspace/scratch/a307ac8d62f0/verification/browser-alt --cache /workspace/scratch/a307ac8d62f0/verification/browser-alt/npm-cache --no-audit --no-fund --package-lock=false --ignore-scripts @sparticuz/chromium@148.0.0
```

One normal extraction/blank-launch attempt followed:

```sh
TMPDIR=/workspace/scratch/a307ac8d62f0/verification/browser-alt/tmp XDG_CACHE_HOME=/workspace/scratch/a307ac8d62f0/verification/browser-alt/cache node blank-launch.mjs
```

The package extraction failed before `chromium.launch()`:

```text
Error: EINVAL: invalid argument, chown '/workspace/scratch/a307ac8d62f0/verification/browser-alt/tmp/fonts'
```

The intended launch arguments were an empty additional-args array, retaining
Playwright's defaults. The package's broad recommended flags were not applied;
in particular, no web-security-disabling flag was introduced. No browser
version could be obtained because no browser started.

The root instruction required stopping on another provisioning or access
block. Accordingly, there was no manual extraction, ownership workaround,
additional launch attempt, browser config override or test run. The default
bundled Chromium was not made operational by this attempt, and this evidence
must not be described as a rendering or assertion failure.

`launch.json` records the exact error, tool versions, intended arguments and
hashes of the unchanged original form-art config and review test file. The
original config was inspected: it specifies 393 x 852 viewport, one worker,
zero retries and the local fixture server. No settings or assertions were
weakened.
