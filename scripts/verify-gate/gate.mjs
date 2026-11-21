/**
 * The commit gate's rules, as pure functions over strings and objects.
 *
 * `.claude/hooks/verify-gate.mjs` (a PreToolUse hook on Bash) and
 * `scripts/verify-gate/stamp.mjs` (husky's commit-msg) are the impure ends;
 * everything they decide is decided here, so it can be tested without a
 * session, a transcript file or a repository. docs/agents/verification-stamps.md
 * says what the stamps mean and how the gate's modes work.
 *
 * The rule is the one the Claude Code team describes
 * (claude.dev/blog/how-the-claude-code-team-thinks-about-verification): a
 * commit passes when the session ran the verify skill or a review of the
 * change since its last edit, or when the message says why it was not
 * verified (`Verified: none (<reason>)`). Anything else would be blocked.
 * In `observe` mode nothing is blocked: the decision is logged and stamped
 * on the commit, so false positives can be read before anyone turns
 * `enforce` on.
 */

/** The methods a `Verified:` line may name, in the order they are printed. */
export const METHODS = [
  "verify",
  "e2e",
  "unit",
  "types",
  "lint",
  "build",
  "review",
];

/** A session may be blocked this many times; the next commit then passes. */
export const MAX_BLOCKS = 2;

export const MODES = ["off", "observe", "enforce"];

// ─── Shell parsing ─────────────────────────────────────────────────────────
//
// Enough of POSIX shell to find the simple commands in a Bash tool call and
// the operators between them. Quotes, backslashes, `$( … )` and heredocs are
// honoured so that a message containing "git commit" or `&&` is not read as
// a command. It is not a shell: it never expands anything.

const HEREDOC_MARK = "\u0000HEREDOC";

/**
 * Pull heredoc bodies out of a command. Returns the command with each body
 * removed (the `<<EOF` stays) and the bodies in order, so a message written
 * with `-m "$(cat <<'EOF' … EOF)"` can be read back.
 */
export function extractHeredocs(command) {
  const lines = String(command).split("\n");
  const out = [];
  const bodies = [];
  const pending = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    const re = /<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/g;
    let m;
    while ((m = re.exec(line)))
      pending.push({ strip: m[1] === "-", tag: m[3] });
    while (pending.length) {
      const { strip, tag } = pending.shift();
      const body = [];
      i++;
      while (i < lines.length) {
        const candidate = strip ? lines[i].replace(/^\t+/, "") : lines[i];
        if (candidate === tag) break;
        body.push(lines[i]);
        i++;
      }
      const index = bodies.push(body.join("\n")) - 1;
      out[out.length - 1] += ` ${HEREDOC_MARK}${index}\u0000`;
      // The terminator line (lines[i]) is dropped; whatever follows it on
      // later lines (a closing `)"` for instance) is kept.
    }
  }
  return { text: out.join("\n"), bodies };
}

/**
 * Split a command into simple commands. Each is `{ words, op, pipeline }`:
 * `words` unquoted, `op` the operator that ends it (`&&`, `||`, `;`, `|`,
 * `&`, newline as `;`, or null at the end).
 */
