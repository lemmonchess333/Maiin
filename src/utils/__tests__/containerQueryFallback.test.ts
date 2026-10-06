import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Container queries are written wide-first: the class with no variant is
 * the layout at the designed text size, and `@max-[…]` narrows it
 * (`flex @max-[14em]:hidden`, `grid-cols-3 @max-[17em]:grid-cols-1`).
 *
 * Safari has container queries from 16.0, and the iOS app supports iOS 15
 * (`IPHONEOS_DEPLOYMENT_TARGET = 15.0`; the iPhone 6s, 7 and first SE end
 * there). A browser without them ignores every `@container` rule, so it
 * gets the classes with no variant. Written narrow-first
 * (`hidden @min-[14em]:flex`), that is the narrow layout at every text
 * size: Settings without its icons, the meal picker four rows deep. Wide-
 * first, it is the layout the app was designed at.
 *
 * Bans the `@min-*` container variants, named or arbitrary. Viewport
 * variants (`min-[360px]:`, `sm:`) are not container queries and are
 * untouched.
 */

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/* `@min-[14em]:`, and the named sizes Tailwind ships (`@sm:`, `@3xl:`). */
const NARROW_FIRST =
  /(?<![\w-])@(?:min-\[[^\]]+\]|min-(?:3xs|2xs|xs|sm|md|lg|xl|[2-7]xl)|3xs|2xs|xs|sm|md|lg|xl|[2-7]xl):/;

describe("container queries fall back to the designed layout", () => {
  it("no class uses a min-width container variant", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (NARROW_FIRST.test(line))
            offenders.push(`${relative(SRC_ROOT, file)}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("the pattern catches the narrow-first forms and nothing else", () => {
    expect(NARROW_FIRST.test('"hidden @min-[14em]:flex"')).toBe(true);
    expect(NARROW_FIRST.test('"grid @sm:grid-cols-2"')).toBe(true);
    expect(NARROW_FIRST.test('"flex @max-[14em]:hidden"')).toBe(false);
    expect(NARROW_FIRST.test('"min-[360px]:grid-cols-4 sm:text-sm"')).toBe(
      false
    );
    expect(NARROW_FIRST.test('"@container"')).toBe(false);
    expect(NARROW_FIRST.test("e2e-test@sm.example")).toBe(false);
  });
});
