/**
 * GitHub Actions supply-chain guards (security workstream, item 1f).
 *
 * Three invariants, all about who can run code with this repository's
 * tokens and signing certificates:
 *
 * 1. Every third-party Action is pinned to a full commit SHA. A floating
 *    tag (`actions/checkout@v4`) is a mutable pointer: whoever controls
 *    the tag controls the code that runs with `FIREBASE_SERVICE_ACCOUNT`
 *    and the iOS signing secrets. The trailing `# vX` comment is what
 *    lets Dependabot's `github-actions` ecosystem keep a pinned action
 *    updated, so it is required too.
 *
 * 2. `dependabot-auto-merge.yml` runs on `pull_request_target` with write
 *    permissions — the full repo token, in the context of main. That is
 *    safe ONLY because it never checks out or executes PR code: its one
 *    `run:` is `gh pr merge --auto`, and the job is gated on the actor
 *    being dependabot[bot]. One added `actions/checkout` step turns it
 *    into a token-exfiltration path for anyone who can open a PR.
 *
 * 3. `firebase-tools` is installed at one exact version. It is the CLI
 *    that deploys rules, indexes and functions with the production
 *    service account, and it is installed globally in each job rather
 *    than from package.json, so neither the lockfile nor Dependabot sees
 *    it. Unpinned, every release ran whatever npm published last, chosen
 *    the minute the job started. Bump it by changing every install line
 *    in one commit; the test below fails until they agree.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const workflowsDir = resolve(repoRoot, ".github/workflows");

const workflowFiles = readdirSync(workflowsDir)
  .filter((f) => /\.ya?ml$/.test(f))
  .sort();

interface UsesLine {
  file: string;
  line: number;
  text: string;
}

function usesLines(): UsesLine[] {
  const out: UsesLine[] = [];
  for (const file of workflowFiles) {
    const lines = readFileSync(resolve(workflowsDir, file), "utf8").split("\n");
    lines.forEach((text, i) => {
      if (/^\s*-?\s*uses:\s*\S/.test(text))
        out.push({ file, line: i + 1, text });
    });
  }
  return out;
}

/** `uses: owner/repo@<40-hex> # vTag` — third-party actions only. Local
 *  (`./path`) and docker (`docker://`) references are not pins and are
 *  left to their own review. */
const PINNED = /^\s*-?\s*uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+#\s*v\S+\s*$/;
const THIRD_PARTY = /^\s*-?\s*uses:\s*[\w.-]+\/[\w./-]+@/;

describe("GitHub Actions are pinned to commit SHAs", () => {
  it("scans a non-trivial set of workflows", () => {
    expect(workflowFiles.length).toBeGreaterThanOrEqual(10);
  });

  it("every third-party `uses:` carries a 40-hex sha and a `# v…` version comment", () => {
    const offenders = usesLines()
      .filter((u) => THIRD_PARTY.test(u.text) && !PINNED.test(u.text))
      .map((u) => `${u.file}:${u.line}  ${u.text.trim()}`);
    expect(
      offenders,
      "Unpinned or comment-less action(s). Pin with `uses: owner/repo@<commit sha> # <tag>` — resolve the tag with `git ls-remote https://github.com/<owner>/<repo> refs/tags/<tag> refs/tags/<tag>^{}`.\n  " +
        offenders.join("\n  ")
    ).toEqual([]);
  });
});

describe("firebase-tools is installed at one exact version", () => {
  const installs = workflowFiles.flatMap((file) =>
    readFileSync(resolve(workflowsDir, file), "utf8")
      .split("\n")
      .flatMap((text, i) => {
        const m = text.match(/npm install -g firebase-tools(\S*)/);
        return m ? [{ file, line: i + 1, version: m[1] }] : [];
      })
  );

  it("finds the installs: the deploys and every emulator job", () => {
    expect(installs.length).toBeGreaterThanOrEqual(8);
    expect(installs.map((i) => i.file)).toEqual(
      expect.arrayContaining([
        "deploy-firestore.yml",
        "deploy-functions.yml",
        "deploy-storage.yml",
        "emulator-tests.yml",
      ])
    );
  });

  it("every install names an exact version", () => {
    const offenders = installs
      .filter((i) => !/^@\d+\.\d+\.\d+$/.test(i.version))
      .map((i) => `${i.file}:${i.line}  firebase-tools${i.version}`);
    expect(
      offenders,
      "Install firebase-tools as `npm install -g firebase-tools@<x.y.z>`, the version every other workflow uses.\n  " +
        offenders.join("\n  ")
    ).toEqual([]);
  });

  it("every workflow installs the same version", () => {
    expect(new Set(installs.map((i) => i.version)).size).toBe(1);
  });
});

