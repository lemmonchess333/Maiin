/**
 * No health figure goes to analytics.
 *
 * Google Analytics is a third party. A figure about a person's body, food,
 * sleep, heart or training (a weight, calories, a macro share, a distance,
 * a pace, a volume, a score, a heart rate, steps, sets, reps, a load, a
 * session's length) is health data: under UK GDPR sending it needs explicit
 * consent the app does not ask for, Washington's My Health My Data Act
 * counts it as sharing, and the FTC's Health Breach Notification Rule can
 * count it as a breach. So none is sent (legal audit finding 3.3, which
 * found the four chart taps on Progress sending the figure tapped). What is
 * sent: counts of app actions, screen and chart names, plan and setting
 * choices, error codes and how long the app itself took.
 *
 * Every event reaches Google through one door: a surface module's
 * `track(event, metadata)` (`src/lib/*Analytics.ts`) → `analyticsClient.emit`
 * → `analyticsProvider.logAnalyticsEvent`. Each surface module declares the
 * parameters it may send in one `…EventMetadata` interface, and TypeScript's
 * excess-property check holds every call site's object literal to it. So
 * this test checks two things:
 *   1. the door: only `analyticsClient.ts` calls `logAnalyticsEvent`, only
 *      surface modules import `emit`, and only `analyticsProvider.ts` loads
 *      an analytics SDK;
 *   2. the schema: no parameter's name holds one of FIGURE_WORDS as a word,
 *      none is one of REMOVED_KEYS, none names a session's length, and the
 *      generic carriers (`value`, `count`, `durationMs`, …) are declared
 *      only where GENERIC_ALLOWED says what they carry.
 * A name the rules catch that is not a figure goes in NOT_A_FIGURE, with
 * its reason; a new entry there or in GENERIC_ALLOWED is a reviewed
 * decision.
 *
 * What it cannot see: a figure passed under an allowed name (a run's length
 * as Food's `durationMs`, a set count as Lifecycle's `count`), or a cast at
 * a call site that slips past the interface. Those are for review.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, basename } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

/** Words that name a body, food, sleep, heart or training figure. A
 *  parameter whose name holds one as a whole word (camelCase or snake_case
 *  split, any case) is refused: `volumeKg`, `distance_m`, `avgHr`. */
const FIGURE_WORDS = {
  body: [
    "weight",
    "height",
    "bmi",
    "fat",
    "bodyfat",
    "waist",
    "age",
    "birth",
    "sex",
    "gender",
    "kg",
    "kgs",
    "lb",
    "lbs",
    "stone",
  ],
  food: [
    "calorie",
    "calories",
    "kcal",
    "macro",
    "macros",
    "protein",
    "carb",
    "carbs",
    "fibre",
    "fiber",
    "sugar",
    "sodium",
    "grams",
    "water",
    "intake",
    "tdee",
  ],
  training: [
    "distance",
    "km",
    "metres",
    "meters",
    "miles",
    "mileage",
    "pace",
    "speed",
    "volume",
    "tonnage",
    "score",
    "pi",
    "sets",
    "reps",
    "rep",
    "load",
    "loads",
    "e1rm",
    "rpe",
    "effort",
    "elapsed",
    "moving",
    "cadence",
    "elevation",
    "vo2",
    "vo2max",
    "readiness",
  ],
  heart: ["heart", "hr", "bpm", "hrv"],
  sleep: ["sleep"],
  steps: ["steps"],
} as const;

/** Keys this test was written after, refused by name in any module: the
 *  ease-week nudge's evidence (how many sessions were rated harder, missed
 *  their pace or ran short, out of how many), which no word above names. */
const REMOVED_KEYS = [
  "harderCount",
  "ratedCount",
  "slowCount",
  "judgedCount",
  "shortCount",
  "comparedCount",
];

/** A name holding one of each of these is a session's length
 *  (`runDurationMs`, `workoutMinutes`, `session_time`). */
const SESSION_WORDS = ["session", "workout", "run", "lift", "ride", "swim"];
const TIME_WORDS = [
  "duration",
  "time",
  "seconds",
  "secs",
  "minutes",
  "mins",
  "hours",
  "ms",
  "length",
];

/** Names that carry whatever they are given. Each is allowed only in the
 *  module, and for the meaning, written here. */