export function splitCommands(command) {
  const { text, bodies } = extractHeredocs(command);
  const commands = [];
  let words = [];
  let word = "";
  let inWord = false;
  const pushWord = () => {
    if (inWord) words.push(restoreHeredocs(word, bodies));
    word = "";
    inWord = false;
  };
  const endCommand = (op) => {
    pushWord();
    if (words.length || op) commands.push({ words, op });
    words = [];
  };

  let i = 0;
  const n = text.length;
  // Reads a `$( … )` (i at the `$`), returning its raw text.
  const readSubstitution = () => {
    let depth = 0;
    let j = i;
    let quote = null;
    for (; j < n; j++) {
      const c = text[j];
      if (quote) {
        if (c === "\\" && quote === '"') {
          j++;
          continue;
        }
        if (c === quote) quote = null;
        continue;
      }
      if (c === "'" || c === '"') quote = c;
      else if (c === "\\") j++;
      else if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    const raw = text.slice(i, Math.min(j + 1, n));
    i = j + 1;
    return raw;
  };

  while (i < n) {
    const c = text[i];
    if (c === "\\") {
      if (text[i + 1] === "\n") {
        i += 2;
        continue;
      }
      word += text[i + 1] ?? "";
      inWord = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      word += text.slice(i + 1, end === -1 ? n : end);
      inWord = true;
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (c === '"') {
      i++;
      inWord = true;
      while (i < n && text[i] !== '"') {
        if (text[i] === "\\" && i + 1 < n) {
          const next = text[i + 1];
          word += '"\\$`\n'.includes(next) ? next : `\\${next}`;
          i += 2;
        } else if (text[i] === "$" && text[i + 1] === "(") {
          word += readSubstitution();
        } else {
          word += text[i];
          i++;
        }
      }
      i++;
      continue;
    }
    if (c === "$" && text[i + 1] === "(") {
      word += readSubstitution();
      inWord = true;
      continue;
    }
    if (c === "#" && !inWord) {
      // A comment runs to the end of the line.
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "&" && text[i + 1] === "&") {
      endCommand("&&");
      i += 2;
      continue;
    }
    if (c === "|" && text[i + 1] === "|") {
      endCommand("||");
      i += 2;
      continue;
    }
    if (c === "|") {
      endCommand("|");
      i++;
      continue;
    }
    if (c === "&" && (text[i - 1] === ">" || text[i + 1] === ">")) {
      // `2>&1`, `&>file`: a redirection, not the background operator.
      word += c;
      inWord = true;
      i++;
      continue;
    }
    if (c === "&") {
      endCommand("&");
      i++;
      continue;
    }
    if (c === ";" || c === "\n") {
      endCommand(";");
      i++;
      continue;
    }
    if (c === "(" || c === ")" || c === "{" || c === "}") {
      // Subshells and groups: their insides are commands like any other.
      if (!inWord || c === "(" || c === ")") {
        pushWord();
        i++;
        continue;
      }
    }
    if (c === " " || c === "\t") {
      pushWord();
      i++;
      continue;
    }
    word += c;
    inWord = true;
    i++;
  }
  endCommand(null);
  // An operator with nothing after it (a trailing `;`) leaves an empty
  // command; drop those.
  return commands.filter((cmd) => cmd.words.length > 0);
}

function restoreHeredocs(word, bodies) {
  return word.replace(
    new RegExp(`${HEREDOC_MARK}(\\d+)\\u0000`, "g"),
    (_, index) => bodies[Number(index)] ?? ""
  );
}

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const WRAPPERS = new Set(["time", "nice", "nohup", "command", "exec", "sudo"]);

/** The words of a simple command without leading `VAR=x`, `env`, `timeout n` and the like. */
export function stripPrefixes(words) {
  let rest = [...words];
  for (;;) {
    if (!rest.length) return rest;
    const [first] = rest;
    if (ENV_ASSIGNMENT.test(first)) rest = rest.slice(1);
    else if (WRAPPERS.has(first)) rest = rest.slice(1);
    else if (first === "env") {
      rest = rest.slice(1);
      while (
        rest.length &&
        (ENV_ASSIGNMENT.test(rest[0]) || rest[0].startsWith("-"))
      )
        rest = rest.slice(1);
    } else if (first === "timeout") {
      rest = rest.slice(1);
      while (rest.length && rest[0].startsWith("-")) rest = rest.slice(1);
      rest = rest.slice(1); // the duration
    } else return rest;
  }
}

const SHELLS = new Set(["bash", "sh", "zsh", "dash"]);

/**
 * Every simple command in a Bash tool call, including those inside
 * `bash -c "…"`, with the directory each runs in (following `cd` along a
 * chain).
 */
export function simpleCommands(command, cwd = "") {
  const out = [];
  let dir = cwd;
  for (const cmd of splitCommands(command)) {
    const words = stripPrefixes(cmd.words);
    if (!words.length) continue;
    if (words[0] === "cd" && words[1]) {
      dir = joinPath(dir, words[1]);
    }
    if (SHELLS.has(basename(words[0]))) {
      const c = words.indexOf("-c");
      if (c !== -1 && words[c + 1]) {
        out.push(...simpleCommands(words[c + 1], dir));
        continue;
      }
    }
    out.push({ words, op: cmd.op, cwd: dir });
  }
  return out;
}

function basename(p) {
  return String(p).split("/").pop();
}

function joinPath(base, next) {
  if (next.startsWith("/")) return next;
  if (next === "-" || next.startsWith("~")) return next;
  if (!base) return next;
  return `${base.replace(/\/+$/, "")}/${next}`;
}

const GIT_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--exec-path",
  "--config-env",
]);

