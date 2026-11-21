import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { layoutKey, liftSessionPath, runSessionPath } from "@/lib/sessionPages";

/**
 * A session's own page (TrainWk1 call 2), and the one key Train and those
 * pages are mounted under, so the programme engine they share stays
 * mounted between them.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const app = readFileSync(resolve(repoRoot, "src/App.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

describe("a session's own address", () => {
  it("names a lift by its day in the week, as Train's ?day= does", () => {
    expect(liftSessionPath(0)).toBe("/program/lift/0");
    expect(liftSessionPath(4)).toBe("/program/lift/4");
  });

  it("names a run by its date, as Train's ?rday= does", () => {
    expect(runSessionPath("2026-11-16")).toBe("/program/run/2026-11-16");
  });
});

describe("the key Layout mounts a screen under", () => {
  it("is one for Train and both session pages", () => {
    for (const path of [
      "/program",
      "/program/",
      liftSessionPath(2),
      runSessionPath("2026-11-16"),
    ]) {
      expect(layoutKey(path), path).toBe("/program");
    }
  });

  it("is each other screen's own address", () => {
    // The plan page keeps its own engine; a profile is a new screen per
    // person, as before.
    for (const path of [
      "/program/plan",
      "/program/lift",
      "/program/lift/2/extra",
      "/programme",
      "/run/abc",
      "/user/a",
      "/",
    ]) {
      expect(layoutKey(path), path).toBe(path);
    }
  });
});

describe("the routes App.tsx declares for them", () => {
  /** The `<Route path="/program" …>` element and the routes inside it. */
  const engineRoute = (() => {
    const open = app.indexOf('path="/program"\n');
    expect(open, "the /program route").toBeGreaterThan(-1);
    const close = app.indexOf("</Route>", open);
    expect(close).toBeGreaterThan(open);
    return app.slice(open, close);
  })();

  it("holds the engine for Train and the two pages, under one route", () => {
    expect(engineRoute).toContain("<ProgramEngineRoute />");
    expect(engineRoute).toMatch(
      /<Route\s+index\s+element=\{[\s\S]*?<Program \/>/
    );
    expect(engineRoute).toContain('path="/program/lift/:day"');
    expect(engineRoute).toContain("<LiftSession />");
    expect(engineRoute).toContain('path="/program/run/:date"');
    expect(engineRoute).toContain("<RunSession />");
  });

  it("puts every page under it at an address that shares Train's key", () => {
    const paths = [...engineRoute.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
    expect(paths).toEqual([
      "/program",
      "/program/lift/:day",
      "/program/run/:date",
    ]);
    for (const path of paths) {
      const sample = path.replace(":day", "3").replace(":date", "2026-11-16");
      expect(layoutKey(sample), sample).toBe("/program");
    }
  });

  it("leaves the plan page its own route and engine", () => {
    expect(engineRoute).not.toContain('path="/program/plan"');
    expect(app).toContain('path="/program/plan"');
  });
});
