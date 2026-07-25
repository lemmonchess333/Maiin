/**
 * Where the reachability gates look for `@oracle` / `@unwired:`.
 *
 * Shared by `mirrorCrossTestGate` (module-level) and `symbolReachability`
 * (module- AND symbol-level) so the two can't drift on what a marker means
 * — the same class of bug ADR-0008 is about.
 *
 * The rule these encode: a marker claims exactly the scope of the comment
 * it sits in. A module header speaks for the module; a symbol's JSDoc
 * speaks for that symbol.
 *
 * That distinction was NOT free. Both gates originally matched `@oracle`
 * anywhere in the file, which is indistinguishable from a module-level
 * claim right up until someone marks ONE export — at which point the whole
 * module falls out of the gate silently, taking every other export with
 * it. A probe module with one marked and one unmarked export proved it:
 * the unmarked orphan went unreported.
 *
 * Note this file lives under `__tests__/` deliberately. Both gates skip
 * `__tests__` paths when scanning, so shared test infrastructure here is
 * invisible as a domain module AND as a consumer — parking it in
 * `src/test/` would make it a consumer, and any symbol name it mentioned
 * would read as a production use.
 */

/**
 * The file's leading JSDoc — its module header — or "" when the file
 * doesn't open with one.
 *
 * "Leading" is strict: only whitespace may precede the opening `/**`. A
 * file that starts with an import and carries its first JSDoc halfway down
 * has no header, and a marker down there is a claim about whatever it sits
 * above, not about the module.
 */
export function moduleHeader(src: string): string {
  const open = src.indexOf("/**");
  if (open === -1 || src.slice(0, open).trim() !== "") return "";
  const close = src.indexOf("*/", open);
  return close === -1 ? "" : src.slice(open, close);
}

/**
 * The JSDoc block directly above `index`, or "" if there isn't one.
 *
 * "Directly above" is strict — only whitespace may sit between the closing
 * delimiter and the declaration. A loose search would let a marker on some
 * earlier function leak down onto its neighbours, which is the exact
 * failure these gates exist to catch.
 */
export function docAbove(src: string, index: number): string {
  const before = src.slice(0, index);
  const close = before.lastIndexOf("*/");
  if (close === -1 || before.slice(close + 2).trim() !== "") return "";
  const open = before.lastIndexOf("/**", close);
  return open === -1 ? "" : before.slice(open, close);
}