/**
 * `{ subcommand, args, cwd }` for a `git` simple command, or null. Global
 * options before the subcommand are skipped; `-C dir` moves the directory.
 */
export function parseGit(simple) {
  const { words } = simple;
  if (basename(words[0]) !== "git") return null;
  let cwd = simple.cwd;
  let i = 1;
  while (i < words.length && words[i].startsWith("-")) {
    const w = words[i];
    if (w === "-C") {
      cwd = joinPath(cwd, words[i + 1] ?? "");
      i += 2;
    } else if (GIT_OPTIONS_WITH_VALUE.has(w)) i += 2;
    else i += 1;
  }
  if (i >= words.length) return null;
  return { subcommand: words[i], args: words.slice(i + 1), cwd };
}

/** `-m "$(cat <<'EOF' … EOF)"` is the usual way a long message is written;
 *  the message is the heredoc's body. */
function unwrapCat(message) {
  const m =
    /^\$\(\s*cat\s+<<-?\s*['"]?[A-Za-z_]\w*['"]?\s([\s\S]*?)\s*\)$/.exec(
      message
    );
  return m ? m[1] : message;
}

/**
 * Every `git commit` in a Bash tool call: `{ cwd, message, messageFile,
 * amend }`. `message` joins the `-m` paragraphs as git does; it is null
 * when the message comes from a file or an editor.
 */
export function findGitCommits(command, cwd = "") {
  const commits = [];
  for (const simple of simpleCommands(command, cwd)) {
    const git = parseGit(simple);
    if (!git || git.subcommand !== "commit") continue;
    const messages = [];
    let messageFile = null;
    let amend = false;
    const { args } = git;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "--") break;
      if (a === "--amend") amend = true;
      else if (a === "-m" || a === "--message") messages.push(args[++i] ?? "");
      else if (a.startsWith("--message=")) messages.push(a.slice(10));
      else if (a === "-F" || a === "--file") messageFile = args[++i] ?? null;
      else if (a.startsWith("--file=")) messageFile = a.slice(7);
      else if (/^-[A-Za-z]+$/.test(a) && !a.startsWith("--")) {
        // A cluster of short options: `-am "msg"`, `-m"msg"` is handled below.
        const letters = a.slice(1);
        const m = letters.indexOf("m");
        const f = letters.indexOf("F");
        if (m !== -1) {
          const inline = letters.slice(m + 1);
          messages.push(inline || (args[++i] ?? ""));
        } else if (f !== -1) {
          const inline = letters.slice(f + 1);
          messageFile = inline || (args[++i] ?? null);
        }
      } else if (/^-m./.test(a)) messages.push(a.slice(2));
    }
    commits.push({
      cwd: git.cwd,
      message: messages.length ? messages.map(unwrapCat).join("\n\n") : null,
      messageFile,
      amend,
    });
  }
  return commits;
}

// ─── What a command proves ─────────────────────────────────────────────────

const PACKAGE_RUNNERS = new Set(["npx", "pnpx", "bunx"]);

function npmScript(words) {
  const [tool, sub, name] = words;
  if (!["npm", "pnpm", "yarn", "bun"].includes(tool)) return null;
  if (sub === "test" || sub === "t") return "test";
  if (sub === "run" || sub === "run-script") return name ?? null;
  if (tool === "yarn" && sub && !sub.startsWith("-")) return sub;
  return null;
}

