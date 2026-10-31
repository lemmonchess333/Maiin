/**
 * The iOS project's build settings, resolved the way Xcode resolves them
 * for one target's configuration: the project's settings, then the
 * target's, then any command-line override (the TestFlight pilot passes
 * `WATCH_RUN_RELEASE_ENABLED=YES`), with nested `$(A_$(B))` references
 * expanded innermost first and an unset name read as empty.
 *
 * Nothing in this repo can run Xcode, so the tests that ask what a
 * standard or a pilot build carries (its Info.plist text, whether it embeds
 * the Watch app) read the answer out of `project.pbxproj` with this.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) =>
  readFileSync(resolve(repoRoot, p), "utf8").replace(/\r\n/g, "\n");

export const PBXPROJ = read("ios/App/App.xcodeproj/project.pbxproj");
export const APP_INFO_PLIST = read("ios/App/App/Info.plist");

const OBJECT_ID = "[0-9A-F]{24}";

/** The scalar settings of one XCBuildConfiguration; list values are left out. */
function configurationSettings(id: string): Record<string, string> {
  const block = PBXPROJ.match(
    new RegExp(
      `^\\t\\t${id} /\\*[^*]*\\*/ = \\{\\n\\t\\t\\tisa = XCBuildConfiguration;[\\s\\S]*?buildSettings = \\{\\n([\\s\\S]*?)\\n\\t\\t\\t\\};`,
      "m"
    )
  );
  if (!block) throw new Error(`no XCBuildConfiguration ${id}`);
  const settings: Record<string, string> = {};
  for (const line of block[1].split("\n")) {
    const m = line.match(
      /^\t{4}([A-Za-z0-9_]+) = ("(?:[^"\\]|\\.)*"|[^"(;][^;]*);$/
    );
    if (!m) continue;
    settings[m[1]] = m[2].startsWith('"')
      ? m[2].slice(1, -1).replace(/\\(.)/g, "$1")
      : m[2];
  }
  return settings;
}

/** Configuration name → id, from a configuration list. */
function configurationList(listId: string): Map<string, string> {
  const list = PBXPROJ.match(
    new RegExp(
      `^\\t\\t${listId} /\\*[^*]*\\*/ = \\{\\n\\t\\t\\tisa = XCConfigurationList;\\n\\t\\t\\tbuildConfigurations = \\(([\\s\\S]*?)\\);`,
      "m"
    )
  );
  if (!list) throw new Error(`no XCConfigurationList ${listId}`);
  return new Map(
    [
      ...list[1].matchAll(new RegExp(`(${OBJECT_ID}) /\\* (.+?) \\*/`, "g")),
    ].map((m) => [m[2], m[1]])
  );
}

function targetConfigurationListId(target: string): string {
  const id = PBXPROJ.match(
    new RegExp(
      `buildConfigurationList = (${OBJECT_ID}) /\\* Build configuration list for PBXNativeTarget "${target}" \\*/`
    )
  )?.[1];
  if (!id) throw new Error(`no PBXNativeTarget "${target}"`);
  return id;
}

function projectConfigurationListId(): string {
  const id = PBXPROJ.match(
    new RegExp(
      `buildConfigurationList = (${OBJECT_ID}) /\\* Build configuration list for PBXProject `
    )
  )?.[1];
  if (!id) throw new Error("no PBXProject configuration list");
  return id;
}

/** A target's configuration names, in the order the project lists them. */
export function targetConfigurations(target: string): string[] {
  return [...configurationList(targetConfigurationListId(target)).keys()];
}

/** The target's own settings for one configuration, before resolution. */
export function targetSettings(
  target: string,
  configuration: string
): Record<string, string> {
  const id = configurationList(targetConfigurationListId(target)).get(
    configuration
  );
  if (!id) throw new Error(`${target} has no ${configuration} configuration`);
  return configurationSettings(id);
}

/** Expands every `$(NAME)` in `value`, innermost first. */
export function expandBuildSettings(
  value: string,
  lookup: (name: string) => string | undefined
): string {
  let out = value;
  for (let step = 0; step < 100; step++) {
    const m = /\$\(([A-Za-z0-9_]+)\)/.exec(out);
    if (!m) return out;
    out =
      out.slice(0, m.index) +
      (lookup(m[1]) ?? "") +
      out.slice(m.index + m[0].length);
  }
  throw new Error(`build setting expansion did not settle: ${value}`);
}

/** One setting as `xcodebuild -target <target> -configuration <configuration>
 *  <overrides>` would resolve it. */
export function resolvedSetting(
  target: string,
  configuration: string,
  name: string,
  overrides: Record<string, string> = {}
): string {
  const projectId = configurationList(projectConfigurationListId()).get(
    configuration
  );
  const merged = {
    ...(projectId ? configurationSettings(projectId) : {}),
    ...targetSettings(target, configuration),
    ...overrides,
  };
  const lookup = (key: string): string | undefined =>
    key in merged ? expandBuildSettings(merged[key], lookup) : undefined;
  return lookup(name) ?? "";
}

/** A top-level string in the iPhone app's Info.plist as a build with this
 *  Watch release gate (`YES` for the pilot, `NO` for a standard build)
 *  writes it into the bundle. */
export function appInfoPlistString(
  key: string,
  gate: string,
  configuration = "Release"
): string {
  const raw = APP_INFO_PLIST.match(
    new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`)
  )?.[1];
  if (raw === undefined) throw new Error(`Info.plist has no string ${key}`);
  const overrides = { WATCH_RUN_RELEASE_ENABLED: gate };
  return expandBuildSettings(raw, (name) =>
    resolvedSetting("App", configuration, name, overrides)
  );
}
