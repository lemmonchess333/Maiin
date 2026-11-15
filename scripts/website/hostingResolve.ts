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

/**
 * What answers `pathname` (no query string), given the deployed files as
 * paths relative to the public folder ("index.html", "legal/terms.html").
 */
export function resolveHosting(
  config: HostingConfig,
  files: ReadonlySet<string>,
  pathname: string
): HostingAnswer {
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
    if (rewrite.destination) {
      const file = rewrite.destination.replace(/^\/+/, "");
      return files.has(file) ? { kind: "file", file } : { kind: "404" };
    }
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