/**
 * The methods one simple command counts as, if it succeeds. `tsc --noEmit
 * -p tsconfig.json` counts as nothing: on this repo it checks nothing
 * (CLAUDE.md, Common Gotchas), and only `tsc -b` is a type check.
 */
export function classifySimple(words) {
  let w = words;
  if (PACKAGE_RUNNERS.has(w[0])) {
    w = w.slice(1);
    while (w.length && w[0].startsWith("-")) w = w.slice(1);
  }
  if (!w.length) return [];
  const tool = basename(w[0]);
  // Asking a tool about itself checks nothing: `eslint --version`,
  // `tsc -b --dry`, `vitest list`.
  if (
    w.some((x) =>
      ["--version", "--help", "-h", "--dry", "--listFiles"].includes(x)
    )
  )
    return [];
  if (tool === "vitest" && w[1] === "list") return [];
  const script = npmScript(w);
  if (script !== null) {
    if (script === "verify") return ["unit", "types", "lint", "build"];
    if (script === "verify:app") return ["verify"];
    if (script.startsWith("test:e2e")) return ["e2e"];
    if (script === "test" || script.startsWith("test:")) return ["unit"];
    if (script === "typecheck") return ["types"];
    if (script === "build" || script === "build:e2e") return ["types", "build"];
    if (script === "lint") return ["lint"];
    if (script === "check:dist-size") return ["build"];
    return [];
  }
  if (tool === "vitest") return w.includes("--watch") ? [] : ["unit"];
  if (tool === "tsc")
    return w.includes("-b") || w.includes("--build") ? ["types"] : [];
  if (tool === "eslint") return ["lint"];
  if (tool === "playwright") return w[1] === "test" ? ["e2e"] : [];
  if (tool === "vite") return w[1] === "build" ? ["build"] : [];
  if (tool === "node" || tool === "tsx") {
    const file = w.find((x, i) => i > 0 && !x.startsWith("-")) ?? "";
    if (/check-dist-size\.mjs$/.test(file)) return ["build"];
    if (/run-unit-tests\.mjs$/.test(file)) return ["unit"];
    if (/scripts\/verify\/run\.ts$/.test(file)) return ["verify"];
    if (w.includes("--test")) return ["unit"];
  }
  if (tool === "python3" && w.includes("unittest")) return ["unit"];
  return [];
}

/** Whether a Bash tool call's exit status reflects a command at `index`. */
function exitFaithful(commands, index, pipefail) {
  for (let i = index; i < commands.length; i++) {
    const op = commands[i].op;
    if (op === null) return true;
    if (op === "|") {
      if (!pipefail) return false;
      continue;
    }
    if (op !== "&&") return false;
  }
  return true;
}

const TREE_CHANGING_GIT = new Set([
  "merge",
  "pull",
  "rebase",
  "cherry-pick",
  "revert",
  "am",
  "apply",
  "restore",
  "rm",
  "mv",
]);

/** Commands that change files in the tree, as an Edit does. */
export function isTreeEdit(words) {
  const tool = basename(words[0] ?? "");
  if (tool === "git") {
    const git = parseGit({ words, cwd: "" });
    if (!git) return false;
    const { subcommand: sub, args } = git;
    if (TREE_CHANGING_GIT.has(sub)) return true;
    // `git checkout <branch>` swaps the tree; `-b`/`-c` only names a new
    // branch at the current commit.
    if (sub === "checkout" || sub === "switch")
      return !args.some((a) =>
        ["-b", "-B", "-c", "-C", "--orphan"].includes(a)
      );
    if (sub === "reset") return args.includes("--hard");
    // Every stash but a listing changes the tree: a push takes changes out,
    // a pop or apply puts them back.
    if (sub === "stash") return !["list", "show"].includes(args[0]);
    return false;
  }
  if (tool === "sed" || tool === "perl")
    return words.some((x) => /^-[a-zA-Z]*i/.test(x));
  if (tool === "prettier")
    return words.includes("--write") || words.includes("-w");
  if (tool === "eslint") return words.includes("--fix");
  return false;
}

