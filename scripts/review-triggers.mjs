#!/usr/bin/env node
/**
 * Which REVIEW.md items does this change trigger, and which gate files
 * does it edit?
 *
 *   node scripts/review-triggers.mjs [--base <ref>] [--head <ref>] [--json]
 *   node scripts/review-triggers.mjs --gates [--base <ref>] [--head <ref>] [--github]
 *
 * REVIEW.md is a checklist whose items each carry a trigger that can be
 * read from a diff. A reviewer runs only the items whose triggers match.
 * The checklist and the gate-file manifest are read from the BASE commit
 * (`git show <base>:REVIEW.md`), never from the change under review: a
 * check the change can edit is a check the change can switch off. Only
 * when the base has no copy yet (the change that adds the file) is the
 * working tree's copy used, with a warning saying so.
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

const KEYWORDS = new Set(["paths", "not", "added", "removed", "deleted"]);

/**
 * A trigger line is keywords and backticked values, in order:
 *   paths `src/**` `e2e/**`; not `**\/__tests__/**`; added `re`; deleted
 * Values belong to the keyword before them. Separators (`;`, `,`) and any
 * other bare words are ignored, so a regex may hold `;` freely; it may not
 * hold a backtick (write `\x60`).
 */
export function parseTrigger(text) {
  const trigger = {
    paths: [],
    not: [],
    added: [],
    removed: [],
    deleted: false,
  };
  let current = null;
  let i = 0;
  while (i < text.length) {
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end === -1) throw new Error(`Unclosed backtick in trigger: ${text}`);
      const value = text.slice(i + 1, end);
      if (!current || current === "deleted")
        throw new Error(`Value \`${value}\` has no keyword before it`);
      trigger[current].push(value);
      i = end + 1;
      continue;
    }
    const word = text.slice(i).match(/^[A-Za-z-]+/);
    if (word) {
      if (KEYWORDS.has(word[0])) {
        current = word[0];
        if (current === "deleted") trigger.deleted = true;
      }
      i += word[0].length;
      continue;
    }
    i += 1;
  }
  if (trigger.paths.length === 0)
    throw new Error(`Trigger names no paths: ${text}`);
  return trigger;
}

/** `/source/flags` or a bare source. */
export function toRegExp(value) {
  const slashed = value.match(/^\/(.*)\/([a-z]*)$/s);
  return slashed ? new RegExp(slashed[1], slashed[2]) : new RegExp(value);
}

/**
 * Items are `### R01. Title` headings followed by `- **Trigger:**`,
 * `- **Check:**` and `- **Behind:**` bullets (a bullet may wrap onto
 * indented lines). Anything before the first item, and any heading that is
 * not an item, is prose and ignored.
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
    const heading = line.match(/^###\s+(R\d{2,3})\.\s+(.+?)\s*$/);
    if (heading) {
      flush();
      item = {
        id: heading[1],
        title: heading[2],
        trigger: "",
        check: "",
        behind: "",
      };
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      flush();
      continue;
    }
    if (!item) continue;
    const bullet = line.match(/^- \*\*(Trigger|Check|Behind):\*\*\s*(.*)$/);
    if (bullet) {
      field = bullet[1].toLowerCase();
      item[field] = bullet[2].trim();
      continue;
    }
    if (field && /^\s+\S/.test(line)) {
      item[field] += ` ${line.trim()}`;
      continue;
    }
    if (line.trim() === "") field = null;
  }
  flush();
  for (const it of items) {
    if (!it.trigger) throw new Error(`${it.id} has no Trigger`);
    it.triggerSpec = parseTrigger(it.trigger);
    it.regex = {
      added: it.triggerSpec.added.map(toRegExp),
      removed: it.triggerSpec.removed.map(toRegExp),
    };
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

function pathPasses(spec, path) {
  return matchesAny(path, spec.paths) && !matchesAny(path, spec.not);
}

/**
 * The items a change triggers, each with the evidence that matched it
 * (file, line, the line's text). An item with no line or deletion
 * condition matches any changed file its paths name.
 */
