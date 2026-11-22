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
 * as Food's `durationMs`, a set count as Lifecycle's `count`), a cast at a
 * call site that slips past the interface, or what a spread
 * (`{ ...dimensions }`) or an object passed by name carries, which the
 * call-site scan below cannot read. Those are for review.
 *
 * Nor does anything a person typed or named go (the last describe below):
 * a food, meal, exercise, routine, segment, Space, Circle, shoe or route is
 * known by its name, a search by its text, and another person by their uid.
 * A saved food's id is its name, lower-cased (`chicken_and_rice`), and went
 * to Google as `favouriteId` until it was found by a fact-check of the
 * Privacy Policy. So no parameter's name holds one of TYPED_WORDS, none is
 * one of TYPED_REMOVED_KEYS (refused in the schema and at every call site),
 * and an identifier (`…Id`, `…Key`) is declared only where ID_ALLOWED says
 * what it identifies. `analyticsRedaction`'s denylist strips the same keys
 * if one is sent anyway.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, basename } from "node:path";
import { sanitizeAnalyticsParams } from "../analyticsRedaction";

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

/** Words that name something a person typed or named, or another person.
 *  A parameter whose name holds one as a whole word is refused:
 *  `foodName`, `search_query`, `circleTitle`, `targetUid`. */
const TYPED_WORDS = [
  "name",
  "names",
  "title",
  "query",
  "search",
  "text",
  "caption",
  "comment",
  "note",
  "notes",
  "bio",
  "uid",
  "user",
  "email",
];

/** Keys removed because their value was something a person typed, refused
 *  by name in any module and at any call site: a saved food's id is its
 *  name (`useFoodFavourites`' `makeKey`). */
const TYPED_REMOVED_KEYS = ["favouriteId", "favoriteId"];

/** An identifier is allowed only in the module, and for what it
 *  identifies, written here: an id can be a name in disguise. */
const ID_WORDS = ["id", "ids", "key", "keys"];
const ID_ALLOWED: Record<string, Record<string, string>> = {
  socialAnalytics: {
    challengeId:
      "a challenge the server made, named by its kind and start day (`weekly-2026-11-16`); no person makes one",
  },
  paywallAnalytics: {
    featureKey:
      "the Pro feature behind the paywall, one of `ProFeatureKey`'s fixed list",
  },
  historyAnalytics: {
    binKey:
      "the tapped chart point's day, week or month, or the macro's name on the donut (Protein, Carbs, Fat)",
  },
};