/**
 * What a whole Bash tool call proves: `{ methods, unverifiedExit, edits }`.
 * A check counts only when the call's exit status reflects it: piped into
 * another command without `pipefail`, followed by `;` or `||`, or put in
 * the background, it does not (CLAUDE.md's `vitest … | grep …; git push`).
 */
export function classifyBash(command) {
  const commands = simpleCommands(command);
  const pipefail = /\bpipefail\b/.test(command);
  const methods = new Set();
  const unverified = new Set();
  let edits = false;
  commands.forEach((cmd, i) => {
    let words = cmd.words;
    if (PACKAGE_RUNNERS.has(words[0])) words = words.slice(1);
    if (isTreeEdit(words)) edits = true;
    const found = classifySimple(cmd.words);
    if (!found.length) return;
    const target = exitFaithful(commands, i, pipefail) ? methods : unverified;
    for (const m of found) target.add(m);
  });
  return {
    methods: sortMethods(methods),
    unverifiedExit: sortMethods([...unverified].filter((m) => !methods.has(m))),
    edits,
  };
}

export function sortMethods(methods) {
  const set = new Set(methods);
  return METHODS.filter((m) => set.has(m));
}

const REVIEW_SKILLS = new Set([
  "code-review-matt",
  "code-review",
  "engineering:code-review",
  "review",
]);
const VERIFY_SKILLS = new Set(["verify"]);

function skillMethods(name) {
  const skill = String(name ?? "")
    .replace(/^\//, "")
    .trim();
  if (VERIFY_SKILLS.has(skill)) return ["verify"];
  if (REVIEW_SKILLS.has(skill)) return ["review"];
  return [];
}

function resultText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((b) => (typeof b === "string" ? b : (b?.text ?? "")))
      .join("\n");
  return "";
}

function resultFailed(block) {
  if (block?.is_error === true) return true;
  const text = resultText(block?.content);
  return (
    /^\s*Exit code [1-9]\d*/.test(text) || /^\s*Command timed out/i.test(text)
  );
}

function isTruthy(value) {
  return value === true || value === "true";
}

/** An Agent call is a review when its description says so as a word:
 *  "Fable review of the diff", not "Preview the build output". */
const REVIEW_WORD = /\breview(?:s|ed|ing|er)?\b/i;

/**
 * Whether an Edit/Write tool call changes the repository at `root`. A
 * commit message or a scratch script written outside it changes nothing a
 * check covered. Without a root, or a path to judge, every edit counts.
 */
function editsRepository(input, root) {
  const path = String(input?.file_path ?? input?.notebook_path ?? "");
  if (!root || !path.startsWith("/")) return true;
  const base = root.replace(/\/+$/, "");
  return path === base || path.startsWith(`${base}/`);
}

/**
 * Read a session transcript (JSONL text) into what it proves now.
 *
 * Returns `{ methods, stale, unverifiedExit }`: `methods` are checks that
 * passed after the session's last edit, `stale` ones that passed before it,
 * `unverifiedExit` ones whose exit status the call hid. A tool_use counts
 * when its tool_result arrives and did not fail. With `root`, only edits
 * inside that directory make a check stale.
 */
