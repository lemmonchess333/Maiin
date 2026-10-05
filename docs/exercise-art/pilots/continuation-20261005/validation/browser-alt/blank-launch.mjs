import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import chromiumPackage from "@sparticuz/chromium";

const root = "/workspace/scratch/a307ac8d62f0/verification/browser-alt";
const requireRepo = createRequire(
  "/workspace/scratch/a307ac8d62f0/Maiin/package.json"
);
const { chromium } = requireRepo("playwright-core");
const hash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
for (const dir of ["tmp", "cache", "results"])
  mkdirSync(`${root}/${dir}`, { recursive: true });
const result = {
  package: "@sparticuz/chromium",
  packageVersion: "148.0.0",
  playwrightVersion: requireRepo("playwright-core/package.json").version,
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  args: [],
  launchMethod:
    "Normal package executablePath extraction; Playwright defaults plus alternate executablePath only.",
  recommendedPackageArgsUsed: false,
  note: "The package recommended args include disabling web security; those args are not applied. The intended blank launch uses Playwright defaults with only the executable changed; extraction may fail before any launch is attempted.",
  originalConfigSha256: hash(
    "/workspace/scratch/a307ac8d62f0/Maiin/playwright.form-art.config.ts"
  ),
  testSha256: hash(
    "/workspace/scratch/a307ac8d62f0/Maiin/e2e/form-art-review.pw.ts"
  ),
};
let browser;
try {
  result.executablePath = await chromiumPackage.executablePath();
  result.executableSha256 = hash(result.executablePath);
  browser = await chromium.launch({
    executablePath: result.executablePath,
    args: result.args,
    timeout: 30000,
  });
  result.browserVersion = browser.version();
  const page = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 1,
  });
  await page.goto("about:blank");
  result.url = page.url();
  result.viewport = page.viewportSize();
  result.status = "blank-launch-passed";
  await browser.close();
} catch (error) {
  result.status = "blank-launch-failed-stop";
  result.error = String(error);
  if (browser) await browser.close().catch(() => {});
  process.exitCode = 1;
}
writeFileSync(`${root}/launch.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
