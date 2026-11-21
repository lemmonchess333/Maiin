#!/usr/bin/env node
/**
 * Which REVIEW.md items does this change trigger, and which gate files
 * does it edit?
 *
 *   node scripts/review-triggers.mjs [--base <ref>] [--head <ref>] [--json]
 *   node scripts/review-triggers.mjs --gates [--base <ref>] [--head <ref>] [--github]
 *
 * Add `--allow-own-copy` only on the change that adds REVIEW.md or the
 * gate manifest: without it, a base that lacks either is an error.
 *
 * REVIEW.md is a checklist whose items each carry a trigger that can be
 * read from a diff. A reviewer runs only the items whose triggers match.
 * The checklist and the gate-file manifest are read from the BASE commit
 * (`git show <base>:REVIEW.md`), never from the change under review: a
 * check the change can edit is a check the change can switch off. Only
 * when the base has no copy yet (the change that adds the file) is the
 * working tree's copy used, and only with `--allow-own-copy`.
 *
 * This file is deliberately self-contained (node built-ins only, no local
 * imports), so the base's copy of it can be run from a temporary file:
 *
 *   git show <base>:scripts/review-triggers.mjs > /tmp/rt.mjs
 *   node /tmp/rt.mjs --base <base>
 *
 * which is what to do when a change edits this script, and what
 * `.github/workflows/guards-from-base.yml` does.
 *
 * `--base` defaults to `git merge-base HEAD origin/main`. CI's checkouts
 * are shallow unless they ask otherwise, so pass the base sha there.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REVIEW_PATH = "REVIEW.md";
export const GATE_MANIFEST_PATH = ".github/gate-files.txt";
export const SELF_PATH = "scripts/review-triggers.mjs";

/* ------------------------------------------------------------------ */
/* Globs                                                               */
/* ------------------------------------------------------------------ */

/**
 * A glob as a RegExp over a repo-relative path. `**` spans directories
 * (`a/**\/b` also matches `a/b`), `*` and `?` stay inside one segment,
 * `{x,y}` is alternation. Nothing else is special.
 */
const globCache = new Map();

export function globToRegExp(glob) {
  const cached = globCache.get(glob);
  if (cached) return cached;
  let re = "";
  let i = 0;
  let braces = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slashAfter = glob[i + 2] === "/";
        re += slashAfter ? "(?:.*/)?" : ".*";
        i += slashAfter ? 3 : 2;
        continue;
      }
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      braces += 1;
      re += "(?:";
    } else if (c === "}" && braces > 0) {
      braces -= 1;
      re += ")";
    } else if (c === "," && braces > 0) {
      re += "|";
    } else {
      re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
    }
    i += 1;
  }
  const compiled = new RegExp(`^${re}$`);
  globCache.set(glob, compiled);
  return compiled;
}

export function matchesAny(path, globs) {
  return globs.some((g) => globToRegExp(g).test(path));
}

/* ------------------------------------------------------------------ */
/* REVIEW.md                                                           */
/* ------------------------------------------------------------------ */

const KEYWORDS = new Set([
  "paths",
  "not",
  "added",
  "removed",
  "deleted",
  "mirrored",
  "gate-files",
]);
/** Keywords that take no values. */
const FLAGS = {
  deleted: "deleted",
  mirrored: "mirrored",
  "gate-files": "gateFiles",
};

/**
 * A trigger line is keywords and backticked values, in order:
 *   paths `src/**` `e2e/**`; not `**\/__tests__/**`; added `re`; deleted
 * Values belong to the keyword before them. Separators (`;`, `,`) and any
 * other bare words are ignored, so a regex may hold `;` freely; it may not
 * hold a backtick (write `\x60`).
 *
 * Two keywords name files without globs, from lists the base keeps:
 * `mirrored` (a client module some `.cross.test.ts` imports: a rule with a
 * server copy) and `gate-files` (a file `.github/gate-files.txt` names).
 */