export function collectEvidence(transcriptText, { root = null } = {}) {
  const uses = new Map();
  const events = [];
  const lines = String(transcriptText ?? "").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    // A slash command the person typed (`<command-name>/verify</command-name>`)
    // counts for nothing by itself: it is a request, not a run. The Skill
    // result that follows it, when there is one, is what counts.
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_use") {
        uses.set(block.id, block);
        if (
          ["Edit", "Write", "NotebookEdit", "MultiEdit"].includes(block.name) &&
          editsRepository(block.input, root)
        )
          events.push({ kind: "edit" });
        continue;
      }
      if (block?.type !== "tool_result") continue;
      const use = uses.get(block.tool_use_id);
      if (!use) continue;
      const failed = resultFailed(block);
      if (use.name === "Bash") {
        const verdict = classifyBash(use.input?.command ?? "");
        if (verdict.edits) events.push({ kind: "edit" });
        // A call sent to the background returns at once: its result says it
        // started, not that it passed.
        if (failed || isTruthy(use.input?.run_in_background)) continue;
        events.push({
          kind: "check",
          methods: verdict.methods,
          unverified: verdict.unverifiedExit,
        });
      } else if (use.name === "Skill") {
        if (failed) continue;
        events.push({
          kind: "check",
          methods: skillMethods(use.input?.skill),
          unverified: [],
        });
      } else if (use.name === "Agent" || use.name === "Task") {
        if (failed) continue;
        if (isTruthy(use.input?.run_in_background)) continue;
        const description = String(use.input?.description ?? "");
        if (REVIEW_WORD.test(description))
          events.push({ kind: "check", methods: ["review"], unverified: [] });
      }
    }
  }
  let lastEdit = -1;
  events.forEach((e, i) => {
    if (e.kind === "edit") lastEdit = i;
  });
  const current = new Set();
  const stale = new Set();
  const unverified = new Set();
  events.forEach((e, i) => {
    if (e.kind !== "check") return;
    const into = i > lastEdit ? current : stale;
    for (const m of e.methods) into.add(m);
    if (i > lastEdit) for (const m of e.unverified) unverified.add(m);
  });
  return {
    methods: sortMethods(current),
    stale: sortMethods([...stale].filter((m) => !current.has(m))),
    unverifiedExit: sortMethods([...unverified].filter((m) => !current.has(m))),
  };
}

// ─── Mode and decision ─────────────────────────────────────────────────────

function parseMode(text) {
  if (text == null) return null;
  try {
    const mode = JSON.parse(text)?.mode;
    return MODES.includes(mode) ? mode : null;
  } catch {
    return null;
  }
}

/**
 * The gate's mode and where it came from: the env var
 * `TROPOS_VERIFY_GATE`, then `.claude/verify-gate.json` on the base branch
 * (read with `git show`, so a branch cannot loosen its own gate), then the
 * working tree's copy, then off. The source goes on the stamp, because the
 * first and third are in reach of the session being judged.
 */
export function resolveMode({ env, baseConfig, worktreeConfig } = {}) {
  if (env != null && MODES.includes(String(env).trim()))
    return { mode: String(env).trim(), source: "env" };
  const base = parseMode(baseConfig);
  if (base) return { mode: base, source: "base" };
  const tree = parseMode(worktreeConfig);
  if (tree) return { mode: tree, source: "worktree" };
  return { mode: "off", source: "default" };
}

/**
 * Read one `Verified:` value: `{ none, methods, unrecognised }`. Parenthesised
 * detail (`verify(home, food)`, `none (docs only)`) is dropped before the
 * value is split, and only names in METHODS count as methods.
 */
export function parseVerified(value) {
  const text = String(value ?? "").trim();
  if (/^none\b/i.test(text))
    return { none: true, methods: [], unrecognised: [] };
  let bare = text;
  // Drop parenthesised groups, innermost first.
  while (/\([^()]*\)/.test(bare)) bare = bare.replace(/\([^()]*\)/g, "");
  const methods = new Set();
  const unrecognised = [];
  for (const part of bare.split(",")) {
    const word = part.trim().toLowerCase();
    if (!word) continue;
    if (METHODS.includes(word)) methods.add(word);
    else unrecognised.push(word);
  }
  return { none: false, methods: sortMethods(methods), unrecognised };
}

/** Every `Verified:` value in a message, wherever it sits. */
export function verifiedLines(message) {
  const out = [];
  for (const line of String(message ?? "").split("\n")) {
    const m = /^\s*(?:[-*]\s+)?Verified:\s*(.*?)\s*$/i.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

/** The reason in a message's `Verified: none (<reason>)`, or null. */
export function explainedNone(message) {
  const m = /^\s*Verified:\s*none\s*\(([^)]*\S[^)]*)\)\s*$/im.exec(
    String(message ?? "")
  );
  return m ? m[1].trim() : null;
}

