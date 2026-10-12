/**
 * A press eases into its scale rather than jumping to it (DESIGN_GUIDE §8:
 * scale 0.97 on :active over 150ms).
 *
 * Tailwind v4 writes `active:scale-*` as the `scale` property, not
 * `transform`, so the press eases only when the element's transition
 * lists `scale`. Two things set that list:
 *
 * - On a `button` or `[role="button"]`, index.css's own transition rule.
 *   It is unlayered and Tailwind's utilities sit in `@layer utilities`,
 *   so it beats any `transition-*` class on a button. It has to list
 *   `scale`.
 * - On anything else, a link or a div, the element's class.
 *   `transition`, `transition-all` and `transition-transform` list
 *   scale; `transition-colors`, `transition-opacity`, `transition-shadow`
 *   and a list like `transition-[color,transform]` do not.
 *
 * The class rule holds for buttons too. A class string cannot say which
 * element it lands on (a shared constant, a helper, `buttonClasses` on a
 * Link), and the class keeps the press easing if the button rule ever
 * moves into a layer.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const srcRoot = resolve(repoRoot, "src");

/** `active:scale-95`, `motion-safe:active:scale-[0.97]`,
 *  `group-active:scale-90`, … */
const PRESS = /active:scale-/;
/** A transition-property utility, whatever its variants. */
const TRANSITION =
  /^(?:\S*:)?transition(?:-(?:all|colors|opacity|shadow|transform|none)|-\[[^\]]+\])?$/;
/** One whose list holds `scale`, always or behind `motion-safe:`. */
const EASES_SCALE =
  /^(?:motion-safe:)?transition(?:-all|-transform|-\[[^\]]*\bscale\b[^\]]*\])?$/;

const CLASS_FNS = new Set(["cn", "clsx", "twMerge"]);
const LOGICAL = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

/** The class tokens in a string or a piece of a template; null for any
 *  other node. */
function tokensOf(node: ts.Node): string[] | null {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  )
    return node.text.split(/\s+/).filter(Boolean);
  return null;
}

/** Whether `parent` folds `child` into the same class list: a cn()
 *  argument, an array joined into one string, a template, a ternary's
 *  arm, either side of `&&` / `||` / `??` / `+`. */
function joinsClasses(parent: ts.Node, child: ts.Node): boolean {
  if (ts.isConditionalExpression(parent)) return child !== parent.condition;
  if (ts.isBinaryExpression(parent))
    return (
      LOGICAL.has(parent.operatorToken.kind) ||
      parent.operatorToken.kind === ts.SyntaxKind.PlusToken
    );
  if (ts.isCallExpression(parent)) {
    const callee = parent.expression;
    return (
      (ts.isIdentifier(callee) && CLASS_FNS.has(callee.text)) ||
      (ts.isPropertyAccessExpression(callee) && callee.name.text === "join")
    );
  }
  if (ts.isPropertyAccessExpression(parent)) return parent.name.text === "join";
  return (
    ts.isArrayLiteralExpression(parent) ||
    ts.isTemplateExpression(parent) ||
    ts.isTemplateSpan(parent) ||
    ts.isParenthesizedExpression(parent) ||
    ts.isAsExpression(parent) ||
    ts.isSatisfiesExpression(parent) ||
    ts.isSpreadElement(parent)
  );
}

/** The whole expression that builds one element's classes around `node`:
 *  a className attribute's value, or a constant's, a helper's return, an
 *  object's value. */
function classExpression(node: ts.Node): ts.Node {
  let n = node;
  while (n.parent && joinsClasses(n.parent, n)) n = n.parent;
  return n;
}

/** The conditional arms `node` sits in below `root`: which side of each
 *  ternary, and the right of each `&&` / `||` / `??`. */
function armsOf(node: ts.Node, root: ts.Node): Map<ts.Node, ts.Node> {
  const arms = new Map<ts.Node, ts.Node>();
  for (let n = node; n !== root; n = n.parent) {
    const p = n.parent;
    if (
      ts.isConditionalExpression(p) ||
      (ts.isBinaryExpression(p) &&
        LOGICAL.has(p.operatorToken.kind) &&
        n === p.right)
    )
      arms.set(p, n);
  }
  return arms;
}

/** The strings under `root` that can hold classes. A ternary's test and
 *  the left of `&&` are conditions, not classes. */
function classPieces(root: ts.Node): ts.Node[] {
  const pieces: ts.Node[] = [];
  const visit = (n: ts.Node) => {
    if (tokensOf(n)) pieces.push(n);
    if (ts.isConditionalExpression(n)) {
      visit(n.whenTrue);
      visit(n.whenFalse);
    } else if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      visit(n.right);
    } else ts.forEachChild(n, visit);
  };
  visit(root);
  return pieces;
}

/**
 * Why the press in `press` jumps, or null when it eases. The transition
 * has to be there whenever the press is: one that only some of the
 * press's states carry (another ternary arm, a `cond &&`) does not count.
 * And nothing that can sit beside the press may name a transition that
 * leaves scale out: cn() keeps only the last transition class, and
 * without cn() the stylesheet's order picks one.
 */
