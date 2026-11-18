/**
 * From a change's files to the features worth driving. Pure, so the rules
 * are tested without a browser (`select.test.ts`).
 *
 * - A file a feature's `sources` name selects that feature.
 * - A file every screen depends on (`SHARED_SOURCES`) selects the smoke set.
 * - Any other app file (under `src/`, not a test) selects the smoke set too,
 *   and is reported as unmapped: the change reaches the app, so something
 *   has to run, and the report says the map has a gap there.
 * - Tests, docs, e2e specs, scripts and CI files select nothing: they do
 *   not reach the running app. The verify skill's own files are the
 *   exception, and select everything (its CI job runs the whole map).
 */
import { FEATURES, SHARED_SOURCES, SMOKE, type Feature } from "./featureMap";

/** A glob as the feature map writes it: `**` crosses folders, `*` and `?`
 *  stay inside one, `{a,b}` is either. Matched against the whole path. */
export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // A double star, alone or before a slash, matches any depth,
        // including none.
        const slash = glob[i + 2] === "/";
        out += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) throw new Error(`Unclosed { in glob ${glob}`);
      const parts = glob.slice(i + 1, end).split(",");
      out += `(?:${parts.map((p) => p.replace(/[.+^$()|[\]\\]/g, "\\$&")).join("|")})`;
      i = end;
    } else {
      out += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

export function matchesAny(file: string, globs: readonly string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(file));
}

/** Files that cannot change what the running app shows. */
export function reachesApp(file: string): boolean {
  if (/(^|\/)__tests__\//.test(file)) return false;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) return false;
  if (file.startsWith("src/test/")) return false;
  if (file.startsWith("src/")) return true;
  return matchesAny(file, SHARED_SOURCES);
}

const VERIFY_SELF = [
  "scripts/verify/**",
  ".claude/skills/verify/**",
  ".github/workflows/verify-app.yml",
];

export interface Selection {
  /** The features to drive, in the map's order. */
  features: Feature[];
  /** Why each feature was chosen: the files that chose it. */
  because: Record<string, string[]>;
  /** App files no feature names: the map's gaps for this change. */
  unmapped: string[];
  /** True when the smoke set was added for shared or unmapped files. */
  smoke: boolean;
}

export function selectFeatures(
  changed: readonly string[],
  features: readonly Feature[] = FEATURES,
  smokeIds: readonly string[] = SMOKE
): Selection {
  const chosen = new Set<string>();
  const because: Record<string, string[]> = {};
  const unmapped: string[] = [];
  let smoke = false;
  const choose = (id: string, file: string) => {
    chosen.add(id);
    const files = (because[id] ??= []);
    if (!files.includes(file)) files.push(file);
  };

  for (const file of changed) {
    if (matchesAny(file, VERIFY_SELF)) {
      for (const f of features) choose(f.id, file);
      continue;
    }
    if (!reachesApp(file)) continue;
    let claimed = false;
    for (const f of features) {
      if (matchesAny(file, f.sources)) {
        choose(f.id, file);
        claimed = true;
      }
    }
    if (claimed) continue;
    smoke = true;
    if (!matchesAny(file, SHARED_SOURCES)) unmapped.push(file);
    for (const id of smokeIds) choose(id, file);
  }

  return {
    features: features.filter((f) => chosen.has(f.id)),
    because,
    unmapped,
    smoke,
  };
}
