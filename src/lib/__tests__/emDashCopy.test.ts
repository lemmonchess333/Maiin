/**
 * No em dash on screen (DS11 call 2, owner, 23 November 2026).
 *
 * Designers read the "statement — explanation" rhythm as machine-written,
 * so the app shows none. Every string literal, template and JSX text node
 * under src/ is read through the TypeScript parser; any em dash in one
 * fails, with the few exceptions below. Comments are not copy and are not
 * read.
 *
 * What a sentence takes instead: a full stop between two statements
 * ("Couldn't save. Check your connection and try again."), a colon before
 * what a label introduces ("Today: Full Pro access"), the middot between a
 * thing and its detail ("Pro trial · 5 days left"), "so" for a cause and
 * "with" for a detail.
 *
 * The exceptions, each because it is not copy a person reads:
 *  - a literal that is the dash alone ("—"), the figure a stat shows when
 *    it has no value;
 *  - text passed to `logger` or `console`, which only a developer reads;
 *  - the stored names the programme generator gives its days, which key a
 *    person's saved plan, and the saved workout's notes format that
 *    `workoutTitle` reads up to its first dash. Neither is shown whole:
 *    `liftDayLabel.ts` names the day on screen;
 *  - the spoken run cues (`runCueCopy.ts`), which are heard, not read;
 *  - the performance bullets (`performanceEngine.ts`), the server's copy
 *    kept for its tests, which no screen shows;
 *  - the developer labs under `pages/dev/` and the art prompts in
 *    `formArtProduction.ts`.
 * A stored string written before this rule, kept only to recognise old
 * data, spells its dash as an escape (`—`) and so is not counted.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "tinyglobby";
import ts from "typescript";

const SRC = join(process.cwd(), "src");
const DASH = "—";
const ENTITY = /&mdash;|&#8212;|&#x2014;/gi;

/** Files read whole as not-on-screen, from src/. */
const EXEMPT_FILES = [
  "lib/runCueCopy.ts",
  "lib/performanceEngine.ts",
  "lib/formArtProduction.ts",
];

/** Exact literal texts that are stored keys, not copy. */
const STORED_KEYS = new Set([
  "Full Body — Squat Focus",
  "Full Body — Deadlift Focus",
  "Full Body — Posterior Focus",
  "Upper — Chest & Back",
  "Upper — Shoulders & Arms",
  "Lower — Squat Focus",
  "Lower — Deadlift Focus",
  "Push — Chest Focus",
  "Push — Shoulder Focus",
  "Pull — Lat Focus",
  "Pull — Row Focus",
  "Legs — Squat Focus",
  "Legs — Deadlift Focus",
  // A saved workout's notes: "<day> — Programme Week <n>".
  " — Programme Week ",
  " — ",
]);

function isLogCall(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const callee = p.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        ["logger", "console"].includes(callee.expression.text)
      )
        return true;
    }
  }
  return false;
}

/** The em dashes a file shows: each literal or JSX text that carries one,
 *  with its line. */
export function emDashCopy(text: string, fileName = "file.tsx"): string[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    let raw: string | null = null;
    let cooked = "";
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      raw = node.getText(source);
      cooked = node.text;
    } else if (ts.isJsxText(node)) {
      // JSX text keeps its entities, so "&mdash;" counts as the dash.
      raw = node.getText(source).replace(ENTITY, DASH);
      cooked = node.text.replace(ENTITY, DASH);
    }
    if (
      raw !== null &&
      raw.includes(DASH) &&
      cooked.trim() !== DASH &&
      !STORED_KEYS.has(cooked) &&
      !isLogCall(node)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      found.push(`${String(line + 1)}: ${cooked.trim().slice(0, 80)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function sourceFiles(): string[] {
  return globSync("**/*.{ts,tsx}", {
    cwd: SRC,
    ignore: [
      "**/__tests__/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.d.ts",
      "test/**",
      "pages/dev/**",
      ...EXEMPT_FILES,
    ],
  });
}

describe("no em dash on screen", () => {
  // Parses every source file, which takes a while on a busy runner.
  it(
    "no string, template or JSX text under src/ carries one",
    { timeout: 60_000 },
    () => {
      const files = sourceFiles();
      expect(
        files.some((f) => f.endsWith("runSessionExplainer.ts")),
        "the scan reads no copy modules, so its total proves nothing"
      ).toBe(true);
      const hits = files.flatMap((f) =>
        emDashCopy(readFileSync(join(SRC, f), "utf8"), f).map(
          (hit) => `src/${f}:${hit}`
        )
      );
      expect(
        hits,
        "Use a full stop between two statements, a colon before what a " +
          "label introduces, or the middot between a thing and its detail."
      ).toEqual([]);
    }
  );

  it("finds a dash in copy and passes over the exceptions (the measure is not vacuous)", () => {
    expect(emDashCopy('const a = "Week 1 — building";')).toHaveLength(1);
    expect(emDashCopy("const a = `Saved — ${n} sets`;")).toHaveLength(1);
    expect(
      emDashCopy("const a = <p>Rest day — you are adapting</p>;")
    ).toHaveLength(1);
    expect(emDashCopy("/* a comment — with a dash */")).toHaveLength(0);
    expect(emDashCopy("// a line comment — with a dash")).toHaveLength(0);
    expect(emDashCopy("const a = <p>Saved &mdash; synced</p>;")).toHaveLength(
      1
    );
    expect(emDashCopy("const a = <span>&mdash;</span>;")).toHaveLength(0);
    expect(emDashCopy('const a = "—";')).toHaveLength(0);
    expect(emDashCopy('logger.warn("[x] failed — retrying");')).toHaveLength(0);
    expect(emDashCopy('const a = "Push — Chest Focus";')).toHaveLength(0);
    expect(emDashCopy('const a = " \\u2014 legacy tail";')).toHaveLength(0);
    expect(emDashCopy('const a = "no dash here";')).toHaveLength(0);
  });
});