export function parseTrigger(text) {
  const trigger = {
    paths: [],
    not: [],
    added: [],
    removed: [],
    deleted: false,
    mirrored: false,
    gateFiles: false,
  };
  let current = null;
  let i = 0;
  while (i < text.length) {
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end === -1) throw new Error(`Unclosed backtick in trigger: ${text}`);
      const value = text.slice(i + 1, end);
      if (!current || current in FLAGS)
        throw new Error(`Value \`${value}\` has no keyword before it`);
      trigger[current].push(value);
      i = end + 1;
      continue;
    }
    const word = text.slice(i).match(/^[A-Za-z-]+/);
    if (word) {
      if (KEYWORDS.has(word[0])) {
        current = word[0];
        if (current in FLAGS) trigger[FLAGS[current]] = true;
      }
      i += word[0].length;
      continue;
    }
    i += 1;
  }
  if (trigger.paths.length === 0 && !trigger.mirrored && !trigger.gateFiles)
    throw new Error(`Trigger names no paths: ${text}`);
  return trigger;
}

/** `/source/flags` or a bare source. */
export function toRegExp(value) {
  const slashed = value.match(/^\/(.*)\/([a-z]*)$/s);
  return slashed ? new RegExp(slashed[1], slashed[2]) : new RegExp(value);
}

/**
 * Items are `### R01. Title` headings followed by one or more
 * `- **Trigger:**` bullets (any one matching triggers the item), then
 * `- **Check:**` and `- **Behind:**` (a bullet may wrap onto indented
 * lines). `#` and `##` headings are prose. A `###` heading that is not an
 * item heading is an error, so a typo cannot silently drop an item.
 */
export function parseReview(markdown) {
  const items = [];
  let item = null;
  let field = null;
  const flush = () => {
    if (item) items.push(item);
    item = null;
    field = null;
  };
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (/^###\s/.test(line)) {
      const heading = line.match(/^###\s+(R\d{2,3})\.\s+(\S.*?)\s*$/);
      if (!heading)
        throw new Error(
          `Malformed item heading (want "### R01. Title"): ${line.trim()}`
        );
      flush();
      item = {
        id: heading[1],
        title: heading[2],
        triggers: [],
        check: "",
        behind: "",
      };
      continue;
    }
    if (/^#{1,2}\s/.test(line)) {
      flush();
      continue;
    }
    if (!item) continue;
    const bullet = line.match(/^- \*\*(Trigger|Check|Behind):\*\*\s*(.*)$/);
    if (bullet) {
      field = bullet[1].toLowerCase();
      if (field === "trigger") item.triggers.push(bullet[2].trim());
      else item[field] = bullet[2].trim();
      continue;
    }
    if (/^- \*\*\w+:?\*\*/.test(line))
      throw new Error(`${item.id}: unknown field ${line.trim().slice(0, 40)}`);
    if (field && /^\s+\S/.test(line)) {
      if (field === "trigger")
        item.triggers[item.triggers.length - 1] += ` ${line.trim()}`;
      else item[field] += ` ${line.trim()}`;
      continue;
    }
    if (line.trim() === "") field = null;
  }
  flush();
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.id)) throw new Error(`${it.id} appears twice`);
    seen.add(it.id);
    if (it.triggers.length === 0) throw new Error(`${it.id} has no Trigger`);
    if (!it.check) throw new Error(`${it.id} has no Check`);
    if (!it.behind) throw new Error(`${it.id} has no Behind`);
    it.triggerSpecs = it.triggers.map((t) => {
      const spec = parseTrigger(t);
      spec.regex = {
        added: spec.added.map(toRegExp),
        removed: spec.removed.map(toRegExp),
      };
      return spec;
    });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* Diffs                                                               */
/* ------------------------------------------------------------------ */

function unquote(p) {
  if (p.startsWith('"') && p.endsWith('"')) {
    return p.slice(1, -1).replace(/\\(.)/g, "$1");
  }
  return p;
}

/**
 * `git diff --unified=0 -M` text as files with their added and removed
 * lines (new-side and old-side line numbers). Binary files carry no lines.
 */