const GENERIC_KEYS = [
  "value",
  "values",
  "amount",
  "total",
  "count",
  "reading",
  "metric",
  "figure",
  "durationMs",
  "duration",
  "seconds",
  "minutes",
];
const GENERIC_ALLOWED: Record<string, Record<string, string>> = {
  settingsAnalytics: {
    value:
      "a switch's new state, or the unit, theme or sharing choice picked; never a figure",
  },
  lifecycleAnalytics: {
    count:
      "completion_surfaces: how many dialogs and toasts the app showed after a session",
  },
  foodAnalytics: {
    durationMs:
      "how long the Food page took to draw, and how long logging a meal took in the app",
  },
  homeAnalytics: {
    durationMs:
      "how long Home took to draw, and how long the weigh-in sheet was open",
  },
  historyAnalytics: { durationMs: "how long Progress took to draw" },
  socialAnalytics: { durationMs: "how long the feed took to draw" },
};

/** Names the rules catch that carry no figure. */
const NOT_A_FIGURE: Record<string, string> = {
  "foodAnalytics.ageSeconds":
    "how long a diary entry lived before it was deleted, not a person's age",
  "lifecycleAnalytics.heartRateCoverage":
    "how much of a Watch run the heart-rate sensor covered, as none, partial or full: the connection, never a reading",
};

const BANNED_WORDS: ReadonlyMap<string, string> = new Map(
  Object.entries(FIGURE_WORDS).flatMap(([kind, words]) =>
    words.map((w) => [w, kind] as const)
  )
);

/** `heartRateCoverage` → heart, rate, coverage; `HRZone` → hr, zone. */
function words(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/** Why `module`'s parameter `key` may not go to analytics, or null. */
function figureProblem(module: string, key: string): string | null {
  if (NOT_A_FIGURE[`${module}.${key}`]) return null;
  if (REMOVED_KEYS.includes(key))
    return `"${key}" is a training figure removed from analytics`;
  if (GENERIC_KEYS.includes(key)) {
    return GENERIC_ALLOWED[module]?.[key]
      ? null
      : `"${key}" carries whatever it is given; GENERIC_ALLOWED does not allow it in ${module}`;
  }
  const ws = words(key);
  for (const w of ws) {
    const kind = BANNED_WORDS.get(w);
    if (kind) return `"${key}" names a ${kind} figure ("${w}")`;
  }
  if (
    ws.some((w) => SESSION_WORDS.includes(w)) &&
    ws.some((w) => TIME_WORDS.includes(w))
  )
    return `"${key}" names a session's length`;
  return null;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__" || name === "test")
        continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(name) || /\.(test|spec)\.tsx?$/.test(name)) continue;
    out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (s) => " ".repeat(s.length));
}

const files = sourceFiles(resolve(repoRoot, "src")).map((full) => ({
  path: relative(repoRoot, full).replaceAll("\\", "/"),
  code: stripComments(readFileSync(full, "utf8")),
}));

/** The modules that hand events to the client: whatever imports `emit`. */
const surfaces = files.filter((f) =>
  /from\s+"(?:\.\/|@\/lib\/)analyticsClient"/.test(f.code)
);

/** The keys of `code`'s one `export interface …EventMetadata`. */
function metadataKeys(code: string): { name: string; keys: string[] } {
  const heads = [...code.matchAll(/export interface (\w+EventMetadata)\s*\{/g)];
  if (heads.length !== 1)
    throw new Error(`expected one …EventMetadata, found ${heads.length}`);
  const start = heads[0].index! + heads[0][0].length;
  let depth = 1;
  let i = start;
  while (depth > 0 && i < code.length) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") depth--;
    i++;
  }
  let body = code
    .slice(start, i - 1)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  // Nested object types hold their own keys, not the event's.
  while (/\{[^{}]*\}/.test(body)) body = body.replace(/\{[^{}]*\}/g, "");
  const keys = [...body.matchAll(/(?:^|[;\n])\s*(\w+)\??\s*:/g)].map(
    (m) => m[1]
  );
  return { name: heads[0][1], keys };
}

const schema = surfaces.map((f) => ({
  module: basename(f.path, ".ts"),
  path: f.path,
  ...metadataKeys(f.code),
}));

