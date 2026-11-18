/**
 * Which part of Firebase Hosting answers an address, read from
 * firebase.json the way Hosting reads it, for the tests that pin every
 * address troposfit.com keeps (src/website/__tests__) and for serving a
 * Hosting build locally with its rewrites.
 *
 * Hosting's order (Firebase docs, "Configure Hosting behavior", priority
 * order): reserved `/__/` paths, then redirects, then an exact match in the
 * deployed files, then the rewrites in the order written, then 404. A
 * directory's address takes its index.html, and `trailingSlash` decides
 * which spelling of it is served and which is sent there: unset, `/about`
 * is sent to `/about/`; false (troposfit.com's), `/about/` is sent to
 * `/about`. An address that matches no file keeps its slash either way
 * and goes on to the rewrites. Checked against the Hosting emulator
 * (firebase-tools 14) on 18 November 2026. Globs: `**` is any run of
 * characters and `*` any run within one segment; `<dir>/**` does not take
 * `<dir>` itself (the emulator answers `/settings` 404 under a lone
 * `/settings/**`). A rule may give a `regex` (RE2) in place of a glob.
 * Nothing matched is Hosting's 404, which serves the deployed 404.html.
 *
 * What it does not model: `ignore` (the caller passes the files that
 * deploy), `cleanUrls`, `i18n`, and any rewrite or redirect but a
 * `source` glob or a `regex` to a `destination`, or a `source` glob to a
 * function by `functionId`. It throws on a config that uses any of those,
 * rather than answer for an address Hosting would answer differently: a
 * `run` or `dynamicLinks` rewrite above the last rule would take every
 * address, and a resolver that skipped it would still say the website
 * answers.
 */

export interface HostingRewrite {
  source?: string;
  regex?: string;
  destination?: string;
  function?: { functionId: string; region?: string };
}

export interface HostingHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

export interface HostingConfig {
  trailingSlash?: boolean;
  redirects?: { source: string; destination: string; type?: number }[];
  rewrites?: HostingRewrite[];
  headers?: HostingHeaderRule[];
  [key: string]: unknown;
}

export type HostingAnswer =
  | { kind: "reserved" }
  | { kind: "redirect"; destination: string }
  | { kind: "file"; file: string }
  | { kind: "function"; functionId: string; region: string }
  | { kind: "404" };

/** A Hosting glob as a regular expression over a path. */
export function globToRegExp(glob: string): RegExp {
  const body = glob;
  let pattern = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "*" && body[i + 1] === "*") {
      pattern += ".*";
      i++;
    } else if (ch === "*") {
      pattern += "[^/]*";
    } else {
      pattern += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`);
}

/** A rewrite's own pattern: its `regex`, or its `source` glob. */
function ruleRegExp(rule: { source?: string; regex?: string }): RegExp {
  if (rule.regex) return new RegExp(rule.regex);
  return globToRegExp(rule.source ?? "");
}

/** Throws when `config` uses anything `resolveHosting` does not model. */
export function assertModelled(config: HostingConfig): void {
  const unmodelled = ["cleanUrls", "i18n"].filter((key) => key in config);
  if ("trailingSlash" in config && typeof config.trailingSlash !== "boolean") {
    unmodelled.push("trailingSlash");
  }
  if (unmodelled.length) {
    throw new Error(`resolveHosting does not model ${unmodelled.join(", ")}`);
  }
  for (const redirect of config.redirects ?? []) {
    const keys = Object.keys(redirect).sort().join(",");
    if (
      typeof redirect.source !== "string" ||
      typeof redirect.destination !== "string" ||
      !["destination,source", "destination,source,type"].includes(keys)
    ) {
      throw new Error(
        `resolveHosting does not model the redirect ${JSON.stringify(redirect)}`
      );
    }
  }
  for (const rewrite of config.rewrites ?? []) {
    const keys = Object.keys(rewrite).sort().join(",");
    const fn = rewrite.function as unknown;
    const functionShape =
      keys === "function,source" &&
      typeof fn === "object" &&
      fn !== null &&
      typeof (fn as { functionId?: unknown }).functionId === "string" &&
      Object.keys(fn).every((k) => ["functionId", "region"].includes(k));
    const destinationShape =
      (keys === "destination,source" && typeof rewrite.source === "string") ||
      (keys === "destination,regex" && typeof rewrite.regex === "string");
    if (
      !(functionShape && typeof rewrite.source === "string") &&
      !(destinationShape && typeof rewrite.destination === "string")
    ) {
      throw new Error(
        `resolveHosting does not model the rewrite ${JSON.stringify(rewrite)}`
      );
    }
  }
}

/**
 * What answers `pathname` (no query string), given the deployed files as
 * paths relative to the public folder ("index.html", "legal/terms.html").
 */
export function resolveHosting(
  config: HostingConfig,
  files: ReadonlySet<string>,
  pathname: string
): HostingAnswer {
  assertModelled(config);
  if (pathname === "/__" || pathname.startsWith("/__/")) {
    return { kind: "reserved" };
  }
  for (const redirect of config.redirects ?? []) {
    if (globToRegExp(redirect.source).test(pathname)) {
      return { kind: "redirect", destination: redirect.destination };
    }
  }
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  const slashed = relative.endsWith("/");
  const bare = relative.replace(/\/+$/, "");
  const index = bare === "" ? "index.html" : `${bare}/index.html`;
  if (!slashed && bare !== "" && files.has(bare)) {
    return { kind: "file", file: bare };
  }
  if (files.has(index)) {
    if (bare !== "" && config.trailingSlash === false && slashed) {
      return { kind: "redirect", destination: `/${bare}` };
    }
    if (bare !== "" && config.trailingSlash !== false && !slashed) {
      return { kind: "redirect", destination: `/${bare}/` };
    }
    return { kind: "file", file: index };
  }
  for (const rewrite of config.rewrites ?? []) {
    if (!ruleRegExp(rewrite).test(pathname)) continue;
    if (rewrite.function) {
      return {
        kind: "function",
        functionId: rewrite.function.functionId,
        region: rewrite.function.region ?? "us-central1",
      };
    }
    const file = (rewrite.destination ?? "").replace(/^\/+/, "");
    return files.has(file) ? { kind: "file", file } : { kind: "404" };
  }
  return { kind: "404" };
}

/** The headers Hosting sends with `pathname`, later rules winning. */
export function hostingHeaders(
  config: HostingConfig,
  pathname: string
): Map<string, string> {
  const out = new Map<string, string>();
  for (const rule of config.headers ?? []) {
    if (!globToRegExp(rule.source).test(pathname)) continue;
    for (const { key, value } of rule.headers)
      out.set(key.toLowerCase(), value);
  }
  return out;
}
