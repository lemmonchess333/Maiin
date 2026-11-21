/**
 * How Dependabot bundles updates, which decides how many pull requests
 * (each a full CI run of about 200 runner minutes) land at once.
 *
 * Four things here go wrong without anyone noticing:
 *  - a native plugin outside the `capacitor` group is bumped alone, and
 *    the iOS app builds with plugins on two Capacitor majors;
 *  - a patched package is offered an update, and `npm ci` fails on a
 *    patch that no longer applies, taking its whole group with it;
 *  - a major is merged without a person reading it;
 *  - the ecosystems open on the same morning again.
 *
 * Text, as the other workflow guards read their YAML.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) =>
  readFileSync(resolve(repoRoot, rel), "utf8").replace(/\r\n/g, "\n");

const config = read(".github/dependabot.yml");
const entries = config.split(/^ {2}- package-ecosystem:/m).slice(1);
const entry = (ecosystem: string, directory: string) => {
  const found = entries.find(
    (e) =>
      e.startsWith(` "${ecosystem}"`) && e.includes(`directory: "${directory}"`)
  );
  expect(found, `${ecosystem} ${directory}`).toBeDefined();
  return found!;
};
const root = entry("npm", "/");
const functions = entry("npm", "/functions");
const actions = entry("github-actions", "/");

/** The groups of one entry, in order, each with its own text. */
function groups(text: string): [string, string][] {
  const block = text.slice(text.search(/^ {4}groups:\s*$/m));
  return block
    .split(/^ {6}(?=[\w-]+:\s*$)/m)
    .slice(1)
    .map((part) => [part.slice(0, part.indexOf(":")), part]);
}

/** A group's patterns, as regexes (`*` matches anything). */
function patterns(group: string): RegExp[] {
  return [...group.matchAll(/^ {10}- "([^"]+)"/gm)].map(
    (m) =>
      new RegExp(
        `^${m[1].replace(/[.+?^${}()|[\]\\/]/g, "\\$&").replace(/\*/g, ".*")}$`
      )
  );
}

/** The ignore entries: dependency name and its update types, written
 *  inline (`["a", "b"]`) or as a list. */
function ignores(text: string): { name: string; types: string[] }[] {
  const block = text.match(/^ {4}ignore:\n([\s\S]*?)(?=^ {4}\S)/m)?.[1] ?? "";
  return block
    .split(/^ {6}- (?=dependency-name)/m)
    .slice(1)
    .map((item) => {
      const inline = item.match(/update-types: \[(.*)\]/)?.[1];
      const listed = item.match(/update-types:\s*\n((?: {10}- .*\n?)+)/)?.[1];
      const raw = inline ?? listed ?? "";
      return {
        name: item.match(/dependency-name: "([^"]+)"/)?.[1] ?? "",
        types: [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort(),
      };
    });
}

describe("the capacitor group holds every native plugin", () => {
  const capacitor = groups(root).find(([name]) => name === "capacitor");
  const pkg = JSON.parse(read("package.json")) as Record<
    string,
    Record<string, string>
  >;
  const swift = read("ios/App/CapApp-SPM/Package.swift");
  const native = [
    ...new Set([
      ...[...swift.matchAll(/node_modules\/((?:@[\w.-]+\/)?[\w.-]+)"/g)].map(
        (m) => m[1]
      ),
      ...Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
        (name) => /capacitor/.test(name)
      ),
    ]),
  ].sort();

  it("finds the plugins", () => {
    expect(capacitor).toBeDefined();
    expect(native.length).toBeGreaterThan(10);
    expect(native).toContain("@capacitor-firebase/authentication");
    expect(native).toContain("@revenuecat/purchases-capacitor");
  });

  it("matches each of them", () => {
    const re = patterns(capacitor![1]);
    expect(native.filter((name) => !re.some((r) => r.test(name)))).toEqual([]);
  });

  it("comes before the catch-alls, which would otherwise take them", () => {
    const names = groups(root).map(([name]) => name);
    expect(names.indexOf("capacitor")).toBeLessThan(
      names.indexOf("production-minor-and-patch")
    );
  });
});

describe("a patched package is never offered an update", () => {
  const patched = readdirSync(resolve(repoRoot, "patches"))
    .filter((f) => f.endsWith(".patch"))
    .map((f) => f.replace(/\+[^+]+\.patch$/, "").replace(/^(@[^+]+)\+/, "$1/"));

  it("reads the patch files", () => {
    expect(patched).toContain("@capacitor-firebase/authentication");
  });

  it("ignores every major, minor and patch update of each, until its patch is re-cut", () => {
    /* By update type, not by name alone: a name-only ignore may also
       stop security updates, and this must not. */
    const rules = ignores(root);
    for (const name of patched) {
      const rule = rules.find((r) => r.name === name);
      expect(rule, `${name} has a patch and no ignore entry`).toBeDefined();
      expect(rule!.types, name).toEqual([
        "version-update:semver-major",
        "version-update:semver-minor",
        "version-update:semver-patch",
      ]);
    }
  });
});

describe("the catch-all groups", () => {
  const rootGroups = groups(root);

  it("split the root's minor and patch updates into what ships and what does not", () => {
    const names = rootGroups.map(([name]) => name);
    expect(names.slice(-2)).toEqual([
      "production-minor-and-patch",
      "development-minor-and-patch",
    ]);
    const [prod, dev] = rootGroups.slice(-2).map(([, text]) => text);
    expect(prod).toContain('dependency-type: "production"');
    expect(dev).toContain('dependency-type: "development"');
    for (const text of [prod, dev])
      expect(text).toContain('update-types: ["minor", "patch"]');
  });

  it("give functions one minor and patch group, and leave its majors to open alone", () => {
    expect(ignores(functions)).toEqual([]);
    const [[, group]] = groups(functions);
    expect(group).toContain('update-types: ["minor", "patch"]');
  });

  it("bundle the actions' minor and patch updates", () => {
    const [[, group]] = groups(actions);
    expect(group).toContain('update-types: ["minor", "patch"]');
  });
});

it("auto-merges minor and patch updates only, so a grouped major waits for a person", () => {
  const autoMerge = read(".github/workflows/dependabot-auto-merge.yml")
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  expect(autoMerge).toContain(
    "if: ${{ steps.meta.outputs.update-type == 'version-update:semver-patch' || steps.meta.outputs.update-type == 'version-update:semver-minor' }}"
  );
  expect(autoMerge.match(/gh pr merge --auto/g)).toHaveLength(1);
});

it("opens each ecosystem on its own day", () => {
  const days = entries.map((e) => e.match(/^ {6}day: "(\w+)"/m)?.[1]);
  expect(days).toHaveLength(3);
  expect(new Set(days).size).toBe(3);
});