describe("the one door to analytics", () => {
  it("finds the surface modules and their parameters (the scan isn't empty)", () => {
    expect(files.length).toBeGreaterThan(300);
    expect(surfaces.length).toBeGreaterThanOrEqual(9);
    expect(schema.flatMap((s) => s.keys).length).toBeGreaterThan(60);
    // Anchor: the chart tap still says which chart and which point.
    const history = schema.find((s) => s.module === "historyAnalytics");
    expect(history?.keys).toEqual(expect.arrayContaining(["chart", "binKey"]));
  });

  it("is a surface module in src/lib that types what it sends", () => {
    for (const f of surfaces) {
      expect(f.path, f.path).toMatch(/^src\/lib\/\w+Analytics\.ts$/);
      const { name } = metadataKeys(f.code);
      expect(f.code, f.path).toMatch(
        new RegExp(`export function track\\([^)]*metadata: ${name}\\b`)
      );
    }
  });

  it("only the client hands events to the provider", () => {
    const callers = files
      .filter((f) => /\blogAnalyticsEvent\b/.test(f.code))
      .map((f) => f.path)
      .sort();
    expect(callers).toEqual([
      "src/lib/analyticsClient.ts",
      "src/lib/analyticsProvider.ts",
    ]);
  });

  it("only the provider loads an analytics SDK", () => {
    const loaders = files
      .filter((f) =>
        /["'](?:firebase\/analytics|@capacitor-firebase\/analytics)["']/.test(
          f.code
        )
      )
      .map((f) => f.path);
    expect(loaders).toEqual(["src/lib/analyticsProvider.ts"]);
  });
});

describe("no health figure in an analytics event", () => {
  it("no surface module declares a parameter that carries one", () => {
    const problems = schema.flatMap((s) =>
      s.keys
        .map((k) => figureProblem(s.module, k))
        .filter((p): p is string => p !== null)
        .map((p) => `${s.path} ${s.name}: ${p}`)
    );
    expect(problems).toEqual([]);
  });

  it("every allowance names a parameter that exists", () => {
    // A stale allowance would wave through the next parameter to take the
    // name, with a reason written for something else.
    const declared = new Set(
      schema.flatMap((s) => s.keys.map((k) => `${s.module}.${k}`))
    );
    const allowances = [
      ...Object.keys(NOT_A_FIGURE),
      ...Object.entries(GENERIC_ALLOWED).flatMap(([m, keys]) =>
        Object.keys(keys).map((k) => `${m}.${k}`)
      ),
    ];
    for (const a of allowances) expect(declared, a).toContain(a);
  });

  it.each([
    // The four chart taps the legal audit found.
    ["historyAnalytics", "value"],
    ["historyAnalytics", "volumeKg"],
    ["historyAnalytics", "distanceM"],
    ["historyAnalytics", "macroShare"],
    ["historyAnalytics", "pi"],
    ["historyAnalytics", "piScore"],
    // The ease-week nudge's evidence.
    ["programAnalytics", "count"],
    ["programAnalytics", "total"],
    ["programAnalytics", "harderCount"],
    ["programAnalytics", "slowCount"],
    // Figures of each kind, under the names a call site would reach for.
    ["homeAnalytics", "weightKg"],
    ["homeAnalytics", "body_fat_pct"],
    ["homeAnalytics", "age"],
    ["foodAnalytics", "calories"],
    ["foodAnalytics", "proteinGrams"],
    ["foodAnalytics", "waterMl"],
    ["lifecycleAnalytics", "durationMs"],
    ["lifecycleAnalytics", "runDurationMs"],
    ["lifecycleAnalytics", "workoutMinutes"],
    ["lifecycleAnalytics", "avgPace"],
    ["lifecycleAnalytics", "heartRate"],
    ["lifecycleAnalytics", "avgHR"],
    ["lifecycleAnalytics", "sleepHours"],
    ["lifecycleAnalytics", "steps"],
    ["lifecycleAnalytics", "sets"],
    ["lifecycleAnalytics", "reps"],
    ["lifecycleAnalytics", "topLoad"],
    ["lifecycleAnalytics", "e1rm"],
  ])("refuses %s.%s", (module, key) => {
    expect(figureProblem(module, key)).not.toBeNull();
  });

  it.each([
    ["historyAnalytics", "chart"],
    ["historyAnalytics", "binKey"],
    ["settingsAnalytics", "value"],
    ["foodAnalytics", "itemCount"],
    ["foodAnalytics", "ageSeconds"],
    ["lifecycleAnalytics", "heartRateCoverage"],
    ["lifecycleAnalytics", "stepIndex"],
    ["lifecycleAnalytics", "runMode"],
    ["socialAnalytics", "background"],
  ])("allows %s.%s", (module, key) => {
    expect(figureProblem(module, key)).toBeNull();
  });
});
