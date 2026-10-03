/**
 * Every call to `useProgram()` starts its own programme engine: its own
 * load, its own week rollovers, its own writers over the one document. A
 * page that calls it and renders a child that calls it again runs two, and
 * the child's starts empty. Train's Run tab did, through a claims wrapper
 * that called `useProgram()` only to read the plan its parent already held
 * (architecture review, candidate 10).
 *
 * So the callers are listed: the routes that own a programme, and Home's
 * controller, which mounts the engine only when Home has to act. A component
 * inside one of them takes the plan as a prop. A new route that needs the
 * engine is added here on purpose.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

const ENGINE_OWNERS = [
  "src/features/program/HomeProgramController.tsx",
  "src/pages/Program.tsx",
  "src/pages/Run.tsx",
  "src/pages/RunSummary.tsx",
  "src/pages/settings/SettingsLiftPlan.tsx",
  "src/pages/settings/SettingsRunPlan.tsx",
  "src/pages/settings/SettingsTraining.tsx",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === "__tests__" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [path]
      : [];
  });
}

/** Code only: comments and string literals say the name without calling it. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(
      /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g,
      '""'
    );
}

describe("the programme engine's callers", () => {
  const callers = sourceFiles(resolve(repoRoot, "src"))
    .filter((path) =>
      // A call, not the hook's own declaration.
      /(?<!function )\buseProgram\(\)/.test(code(readFileSync(path, "utf8")))
    )
    .map((path) => relative(repoRoot, path).split("\\").join("/"))
    .sort();

  it("scans the app (guard against an empty walk)", () => {
    expect(callers.length).toBeGreaterThan(0);
  });

  it("are the routes that own a programme, and Home's controller", () => {
    expect(callers).toEqual(ENGINE_OWNERS);
  });
});