/** Why `module`'s parameter `key` may carry something typed, or null. */
function typedProblem(module: string, key: string): string | null {
  if (TYPED_REMOVED_KEYS.includes(key))
    return `"${key}" carried what a person typed and was removed from analytics`;
  const ws = words(key);
  for (const w of ws) {
    if (TYPED_WORDS.includes(w))
      return `"${key}" names something a person typed or named ("${w}")`;
  }
  if (ID_WORDS.includes(ws[ws.length - 1] ?? "") && !ID_ALLOWED[module]?.[key])
    return `"${key}" is an identifier; ID_ALLOWED does not say what it identifies in ${module}`;
  return null;
}

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

  it("declares no parameter the client writes over", () => {
    // `emit` tags every event with its module's name as `surface`, after
    // the metadata, so a parameter of that name never arrives: Lifecycle's
    // return surface did not, from the day it was written.
    const overwritten = schema.flatMap((s) =>
      s.keys
        .filter((k) => k === "surface")
        .map((k) => `${s.path} ${s.name}: "${k}" is replaced by emit's own`)
    );
    expect(overwritten).toEqual([]);
  });

  it("delivers every parameter a surface module declares", () => {
    // The redaction denylist matches substrings and the rules below match
    // whole words, so a name can pass every rule here, and tsc, and still
    // be dropped on its way to Google: "renamed" holds "name",
    // "researchTab" "search", "guideStep" "uid". A key the denylist would
    // eat fails here instead of going quiet.
    const eaten = schema.flatMap((s) =>
      s.keys
        .filter((k) => !(k in sanitizeAnalyticsParams({ [k]: "x" })))
        .map((k) => `${s.path} ${s.name}: "${k}" is dropped by redaction`)
    );
    expect(eaten).toEqual([]);
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

/** An import from a surface module, by any path: `@/lib/foodAnalytics`,
 *  `./foodAnalytics`, `../../lib/foodAnalytics`. */
const SURFACE_IMPORT = new RegExp(
  `import\\s*\\{([^}]*)\\}\\s*from\\s*"(?:[^"]*/)?(?:${schema
    .map((s) => s.module)
    .join("|")})"`,
  "g"
);

/** The names `code` imports a surface module's `track` under:
 *  `import { track as trackFoodEvent } from "@/lib/foodAnalytics"`. */
function trackAliases(code: string): string[] {
  return [...code.matchAll(SURFACE_IMPORT)]
    .flatMap((m) => m[1].split(","))
    .map((part) => /^track(?:\s+as\s+(\w+))?$/.exec(part.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1] ?? "track");
}

/** Every call to a surface module's `track`, under whatever name the file
 *  imports it as, with the text of its arguments. An argument the scan
 *  cannot read is passed by name (`track("checkout_started", dimensions)`)
 *  or spread (`{ ...dimensions, pending }`): what those carry is held by
 *  the metadata interface, and by review. */
const calls = files.flatMap((f) => {
  const aliases = trackAliases(f.code);
  return aliases.flatMap((alias) =>
    [...f.code.matchAll(new RegExp(`\\b${alias}\\(`, "g"))].map((m) => {
      const start = (m.index ?? 0) + m[0].length;
      let depth = 1;
      let i = start;
      while (depth > 0 && i < f.code.length) {
        if (f.code[i] === "(") depth++;
        else if (f.code[i] === ")") depth--;
        i++;
      }
      return { path: f.path, args: f.code.slice(start, i - 1) };
    })
  );
});

/** `key` written as a property of an object literal in `args`, either
 *  `key: value` or the shorthand `{ key }`; never `meal.key` as a value. */
function passesKey(args: string, key: string): boolean {
  return new RegExp(`(?:^|[{,])\\s*["']?${key}["']?\\s*(?=[:,}])`, "m").test(
    args
  );
}

describe("nothing a person typed in an analytics event", () => {
  it("finds the call sites (the scan isn't empty)", () => {
    expect(calls.length).toBeGreaterThan(100);
    // Anchor: the pantry chip tap is still sent, and is found.
    const tap = calls.find(
      (c) =>
        c.path === "src/pages/Food.tsx" &&
        c.args.includes('"food_pantry_chip_tapped"')
    );
    expect(tap?.args).toMatch(/fromPantry:/);
    expect(passesKey("{ fromPantry: meal.favouriteId }", "favouriteId")).toBe(
      false
    );
    expect(passesKey("{\n  favouriteId,\n  useCount }", "favouriteId")).toBe(
      true
    );
  });

  it("finds track under any import path, alias or none", () => {
    for (const from of [
      "@/lib/foodAnalytics",
      "./foodAnalytics",
      "../foodAnalytics",
      "../lib/foodAnalytics",
      "../../lib/foodAnalytics",
      "../../../lib/foodAnalytics",
    ]) {
      expect(
        trackAliases(`import { track as trackFood } from "${from}";`),
        from
      ).toEqual(["trackFood"]);
      expect(
        trackAliases(
          `import {\n  track,\n  type FoodEvent,\n} from "${from}";`
        ),
        from
      ).toEqual(["track"]);
    }
    // Not a surface module: its `track` is someone else's.
    expect(
      trackAliases(`import { track } from "./activationTracker";`)
    ).toEqual([]);
  });

  it("no surface module declares a parameter that carries one", () => {
    const problems = schema.flatMap((s) =>
      s.keys
        .map((k) => typedProblem(s.module, k))
        .filter((p): p is string => p !== null)
        .map((p) => `${s.path} ${s.name}: ${p}`)
    );
    expect(problems).toEqual([]);
  });

  it("no call site passes a key removed for carrying one", () => {
    const passed = calls.flatMap((c) =>
      TYPED_REMOVED_KEYS.filter((key) => passesKey(c.args, key)).map(
        (key) => `${c.path}: ${key}`
      )
    );
    expect(passed).toEqual([]);
  });

  it("every identifier allowance names a parameter that exists", () => {
    const declared = new Set(
      schema.flatMap((s) => s.keys.map((k) => `${s.module}.${k}`))
    );
    const allowances = Object.entries(ID_ALLOWED).flatMap(([m, keys]) =>
      Object.keys(keys).map((k) => `${m}.${k}`)
    );
    for (const a of allowances) expect(declared, a).toContain(a);
  });

  it.each([
    // The saved food's id, which is its name.
    ["foodAnalytics", "favouriteId"],
    ["foodAnalytics", "favoriteId"],
    // Names, titles and searches, under the names a call site would use.
    ["foodAnalytics", "foodName"],
    ["foodAnalytics", "meal_name"],
    ["foodAnalytics", "searchQuery"],
    ["foodAnalytics", "query"],
    ["lifecycleAnalytics", "exerciseName"],
    ["lifecycleAnalytics", "routineName"],
    ["lifecycleAnalytics", "routeName"],
    ["lifecycleAnalytics", "segmentId"],
    ["socialAnalytics", "spaceName"],
    ["socialAnalytics", "circleTitle"],
    ["socialAnalytics", "displayName"],
    ["socialAnalytics", "targetUid"],
    ["socialAnalytics", "userId"],
    ["settingsAnalytics", "shoeName"],
    // An identifier in a module that has not said what it identifies.
    ["foodAnalytics", "favouriteKey"],
    ["historyAnalytics", "exerciseId"],
  ])("refuses %s.%s", (module, key) => {
    expect(typedProblem(module, key)).not.toBeNull();
  });

  it.each([
    ["socialAnalytics", "challengeId"],
    ["socialAnalytics", "circleType"],
    ["paywallAnalytics", "featureKey"],
    ["historyAnalytics", "binKey"],
    ["homeAnalytics", "typed"],
    ["foodAnalytics", "fromPantry"],
    ["foodAnalytics", "useCount"],
    ["lifecycleAnalytics", "hint"],
    ["lifecycleAnalytics", "step"],
  ])("allows %s.%s", (module, key) => {
    expect(typedProblem(module, key)).toBeNull();
  });
});