describe("dependabot-auto-merge.yml never runs PR code", () => {
  const src = readFileSync(
    resolve(workflowsDir, "dependabot-auto-merge.yml"),
    "utf8"
  );
  const lines = src.split("\n");

  it("still triggers on pull_request_target (the reason the rest of this suite exists)", () => {
    expect(src).toMatch(/^on:\s*pull_request_target\s*$/m);
  });

  it("gates the job on the actor being dependabot[bot]", () => {
    expect(src).toMatch(
      /if:\s*\$\{\{\s*github\.actor == 'dependabot\[bot\]'\s*\}\}/
    );
  });

  it("has no actions/checkout step", () => {
    const hits = lines
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => /uses:\s*actions\/checkout/.test(t))
      .map(({ i }) => i + 1);
    expect(
      hits,
      "actions/checkout in a pull_request_target workflow with write permissions executes PR-controlled code with the repo token"
    ).toEqual([]);
  });

  it("no run: step executes repository code (npm / npx / node / a script path)", () => {
    const runs = lines
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => /^\s*-?\s*run:/.test(t));
    const offenders = runs
      .filter(({ t }) =>
        /\b(npm|npx|node|yarn|pnpm|bash|sh)\b|\.\/|\bscripts\//.test(t)
      )
      .map(({ t, i }) => `${i + 1}: ${t.trim()}`);
    expect(runs.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

/* A workflow without a `permissions:` block gets the repository's default
   token, which can be read-write for everything. Four had none (the
   emulator tests, which run on pull requests, the iOS build, the race-event
   sync and the visual capture); none of them writes with the token, so
   each now asks for what it uses. A job may narrow or widen it under its
   own key; this holds the workflow to saying so at the top. */
describe("every workflow names its token's permissions", () => {
  it("has a top-level permissions block", () => {
    const missing = workflowFiles.filter(
      (file) =>
        !/^permissions:/m.test(
          readFileSync(resolve(workflowsDir, file), "utf8")
        )
    );
    expect(workflowFiles.length).toBeGreaterThan(15);
    expect(missing).toEqual([]);
  });
});

/** A workflow's jobs, each with its whole text, read from the file's own
 *  layout (two-space job keys under `jobs:`). */
function jobTexts(file: string): Map<string, string> {
  const src = readFileSync(resolve(workflowsDir, file), "utf8").replace(
    /\r\n/g,
    "\n"
  );
  const body = src.slice(src.search(/^jobs:\s*$/m));
  const jobs = new Map<string, string>();
  for (const part of body.split(/^ {2}(?=[\w-]+:\s*$)/m).slice(1)) {
    jobs.set(part.slice(0, part.indexOf(":")), part);
  }
  return jobs;
}

/** A workflow's jobs, each with its steps' text (six-space step items). */
function jobsOf(file: string): Map<string, string[]> {
  return new Map(
    [...jobTexts(file)].map(([name, text]) => [
      name,
      text.split(/^ {6}- /m).slice(1),
    ])
  );
}

/* A dependency's install scripts run with whatever is on the runner's disk.
   google-github-actions/auth writes the production service account key to
   a file; the Hosting deploy action writes it too, then runs `npx
   firebase-tools`. Every install in a deploy job comes before either. */
describe("deploy jobs install nothing once the service account key is on disk", () => {
  const deployFiles = workflowFiles.filter((f) => /^deploy-.+\.ya?ml$/.test(f));
  const KEY_ON_DISK =
    /uses:\s*(google-github-actions\/auth|FirebaseExtended\/action-hosting-deploy)@/;
  const INSTALL =
    /\b(npm (ci|install|i)|npx|yarn|pnpm|pip3? install|pod install)\b/;

  it("finds the deploy jobs that hold the key", () => {
    const holding = deployFiles.flatMap((file) =>
      [...jobsOf(file)].filter(([, steps]) =>
        steps.some((s) => KEY_ON_DISK.test(s))
      )
    );
    expect(holding.length).toBeGreaterThanOrEqual(4);
  });

  it("runs every install before the key is written", () => {
    const offenders: string[] = [];
    for (const file of deployFiles) {
      for (const [job, steps] of jobsOf(file)) {
        const keyed = steps.findIndex((s) => KEY_ON_DISK.test(s));
        if (keyed < 0) continue;
        steps.slice(keyed + 1).forEach((step) => {
          if (INSTALL.test(step))
            offenders.push(`${file} ${job}: ${step.split("\n")[0]}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("gives the Hosting action a CLI it already has, at the pinned version", () => {
    const [steps] = [...jobsOf("deploy-hosting.yml").values()];
    const action = steps.findIndex((s) =>
      /FirebaseExtended\/action-hosting-deploy@/.test(s)
    );
    const version = steps[action].match(/firebaseToolsVersion:\s*(\S+)/)?.[1];
    const pinned = readFileSync(
      resolve(workflowsDir, "deploy-firestore.yml"),
      "utf8"
    ).match(/npm install -g firebase-tools@(\S+)/)?.[1];
    expect(version).toBe(pinned);
    const fetched = steps
      .slice(0, action)
      .some((s) => s.includes(`npx --yes firebase-tools@${pinned} --version`));
    expect(fetched).toBe(true);
  });
});

/* Every merge to main deploys, and minor and patch bumps auto-merge, so a
   version update waits a week after its release before Dependabot offers
   it. Security updates are not subject to the cooldown. */
describe("Dependabot waits a week before offering a new version", () => {
  const src = readFileSync(resolve(repoRoot, ".github/dependabot.yml"), "utf8");
  const entries = src.split(/^ {2}- package-ecosystem:/m).slice(1);

  it("sets a cooldown of at least 7 days on every ecosystem", () => {
    expect(entries.length).toBeGreaterThanOrEqual(3);
    for (const entry of entries) {
      const days = Number(
        entry.match(/^ {4}cooldown:\s*\n {6}default-days:\s*(\d+)/m)?.[1] ?? 0
      );
      expect(days, entry.split("\n")[0]).toBeGreaterThanOrEqual(7);
    }
  });
});

/* Release credentials can live in the production environment, where only a
   job that names it can read them. Every deploy job that reads one names
   it; the Pages job keeps its own github-pages environment; and Deploy
   production passes secrets on with `secrets: inherit`, without which a
   called workflow's job reads an environment secret as empty. */
describe("deploy jobs that read release credentials name the production environment", () => {
  const RELEASE_SECRET =
    /secrets\.(FIREBASE_SERVICE_ACCOUNT|ASC_API_\w+|IOS_\w+|APPLE_TEAM_ID)\b/;
  const deployFiles = workflowFiles.filter((f) => /^deploy-.+\.ya?ml$/.test(f));

  it("covers the Firestore, Storage, Functions, Hosting and iOS deploys", () => {
    const named = deployFiles.flatMap((file) =>
      [...jobTexts(file)]
        .filter(([, text]) => /^ {4}environment: production\s*$/m.test(text))
        .map(([job]) => `${file} ${job}`)
    );
    expect(named.sort()).toEqual([
      "deploy-firestore.yml deploy",
      "deploy-functions.yml deploy",
      "deploy-hosting.yml build-and-deploy",
      "deploy-ios.yml testflight",
      "deploy-storage.yml deploy",
    ]);
  });

  it("leaves no job reading a release credential without it", () => {
    const offenders = deployFiles.flatMap((file) =>
      [...jobTexts(file)]
        .filter(
          ([, text]) =>
            RELEASE_SECRET.test(text) &&
            !/^ {4}environment: production\s*$/m.test(text)
        )
        .map(([job]) => `${file} ${job}`)
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the Pages job on github-pages", () => {
    const pages = jobTexts("deploy.yml").get("build-and-deploy") ?? "";
    expect(pages).toMatch(/^ {4}environment:\s*\n {6}name: github-pages\s*$/m);
  });

  it("passes every secret on to the called deploys", () => {
    const calls = [...jobTexts("deploy-production.yml").values()].filter((t) =>
      /^ {4}uses: \.\/\.github\/workflows\//m.test(t)
    );
    expect(calls.length).toBe(5);
    for (const call of calls)
      expect(call).toMatch(/^ {4}secrets: inherit\s*$/m);
  });
});