/**
 * Decide one commit. `methods` are the current, passing checks; `blocks`
 * how many commits this session already had blocked.
 *
 * Returns `{ verdict: "pass" | "would-block", why, deny, releasedAfterBlocks }`.
 * `deny` is true only in enforce mode, and never after MAX_BLOCKS blocks:
 * the gate exists to catch a missed check, not to trap a session.
 */
export function decide({ mode, methods = [], message = null, blocks = 0 }) {
  const explained = explainedNone(message);
  let verdict;
  let why;
  if (methods.includes("verify") || methods.includes("review")) {
    verdict = "pass";
    why = `ran ${sortMethods(methods.filter((m) => m === "verify" || m === "review")).join(" and ")} since the last edit`;
  } else if (explained) {
    verdict = "pass";
    why = `explained: ${explained}`;
  } else {
    verdict = "would-block";
    why =
      "no verify run or review of the change since the last edit, and no Verified: none (<reason>)";
  }
  const releasedAfterBlocks =
    mode === "enforce" && verdict === "would-block" && blocks >= MAX_BLOCKS;
  const deny =
    mode === "enforce" && verdict === "would-block" && !releasedAfterBlocks;
  return { verdict, why, deny, releasedAfterBlocks };
}

/** The `Verified:` line the stamp writes when the message has none. */
export function verifiedTrailer(methods) {
  const sorted = sortMethods(methods);
  return sorted.length ? sorted.join(", ") : "none (unexplained)";
}

/**
 * The `Verify-gate:` line: mode, its source, the verdict and what was seen
 * in the transcript, then whatever else a reader should know: checks
 * chained before the commit in the same call (`same call:`), methods the
 * message claims that nothing showed (`claimed, not seen:`), which copy of
 * the rules judged it when not the base branch's (`rules:`), and a
 * transcript it did not read (`transcript:`).
 */
export function gateTrailer({
  mode,
  source,
  verdict,
  methods,
  releasedAfterBlocks,
  rules = null,
  sameCall = [],
  claimedNotSeen = [],
  unread = null,
}) {
  const seen = sortMethods(methods);
  const outcome = releasedAfterBlocks
    ? `${verdict}, released after ${MAX_BLOCKS} blocks`
    : verdict;
  const parts = [
    `${mode}(${source}) ${outcome}`,
    `seen: ${seen.length ? seen.join(", ") : "nothing"}`,
  ];
  if (sameCall.length)
    parts.push(`same call: ${sortMethods(sameCall).join(", ")}`);
  if (claimedNotSeen.length)
    parts.push(`claimed, not seen: ${sortMethods(claimedNotSeen).join(", ")}`);
  if (rules) parts.push(`rules: ${rules}`);
  if (unread) parts.push(`transcript: ${unread}`);
  return parts.join("; ");
}

/**
 * Checks chained to the commit in the same Bash call. PreToolUse runs
 * before the call, so `npm run verify && git add -A && git commit -m x`
 * has not run its checks yet when the hook reads the transcript; but the
 * commit can only happen if every command joined to it by `&&` passed. A
 * pipe joins the chain only under `pipefail`. A tree edit in the chain
 * after a check makes it stale, as an Edit does.
 */
export function sameCallChecks(command, cwd = "") {
  const commands = simpleCommands(command, cwd);
  let commitAt = -1;
  commands.forEach((cmd, i) => {
    const git = parseGit(cmd);
    if (git && git.subcommand === "commit") commitAt = i;
  });
  if (commitAt <= 0) return [];
  const pipefail = /\bpipefail\b/.test(command);
  let start = commitAt;
  while (
    start > 0 &&
    (commands[start - 1].op === "&&" ||
      (pipefail && commands[start - 1].op === "|"))
  )
    start--;
  const methods = new Set();
  for (let i = start; i < commitAt; i++) {
    let words = commands[i].words;
    if (PACKAGE_RUNNERS.has(words[0])) words = words.slice(1);
    if (isTreeEdit(words)) methods.clear();
    for (const m of classifySimple(commands[i].words)) methods.add(m);
  }
  return sortMethods(methods);
}