function whyItJumps(press: ts.Node): string | null {
  const root = classExpression(press);
  const pressArms = armsOf(press, root);
  let eased = false;
  for (const piece of classPieces(root)) {
    const arms = [...armsOf(piece, root)];
    const always = arms.every(([at, arm]) => pressArms.get(at) === arm);
    const together = arms.every(
      ([at, arm]) =>
        !ts.isConditionalExpression(at) ||
        !pressArms.has(at) ||
        pressArms.get(at) === arm
    );
    for (const token of tokensOf(piece)!) {
      if (!TRANSITION.test(token)) continue;
      if (!EASES_SCALE.test(token)) {
        if (together) return `\`${token}\` leaves scale out`;
      } else if (always) eased = true;
    }
  }
  return eased ? null : "no transition that lists scale";
}

/** Every press in one file's source, with why it jumps when it does. */
function pressesIn(fileName: string, text: string) {
  const sf = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const found: { line: number; press: string; problem: string | null }[] = [];
  const visit = (node: ts.Node) => {
    const press = tokensOf(node)?.find((t) => PRESS.test(t));
    if (press)
      found.push({
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        press,
        problem: whyItJumps(node),
      });
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "test") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** The transition each stylesheet rule for a button sets. */
function buttonTransitions(): { selector: string; transition: string }[] {
  const sheets = [
    resolve(srcRoot, "index.css"),
    ...readdirSync(resolve(srcRoot, "styles"))
      .filter((name) => name.endsWith(".css"))
      .map((name) => resolve(srcRoot, "styles", name)),
  ];
  const rules: { selector: string; transition: string }[] = [];
  for (const sheet of sheets) {
    const css = readFileSync(sheet, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, selector, body] of css.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
      const forButton = selector
        .split(",")
        .some((s) => /^\s*(?:button|\[role="button"\])/.test(s));
      const transition = body.match(
        /(?:^|;)\s*transition(?:-property)?\s*:([^;]*)/
      )?.[1];
      if (forButton && transition)
        rules.push({
          selector: selector.trim().replace(/\s+/g, " "),
          transition,
        });
    }
  }
  return rules;
}

describe("a press eases into its scale", () => {
  it("every stylesheet transition for a button lists scale", () => {
    const rules = buttonTransitions();
    // The global rule has to be found, or this proves nothing.
    expect(rules.map((r) => r.selector)).toContain('button, [role="button"]');
    const leaveScaleOut = rules
      .filter((r) => !/\b(?:scale|all)\b/.test(r.transition))
      .map((r) => r.selector);
    expect(
      leaveScaleOut,
      "These rules outrank every Tailwind class on a button, so a button's " +
        "`active:scale-*` press jumps unless the rule lists `scale`:\n" +
        leaveScaleOut.join("\n")
    ).toEqual([]);
  });

  it("every press comes with a transition that lists scale", () => {
    let presses = 0;
    const offenders: string[] = [];
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("active:scale-")) continue;
      for (const { line, press, problem } of pressesIn(file, text)) {
        presses++;
        if (problem)
          offenders.push(
            `${relative(repoRoot, file)}:${line} ${press}: ${problem}`
          );
      }
    }
    // The scan has to be finding the presses, or it proves nothing.
    expect(presses).toBeGreaterThan(100);
    expect(
      offenders,
      "`active:scale-*` sets the `scale` property. Give the same class " +
        "expression `transition` (colours and scale), `transition-transform` " +
        "or a list naming `scale`, and drop any transition class that " +
        "leaves it out:\n" +
        offenders.join("\n")
    ).toEqual([]);
  });

  // The scan reads class expressions the way the app builds them.
  const cases: [source: string, problem: string | null][] = [
    ['<b className="transition active:scale-95" />', null],
    ['<b className="active:scale-95 motion-safe:transition" />', null],
    ['<b className="active:scale-95 transition-[opacity,scale]" />', null],
    [
      '<b className="transition-colors active:scale-95" />',
      "`transition-colors` leaves scale out",
    ],
    [
      '<b className="active:scale-95 transition-[color,transform]" />',
      "`transition-[color,transform]` leaves scale out",
    ],
    [
      '<b className="motion-safe:transition-colors motion-safe:active:scale-95" />',
      "`motion-safe:transition-colors` leaves scale out",
    ],
    ['<b className="active:scale-95" />', "no transition that lists scale"],
    [
      '<b className={cn("active:scale-95", on ? "bg-a" : "bg-b", "transition")} />',
      null,
    ],
    [
      // cn() keeps the last transition class, so the colours win.
      '<b className={cn("transition active:scale-95", "transition-colors")} />',
      "`transition-colors` leaves scale out",
    ],
    [
      '<b className={cn("active:scale-95", on && "transition")} />',
      "no transition that lists scale",
    ],
    [
      '<b className={on ? "active:scale-95 transition" : "transition-colors"} />',
      null,
    ],
    [
      '<b className={`p-4${on ? " active:scale-95 transition-transform" : ""}`} />',
      null,
    ],
    [
      'const BASE = ["active:scale-95", "transition-transform"].join(" ");',
      null,
    ],
    [
      'const pill = (on: boolean) => cn("active:scale-95 transition-colors", on && "bg-a");',
      "`transition-colors` leaves scale out",
    ],
  ];
  it.each(cases)("%s", (source, problem) => {
    expect(pressesIn("fixture.tsx", source).map((p) => p.problem)).toEqual([
      problem,
    ]);
  });
});
