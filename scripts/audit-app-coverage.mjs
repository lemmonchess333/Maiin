/**
 * Code-derived inventory, NOT evidence of browser or artwork approval.
 * Run from the repo root: node scripts/audit-app-coverage.mjs
 * Imports only the local catalogue, rig and templates through Vite's
 * transform layer. No listening server, browser, Firebase or remote fetch.
 * Regenerates this script's inventory; human findings live in WORK_LOG.md.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "docs/improvement-audit/INVENTORY.md");
const cell = (value) =>
  String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const source = ts.createSourceFile(
  "App.tsx",
  readFileSync(resolve(root, "src/App.tsx"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const routes = new Map();
function visit(node) {
  if (
    (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
    node.tagName.getText(source) === "Route"
  ) {
    const attr = node.attributes.properties.find(
      (a) => ts.isJsxAttribute(a) && a.name.getText(source) === "path"
    );
    if (attr?.initializer && ts.isStringLiteral(attr.initializer)) {
      const path = attr.initializer.text;
      const line =
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      routes.set(path, [...(routes.get(path) ?? []), line]);
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { EXERCISES } = await server.ssrLoadModule("/src/lib/exercises.ts");
  const { getFormBeats, getAuthoredBeats, getBodyDemo } =
    await server.ssrLoadModule("/src/lib/bodyRig.ts");
  const { PROGRAM_TEMPLATES } = await server.ssrLoadModule(
    "/src/features/program/templates.ts"
  );
  const usage = new Map();
  for (const template of PROGRAM_TEMPLATES) {
    const ids = new Set(
      template.weeks.flatMap((w) =>
        w.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))
      )
    );
    for (const id of ids) usage.set(id, (usage.get(id) ?? 0) + 1);
  }
  const rows = EXERCISES.map((e) => {
    const beats = getFormBeats(e.id);
    const authored = getAuthoredBeats(e.id);
    const rig = getBodyDemo(e.id);
    const frames = beats?.map((b) => b.image) ?? [];
    const files = frames.map((p) => resolve(root, "public", p));
    const missing = frames.filter((_, i) => !existsSync(files[i]));
    return {
      id: e.id,
      name: e.name,
      equipment: e.equipment,
      usage: usage.get(e.id) ?? 0,
      authored: authored?.length ?? 0,
      frames,
      missing,
      bytes: files.reduce(
        (sum, f) => sum + (existsSync(f) ? statSync(f).size : 0),
        0
      ),
      path: rig
        ? beats
          ? "supplied placard"
          : "rig / alias"
        : e.media?.length
          ? "catalogue media"
          : "reference / diagram fallback",
    };
  }).sort((a, b) => b.usage - a.usage || a.id.localeCompare(b.id));
  const ready = rows.filter(
    (r) =>
      r.path === "supplied placard" &&
      r.frames.length === 6 &&
      r.missing.length === 0
  );
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const lines = [
    "# Tropos coverage inventory",
    "",
    `Generated from local source at ${new Date().toISOString()}; base commit ${commit}.`,
    "Working-tree edits may be present; this is not a claim about a deployed build.",
    "",
    "Regenerate with `node scripts/audit-app-coverage.mjs`. This file is generated; keep review results in WORK_LOG.md.",
    "",
    "## Exercise migration baseline",
    "",
    `- Canonical exercises: ${rows.length}.`,
    `- Reachable six-frame placards with all local files present: ${ready.length}/${rows.length}.`,
    `- Without a reachable complete six-frame placard: ${rows.length - ready.length}/${rows.length}.`,
    `- Supplied frame bytes (not app bundle or per-user download): ${rows.reduce((sum, r) => sum + r.bytes, 0)}.`,
    "- New-standard visual/biomechanical approval: NOT established by this script.",
    "- Template usage = count of distinct built-in templates referencing the canonical ID directly; not production-user frequency or alias equivalence.",
    "- Six files do not prove native resolution, camera consistency, correct physics, caption accuracy or owner approval.",
    "",
    "| Exercise ID | Name | Equipment | Template usage | Render path | Live frames | Authored beats | Missing files | Migration QA |",
    "| --- | --- | --- | ---: | --- | ---: | ---: | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${[
          r.id,
          r.name,
          r.equipment,
          r.usage,
          r.path,
          r.frames.length,
          r.authored,
          r.missing.join(", ") || "—",
          "not reviewed",
        ]
          .map(cell)
          .join(" | ")} |`
    ),
    "",
    "## Supplied frame paths",
    "",
    ...rows
      .filter((r) => r.frames.length)
      .flatMap((r) => [
        `### ${r.id}`,
        "",
        ...r.frames.map((f, i) => `${i + 1}. public/${f}`),
        "",
      ]),
    "## Route inventory — runtime testing blocked",
    "",
    `${routes.size} distinct literal path patterns in App.tsx. Repeated paths are listed once with all declaration lines.`,
    "Wildcard paths cover separate auth/onboarding/redirect states. Dev-only routes and redirects are included, not presumed reachable in production.",
    "This is a route inventory, not the full screen/control denominator. Sheets, nested tabs, menus and conditional states still need discovery.",
    "",
    "| Route pattern | App.tsx declaration lines | Runtime status |",
    "| --- | --- | --- |",
    ...[...routes].map(
      ([path, refs]) => `| ${cell(path)} | ${refs.join(", ")} | not tested |`
    ),
    "",
  ];
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, lines.join("\n"));
  console.log(
    `${output}\n${rows.length} exercises; ${ready.length} complete wired placards; ${routes.size} route patterns.`
  );
} finally {
  await server.close();
}