export function matchItems(items, files) {
  const hits = [];
  for (const item of items) {
    const spec = item.triggerSpec;
    const hasLineConditions =
      item.regex.added.length > 0 || item.regex.removed.length > 0;
    const evidence = [];
    for (const f of files) {
      if (isExempt(f.path) || isExempt(f.oldPath)) continue;
      const candidate = pathPasses(spec, f.path)
        ? f.path
        : f.status !== "A" && pathPasses(spec, f.oldPath)
          ? f.oldPath
          : null;
      if (!candidate) continue;
      if (!hasLineConditions && !spec.deleted) {
        evidence.push({
          file: candidate,
          line: null,
          kind: "changed",
          text: "",
        });
      }
      if (
        spec.deleted &&
        (f.status === "D" || (f.status === "R" && pathPasses(spec, f.oldPath)))
      ) {
        evidence.push({
          file: f.oldPath,
          line: null,
          kind: f.status === "D" ? "deleted" : "renamed",
          text: f.path,
        });
      }
      for (const [kind, lines, res] of [
        ["added", f.added, item.regex.added],
        ["removed", f.removed, item.regex.removed],
      ]) {
        if (res.length === 0) continue;
        for (const l of lines) {
          if (res.some((re) => re.test(l.text))) {
            evidence.push({
              file: kind === "removed" ? f.oldPath : f.path,
              line: l.line,
              kind,
              text: l.text.trim(),
            });
            if (evidence.length >= MAX_EVIDENCE) break;
          }
        }
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
 * A file's text at the base, or the working tree's copy when the base has
 * none (with `source: "working-tree"` and a warning to print).
 */
export function readFromBase(
  path,
  base,
  {
    git = defaultGit,
    readWorkingTree = (p) => readFileSync(resolve(process.cwd(), p), "utf8"),
    workingTreeHas = (p) => existsSync(resolve(process.cwd(), p)),
  } = {}
) {
  try {
    return {
      text: git(["show", `${base}:${path}`]),
      source: "base",
      warning: null,
    };
  } catch {
    if (!workingTreeHas(path)) {
      throw new Error(`${path} is neither on ${base} nor in the working tree.`);
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
}

export function existsAt(ref, path, git = defaultGit) {
  try {
    git(["cat-file", "-e", `${ref}:${path}`]);
    return true;
  } catch {
    return false;
  }
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
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--head") args.head = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--gates") args.gates = true;
    else if (a === "--github") args.github = true;
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

function selfEdited(files) {
  return files.some((f) => f.path === SELF_PATH || f.oldPath === SELF_PATH);
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

export function main(argv = process.argv.slice(2), git = defaultGit) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
    return 0;
  }
  const base = resolveBase(args.base, git);
  const files = diffFiles(base, args.head, git);
  const warnings = [];
  if (selfEdited(files) && existsAt(base, SELF_PATH, git)) {
    warnings.push(
      `WARNING: this change edits ${SELF_PATH}. To judge it with the base's copy: ` +
        `git show ${base.slice(0, 12)}:${SELF_PATH} > /tmp/rt.mjs && node /tmp/rt.mjs --base ${base.slice(0, 12)}`
    );
  }

  if (args.gates) {
    const manifest = readFromBase(GATE_MANIFEST_PATH, base, { git });
    if (manifest.warning) warnings.push(manifest.warning);
    const result = gateFilesTouched(
      parseGateManifest(manifest.text),
      files,
      (p) => existsAt(base, p, git)
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
      if (output) appendFileSync(output, `tests=${result.tests.join(" ")}\n`);
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

  const review = readFromBase(REVIEW_PATH, base, { git });
  if (review.warning) warnings.push(review.warning);
  const items = parseReview(review.text);
  const hits = matchItems(items, files);
  for (const w of warnings) console.error(w);
  if (args.json) {
    console.log(
      JSON.stringify(
        {
          base,
          head: args.head,
          source: review.source,
          total: items.length,
          hits,
        },
        null,
        2
      )
    );
  } else {
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
