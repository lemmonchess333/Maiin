/**
 * Which part of Firebase Hosting answers an address, read from
 * firebase.json the way Hosting reads it, for the tests that pin every
 * address troposfit.com keeps (src/website/__tests__) and for serving a
 * Hosting build locally with its rewrites.
 *
 * Hosting's order (Firebase docs, "Configure Hosting behavior", priority
 * order): reserved `/__/` paths, then redirects, then an exact match in the
 * deployed files, then the rewrites in the order written, then 404. A
 * directory's address takes its index.html. Globs: `**` is any run of
 * characters, `*` any run within one segment, and `<dir>/**` also takes
 * `<dir>` itself.
 *
 * What it does not model: `ignore` (the caller passes the files that
 * deploy), `cleanUrls`, `trailingSlash`, `i18n`, and any rewrite or
 * redirect but a `source` glob to a `destination` or a function by
 * `functionId`. It throws on a config that uses any of those, rather than
 * answer for an address Hosting would answer differently: a `run` or
 * `dynamicLinks` rewrite above the catch-all would take every address,
 * and a resolver that skipped it would still say the website answers.
 */

export interface HostingRewrite {
  source: string;
  destination?: string;
  function?: { functionId: string; region?: string };
}

export interface HostingHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

export interface HostingConfig {
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
  const tail = glob.endsWith("/**");
  const body = tail ? glob.slice(0, -3) : glob;
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
  return new RegExp(`^${pattern}${tail ? "(?:/.*)?" : ""}$`);
}

/** Throws when `config` uses anything `resolveHosting` does not model. */
export function assertModelled(config: HostingConfig): void {
  const unmodelled = ["cleanUrls", "trailingSlash", "i18n"].filter(
    (key) => key in config
  );
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
      keys === "destination,source" && typeof rewrite.destination === "string";
    if (
      typeof rewrite.source !== "string" ||
      !(functionShape || destinationShape)
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
  const exact = relative.endsWith("/") || relative === "" ? null : relative;
  const index = `${relative.replace(/\/?$/, "/")}index.html`.replace(/^\//, "");
  if (exact && files.has(exact)) return { kind: "file", file: exact };
  if (files.has(index)) return { kind: "file", file: index };
  for (const rewrite of config.rewrites ?? []) {
    if (!globToRegExp(rewrite.source).test(pathname)) continue;
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