export function parseDiff(text) {
  const files = [];
  let file = null;
  let oldLine = 0;
  let newLine = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      file = { path: null, oldPath: null, status: "M", added: [], removed: [] };
      files.push(file);
      continue;
    }
    if (!file) continue;
    if (line.startsWith("new file mode")) file.status = "A";
    else if (line.startsWith("deleted file mode")) file.status = "D";
    else if (line.startsWith("rename from ")) {
      file.status = "R";
      file.oldPath = unquote(line.slice("rename from ".length));
    } else if (line.startsWith("rename to ")) {
      file.path = unquote(line.slice("rename to ".length));
    } else if (line.startsWith("--- ")) {
      const p = unquote(line.slice(4));
      if (p !== "/dev/null") file.oldPath = p.replace(/^a\//, "");
    } else if (line.startsWith("+++ ")) {
      const p = unquote(line.slice(4));
      if (p !== "/dev/null") file.path = p.replace(/^b\//, "");
    } else if (line.startsWith("@@")) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLine = Number(m[1]);
        newLine = Number(m[2]);
      }
    } else if (line.startsWith("+")) {
      file.added.push({ line: newLine, text: line.slice(1) });
      newLine += 1;
    } else if (line.startsWith("-")) {
      file.removed.push({ line: oldLine, text: line.slice(1) });
      oldLine += 1;
    } else if (line.startsWith("Binary files ")) {
      const m = line.match(
        /^Binary files (?:a\/)?(.+?) and (?:b\/)?(.+?) differ$/
      );
      if (m) {
        if (m[1] !== "/dev/null") file.oldPath = m[1];
        if (m[2] !== "/dev/null") file.path = m[2];
      }
    }
  }
  for (const f of files) {
    if (!f.path) f.path = f.oldPath;
    if (f.status === "D") f.path = f.oldPath;
    if (!f.oldPath) f.oldPath = f.path;
  }
  return files.filter((f) => f.path);
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

const MAX_EVIDENCE = 5;

/** REVIEW.md never triggers an item: its own regexes would match it. */
export function isExempt(path) {
  return path === REVIEW_PATH;
}

/**
 * Whether a path is one a trigger names: by its globs, or as a mirrored
 * module or a gate file (from `context`, which the CLI fills from the base).
 */
function pathPasses(spec, path, context) {
  if (!path || matchesAny(path, spec.not)) return false;
  if (matchesAny(path, spec.paths)) return true;
  if (spec.mirrored && context.mirrored?.has(path)) return true;
  if (spec.gateFiles && matchesAny(path, context.gateGlobs ?? [])) return true;
  return false;
}

function specEvidence(spec, f, context) {
  const evidence = [];
  const candidate = pathPasses(spec, f.path, context)
    ? f.path
    : f.status !== "A" && pathPasses(spec, f.oldPath, context)
      ? f.oldPath
      : null;
  if (!candidate) return evidence;
  const hasLineConditions =
    spec.regex.added.length > 0 || spec.regex.removed.length > 0;
  if (!hasLineConditions && !spec.deleted) {
    evidence.push({ file: candidate, line: null, kind: "changed", text: "" });
  }
  if (
    spec.deleted &&
    (f.status === "D" ||
      (f.status === "R" && pathPasses(spec, f.oldPath, context)))
  ) {
    evidence.push({
      file: f.oldPath,
      line: null,
      kind: f.status === "D" ? "deleted" : "renamed",
      text: f.path,
    });
  }
  for (const [kind, lines, res] of [
    ["added", f.added, spec.regex.added],
    ["removed", f.removed, spec.regex.removed],
  ]) {
    if (res.length === 0) continue;
    for (const l of lines) {
      if (!res.some((re) => re.test(l.text))) continue;
      evidence.push({
        file: kind === "removed" ? f.oldPath : f.path,
        line: l.line,
        kind,
        text: l.text.trim(),
      });
      if (evidence.length >= MAX_EVIDENCE) return evidence;
    }
  }
  return evidence;
}

