import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error Standalone Node .mjs script is outside the TS app project.
import * as script from "./write-functions-env.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const settings = script.FUNCTION_SETTINGS as string[];
const format = script.formatFunctionsEnv as (
  env: Record<string, string | undefined>
) => string | null;

/** firebase-tools 15.32.1's reading of one double-quoted line
 *  (lib/functions/env.js, `parse`), enough to round-trip what we write. */
function parseLine(line: string): [string, string] {
  const m = /^([\w./]+)="((?:\\"|[^"])*)"$/.exec(line);
  if (!m) throw new Error(`not a double-quoted line: ${line}`);
  const unescape: Record<string, string> = {
    "\\n": "\n",
    "\\r": "\r",
    "\\t": "\t",
    "\\v": "\v",
    "\\\\": "\\",
    "\\'": "'",
    '\\"': '"',
  };
  return [m[1], m[2].replace(/\\[nrtv\\'"]/g, (s) => unescape[s])];
}

describe("functions/.env from repository variables", () => {
  it("writes nothing while no setting is set, so each function keeps what it has", () => {
    expect(format({})).toBeNull();
    expect(format({ ADMIN_UIDS: "", RESEND_FROM: "  \n" })).toBeNull();
    // Not a function setting, so not written.
    expect(format({ SOMETHING_ELSE: "x" })).toBeNull();
  });

  it("writes each set value quoted, so firebase-tools reads it back as typed", () => {
    const values = {
      ADMIN_UIDS: " uidA,uidB\n",
      RESEND_FROM: "Tropos <no-reply@troposfit.com>",
      PUBLIC_APP_BASE_URL: "https://troposfit.com/#from-alert",
      MODERATION_ALERT_EMAIL: 'odd"\\name@example.com',
    };
    const text = format(values)!;
    expect(text.endsWith("\n")).toBe(true);
    const parsed = Object.fromEntries(
      text.trimEnd().split("\n").map(parseLine)
    );
    expect(parsed).toEqual({
      ADMIN_UIDS: "uidA,uidB",
      RESEND_FROM: "Tropos <no-reply@troposfit.com>",
      PUBLIC_APP_BASE_URL: "https://troposfit.com/#from-alert",
      MODERATION_ALERT_EMAIL: 'odd"\\name@example.com',
    });
  });

  it("the deploy passes each setting from the repository variable of the same name", () => {
    const workflow = read(".github/workflows/deploy-functions.yml");
    const step = workflow.split(
      "- name: Write functions/.env from repository variables"
    )[1];
    expect(step, "deploy-functions.yml has lost the step").toBeDefined();
    const body = step.split(/\n {6}- /)[0];
    const passed = [
      ...body.matchAll(/^ {10}([A-Z0-9_]+): \$\{\{ vars\.([A-Z0-9_]+) \}\}$/gm),
    ];
    for (const [, name, variable] of passed) expect(variable).toBe(name);
    expect(passed.map((m) => m[1]).sort()).toEqual([...settings].sort());
    expect(body).toContain("run: node scripts/write-functions-env.mjs");
    // Written before the deploy that reads it.
    expect(workflow.indexOf("Write functions/.env")).toBeLessThan(
      workflow.indexOf("firebase deploy --only functions")
    );
  });

  it("lists every plain variable the functions read, and nothing they don't", () => {
    // What a deployed function reads from its environment: everything in
    // functions/ but its tests, its one-off scripts and its own tooling.
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(root, dir), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (!["node_modules", "__tests__", "scripts"].includes(entry.name))
            walk(rel);
        } else if (
          entry.name.endsWith(".js") &&
          !entry.name.endsWith(".config.js")
        ) {
          sources.push(read(rel));
        }
      }
    };
    walk("functions");
    const all = sources.join("\n");
    const readsEnv = new Set(
      [
        ...all.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g),
        ...all.matchAll(/process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g),
        // reportAlert.js takes the environment as a parameter.
        ...all.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g),
      ].map((m) => m[1])
    );
    const secrets = new Set(
      [...all.matchAll(/defineSecret\(\s*["']([A-Z0-9_]+)["']/g)].map(
        (m) => m[1]
      )
    );
    // Set by the Cloud Functions runtime or the emulator, never by us.
    const runtime = new Set(["FUNCTIONS_EMULATOR", "GCLOUD_PROJECT"]);
    const plain = [...readsEnv].filter(
      (n) => !secrets.has(n) && !runtime.has(n)
    );
    expect(secrets.size).toBeGreaterThan(5);
    expect(plain.sort()).toEqual([...settings].sort());
  });

  it("the web builds open the moderation page for the same ADMIN_UIDS", () => {
    for (const workflow of ["deploy.yml", "deploy-hosting.yml"]) {
      expect(read(`.github/workflows/${workflow}`)).toContain(
        "VITE_ADMIN_UIDS: ${{ secrets.VITE_ADMIN_UIDS || vars.ADMIN_UIDS }}"
      );
    }
  });
});