/** What the hook tells Claude Code when enforce mode denies a commit. */
export function denyReason({ why }) {
  return (
    `Commit gate (enforce): ${why}. ` +
    "Run the verify skill (npm run verify:app) or review the diff, then commit again; " +
    "or, when the change cannot be verified that way, end the message with " +
    "`Verified: none (<why>)`. After two blocks in a session the next commit passes."
  );
}

/** How long a pending stamp waits for its commit: long enough for the
 *  pre-commit hook's lint-staged and a cold `tsc -b` on a slow machine,
 *  short enough that a stamp whose commit failed does not wait long. */
export const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

/** A session id as the hook stores it. */
export function sessionKey(id) {
  return String(id ?? "").replace(/[^A-Za-z0-9_-]/g, "");
}

/**
 * Whether husky's commit-msg should write a pending stamp onto the commit
 * being made. The stamp belongs to it only when it was left for the same
 * parent commit (`head`, which a root commit lacks), recently, by the
 * session making this commit (`session`, from Claude Code's
 * CLAUDE_CODE_SESSION_ID; when Claude Code gives no id, `claudeCode` says
 * whether the commit comes from Claude Code at all), and when it is not a
 * merge. Anything else is a stamp whose commit never happened (a failed
 * pre-commit, a `--no-verify` commit), or a commit someone else is making on
 * the same parent, and the stamp is dropped.
 */
export function stampPlan(
  pending,
  {
    head,
    now,
    session = null,
    claudeCode = false,
    merging = false,
    maxAgeMs = PENDING_MAX_AGE_MS,
  }
) {
  if (!pending || typeof pending !== "object")
    return { stamp: false, reason: "none pending" };
  if (merging) return { stamp: false, reason: "a merge" };
  if (!head || pending.head !== head)
    return { stamp: false, reason: "left for another parent commit" };
  if (!(now - Number(pending.at) <= maxAgeMs))
    return { stamp: false, reason: "too old" };
  if (session) {
    if (sessionKey(session) !== sessionKey(pending.session))
      return { stamp: false, reason: "another session's commit" };
  } else if (!claudeCode) {
    return { stamp: false, reason: "not made from Claude Code" };
  }
  if (!pending.trailers?.verified || !pending.trailers?.gate)
    return { stamp: false, reason: "malformed" };
  return { stamp: true, reason: "same parent, session and minutes" };
}

/**
 * The whole PreToolUse decision for one Bash tool call, for the hook, which
 * reads the impure inputs (transcript text, the mode's three sources, the
 * session's block count, a `-F` message file). Returns null when the call
 * is not a commit.
 */
export function evaluate({
  command,
  cwd,
  transcript,
  modeInputs,
  blocks,
  messageFromFile,
  root = null,
  rules = null,
  unread = null,
}) {
  const commits = findGitCommits(command, cwd);
  if (!commits.length) return null;
  const evidence = collectEvidence(transcript, { root });
  const sameCall = sameCallChecks(command, cwd);
  const methods = sortMethods([...evidence.methods, ...sameCall]);
  const { mode, source } = resolveMode(modeInputs);
  const commit = commits[commits.length - 1];
  const message = commit.message ?? messageFromFile ?? null;
  const decision = decide({ mode, methods, message, blocks });
  const claimed = new Set();
  for (const value of verifiedLines(message))
    for (const m of parseVerified(value).methods) claimed.add(m);
  const claimedNotSeen = [...claimed].filter((m) => !methods.includes(m));
  return {
    commit,
    mode,
    source,
    evidence: { ...evidence, sameCall },
    methods,
    decision,
    trailers: {
      verified: verifiedTrailer(methods),
      gate: gateTrailer({
        mode,
        source,
        verdict: decision.verdict,
        methods: evidence.methods,
        releasedAfterBlocks: decision.releasedAfterBlocks,
        rules,
        sameCall: sameCall.filter((m) => !evidence.methods.includes(m)),
        claimedNotSeen,
        unread,
      }),
    },
  };
}