/**
 * The items a change triggers, each with the evidence that matched it
 * (file, line, the line's text). An item matches when any of its triggers
 * does. A trigger with no line or deletion condition matches any changed
 * file it names. `context.mirrored` (a Set of paths) and
 * `context.gateGlobs` feed the `mirrored` and `gate-files` keywords.
 */
export function matchItems(items, files, context = {}) {
  const hits = [];
  for (const item of items) {
    const evidence = [];
    for (const f of files) {
      if (isExempt(f.path) || isExempt(f.oldPath)) continue;
      for (const spec of item.triggerSpecs) {
        evidence.push(...specEvidence(spec, f, context));
        if (evidence.length >= MAX_EVIDENCE) break;
      }
      if (evidence.length >= MAX_EVIDENCE) break;
    }
    if (evidence.length > 0) {
      hits.push({
        id: item.id,
        title: item.title,
        check: item.check,
        behind: item.behind,
        evidence: evidence.slice(0, MAX_EVIDENCE),
      });
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/* Mirrored modules                                                    */
/* ------------------------------------------------------------------ */

/**
 * The client modules the `.cross.test.ts` files import: the rules that
 * have a server copy pinned against them (ADR-0008). `files` is every path
 * in the tree (to resolve an import's extension); `read(path)` returns a
 * cross test's text. Test helpers (`__tests__`, `src/test`) and
 * type-only imports are left out.
 */
export function mirroredModules(files, read) {
  const all = new Set(files);
  const modules = new Set();
  for (const test of files.filter((f) => /\.cross\.test\.tsx?$/.test(f))) {
    // A type-only import pins no behaviour, so it names no mirror.
    const text = read(test).replace(
      /\bimport\s+type\s+\{[^}]*\}\s*from\s+["'][^"']+["']/g,
      ""
    );
    for (const m of text.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      const spec = m[1];
      let p;
      if (spec.startsWith("@/")) p = `src/${spec.slice(2)}`;
      else if (spec.startsWith(".")) p = joinPath(dirOf(test), spec);
      else continue;
      const found = [p, `${p}.ts`, `${p}.tsx`, `${p}/index.ts`].find(
        (c) => all.has(c) && /\.tsx?$/.test(c)
      );
      if (
        !found ||
        /(^|\/)__tests__\//.test(found) ||
        found.startsWith("src/test/")
      )
        continue;
      modules.add(found);
    }
  }
  return modules;
}

function dirOf(path) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function joinPath(dir, rel) {
  const parts = dir ? dir.split("/") : [];
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/* ------------------------------------------------------------------ */
/* Gate files                                                          */
/* ------------------------------------------------------------------ */

/**
 * The manifest: one glob per line, `#` starts a comment. A line starting
 * `run ` is a rule test whose base copy is also run against the change.
 */
export function parseGateManifest(text) {
  const entries = text
    .split("\n")
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .map((l) => {
      const run = /^run\s+/.test(l);
      return { glob: run ? l.replace(/^run\s+/, "") : l, run };
    });
  return {
    globs: entries.map((e) => e.glob),
    runGlobs: entries.filter((e) => e.run).map((e) => e.glob),
  };
}

/**
 * The changed files the manifest names, and `tests`: the edited `run`
 * files that existed at the base, whose base copies are run against the
 * change's code.
 */
export function gateFilesTouched(manifest, files, existsAtBase) {
  const touched = [];
  const tests = new Set();
  for (const f of files) {
    const names = [...new Set([f.oldPath, f.path])];
    const hit = names.find((p) => matchesAny(p, manifest.globs));
    if (!hit) continue;
    touched.push({ path: hit, status: f.status });
    for (const p of names) {
      if (matchesAny(p, manifest.runGlobs) && existsAtBase(p)) tests.add(p);
    }
  }
  return { touched, tests: [...tests] };
}

/* ------------------------------------------------------------------ */
/* Reading from the base                                               */
/* ------------------------------------------------------------------ */

function defaultGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Whether `path` is in `ref`'s tree. A missing path is `false`; a ref git
 * cannot read is an error, never "missing".
 */
export function existsAt(ref, path, git = defaultGit) {
  return git(["ls-tree", "--name-only", ref, "--", path]).trim() === path;
}

/**
 * A file's text at the base. When the base has no copy, the working tree's
 * copy is used only with `allowOwnCopy` (the change that adds the file),
 * and then with `source: "working-tree"` and a warning to print. Any other
 * git failure is an error, not a reason to fall back.
 */
export function readFromBase(
  path,
  base,
  {
    git = defaultGit,
    readWorkingTree = (p) => readFileSync(resolve(process.cwd(), p), "utf8"),
    workingTreeHas = (p) => existsSync(resolve(process.cwd(), p)),
    allowOwnCopy = false,
  } = {}
) {
  if (existsAt(base, path, git)) {
    return {
      text: git(["show", `${base}:${path}`]),
      source: "base",
      warning: null,
    };
  }
  if (!workingTreeHas(path)) {
    throw new Error(`${path} is neither on ${base} nor in the working tree.`);
  }
  if (!allowOwnCopy) {
    throw new Error(
      `${path} is not on the base (${base}), so the only copy is the one this ` +
        `change can edit. Only the change that adds ${path} should be judged ` +
        `by its own copy: rerun with --allow-own-copy if this is that change.`
    );
  }
  return {
    text: readWorkingTree(path),
    source: "working-tree",
    warning:
      `WARNING: ${path} is not on the base (${base}). This change is being ` +
      `judged by its own copy from the working tree, which it can edit. ` +
      `That is expected only for the change that adds ${path}.`,
  };
}

/** The mirrored client modules as the base has them. */
function mirroredAtBase(base, git) {
  const files = git(["ls-tree", "-r", "--name-only", base, "--", "src"])
    .split("\n")
    .filter(Boolean);
  return mirroredModules(files, (p) => git(["show", `${base}:${p}`]));
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = {
    base: null,
    head: "HEAD",
    json: false,
    gates: false,
    github: false,
    allowOwnCopy: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--head") args.head = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--gates") args.gates = true;
    else if (a === "--github") args.github = true;
    else if (a === "--allow-own-copy") args.allowOwnCopy = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function resolveBase(base, git) {
  if (base) return git(["rev-parse", "--verify", `${base}^{commit}`]).trim();
  try {
    return git(["merge-base", "HEAD", "origin/main"]).trim();
  } catch {
    throw new Error(
      "No --base given and origin/main is not available (a shallow checkout?). " +
        "Pass --base <sha>, e.g. the pull request's base sha."
    );
  }
}

function diffFiles(base, head, git) {
  const text = git([
    "-c",
    "core.quotePath=false",
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--unified=0",
    "-M",
    `${base}...${head}`,
  ]);
  return parseDiff(text);
}

function edits(files, path) {
  return files.some((f) => f.path === path || f.oldPath === path);
}

function printItems(hits, total, meta) {
  const out = [];
  out.push(
    `REVIEW.md read from ${meta.source === "base" ? `the base, ${meta.base.slice(0, 12)}` : "the WORKING TREE"}.`
  );
  out.push(
    `${hits.length} of ${total} items match ${meta.base.slice(0, 12)}...${meta.head}.`
  );
  for (const h of hits) {
    out.push("");
    out.push(`${h.id}. ${h.title}`);
    for (const e of h.evidence) {
      const where = e.line ? `${e.file}:${e.line}` : e.file;
      const mark =
        e.kind === "added" ? "+" : e.kind === "removed" ? "-" : e.kind;
      out.push(`  ${where}  ${mark} ${e.text.slice(0, 110)}`);
    }
    out.push(`  Check: ${h.check}`);
  }
  return out.join("\n");
}

/** `name<<DELIM` lines, so a list survives as one path per line. */
function githubOutput(name, lines) {
  const delim = `EOF_${name.toUpperCase()}_${Date.now()}`;
  return `${name}<<${delim}\n${lines.join("\n")}\n${delim}\n`;
}

export function main(argv = process.argv.slice(2), git = defaultGit) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
    return 0;
  }
  const base = resolveBase(args.base, git);
  const files = diffFiles(base, args.head, git);
  const warnings = [];
  const notes = [];
  if (edits(files, SELF_PATH) && existsAt(base, SELF_PATH, git)) {
    warnings.push(
      `WARNING: this change edits ${SELF_PATH}. To judge it with the base's copy: ` +
        `git show ${base.slice(0, 12)}:${SELF_PATH} > /tmp/rt.mjs && node /tmp/rt.mjs --base ${base.slice(0, 12)}`
    );
  }
  const readOpts = { git, allowOwnCopy: args.allowOwnCopy };
  const manifest = readFromBase(GATE_MANIFEST_PATH, base, readOpts);
  if (manifest.warning) warnings.push(manifest.warning);
  const gateManifest = parseGateManifest(manifest.text);

  if (args.gates) {
    const result = gateFilesTouched(gateManifest, files, (p) =>
      existsAt(base, p, git)
    );
    for (const w of warnings) console.error(w);
    if (args.github) {
      for (const w of warnings) console.log(`::warning::${w}`);
      for (const t of result.touched) {
        console.log(
          `::warning file=${t.path}::This change edits a gate file listed in ${GATE_MANIFEST_PATH}. A check the change can edit is a check it can switch off: review this file's diff on its own.`
        );
      }
      const summary = process.env.GITHUB_STEP_SUMMARY;
      if (summary) {
        const lines = ["## Gate files this change edits", ""];
        lines.push(
          `Manifest read from ${manifest.source === "base" ? `the base (${base.slice(0, 12)})` : "the pull request (the base has none yet)"}.`,
          ""
        );
        if (result.touched.length === 0) lines.push("None.");
        for (const t of result.touched)
          lines.push(`- \`${t.path}\` (${t.status})`);
        lines.push(
          "",
          result.tests.length
            ? `Base copies to run against this change: ${result.tests.map((t) => `\`${t}\``).join(", ")}.`
            : "No gate test file to run from the base."
        );
        appendFileSync(summary, `${lines.join("\n")}\n`);
      }
      const output = process.env.GITHUB_OUTPUT;
      if (output) {
        appendFileSync(
          output,
          result.tests.length ? githubOutput("tests", result.tests) : "tests=\n"
        );
      }
    }
    if (args.json)
      console.log(
        JSON.stringify(
          { base, head: args.head, manifestSource: manifest.source, ...result },
          null,
          2
        )
      );
    else if (!args.github) {
      console.log(`${result.touched.length} gate file(s) edited:`);
      for (const t of result.touched) console.log(`  ${t.path} (${t.status})`);
      if (result.tests.length)
        console.log(`Base copies to run: ${result.tests.join(" ")}`);
    }
    return 0;
  }

  const review = readFromBase(REVIEW_PATH, base, readOpts);
  if (review.warning) warnings.push(review.warning);
  if (edits(files, REVIEW_PATH) && review.source === "base") {
    notes.push(
      `This change edits ${REVIEW_PATH}. It is judged by the base's copy; its own items apply from the next change. Review the ${REVIEW_PATH} diff on its own (R38).`
    );
  }
  const items = parseReview(review.text);
  const context = {
    mirrored: mirroredAtBase(base, git),
    gateGlobs: gateManifest.globs,
  };
  const hits = matchItems(items, files, context);
  for (const w of warnings) console.error(w);
  if (args.json) {
    console.log(
      JSON.stringify(
        {
          base,
          head: args.head,
          source: review.source,
          total: items.length,
          notes,
          hits,
        },
        null,
        2
      )
    );
  } else {
    for (const n of notes) console.log(n);
    console.log(
      printItems(hits, items.length, {
        base,
        head: args.head,
        source: review.source,
      })
    );
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 2;
  }
}
