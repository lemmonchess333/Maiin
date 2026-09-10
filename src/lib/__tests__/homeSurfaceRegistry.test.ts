/**
 * Home's tier-4 surface registry, read from source.
 *
 * `surfaceCoordinator.test.ts` proves the POLICY — that `pickNext` honours
 * priority and that `suppressedBy` removes a candidate. What nothing
 * proved is the CONFIG: that the priorities Home actually ships are
 * distinct and ordered the way the ADR describes, and that the two
 * welcome-back surfaces are wired so one absence can never produce both in
 * a single visit.
 *
 * A test that re-declared those registrations and fed them to `pickNext`
 * would pin its own fixture, not the app — the tautology this repo has
 * been bitten by before. So this reads Home.tsx, the way
 * `archaeologyMarkers` and `firestoreWriteGuard` read source, and asserts
 * against what is really there.
 *
 * It is deliberately narrow: presence, uniqueness, ordering and the one
 * suppression pair. It cannot tell you the surfaces behave correctly at
 * runtime — only that the arbitration they hand the coordinator is the one
 * intended.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HOME = readFileSync(join(process.cwd(), "src/pages/Home.tsx"), "utf8");

interface Registration {
  id: string;
  priority: number;
  suppressedBy: string[];
}

/**
 * Every `useSurface({ ... })` call in Home, parsed from source.
 *
 * Brace-counting rather than a regex over the whole object: a nested
 * object or a multi-line `eligible` expression would truncate a lazy
 * match, and a truncated parse that silently found fewer registrations is
 * exactly how this test would pass while checking nothing.
 */
function registrations(): Registration[] {
  const out: Registration[] = [];
  const marker = "useSurface({";
  let from = 0;
  for (;;) {
    const start = HOME.indexOf(marker, from);
    if (start === -1) break;
    let depth = 0;
    let end = start + marker.length - 1;
    for (let i = start + marker.length - 1; i < HOME.length; i++) {
      if (HOME[i] === "{") depth++;
      else if (HOME[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = HOME.slice(start, end + 1);
    from = end + 1;

    const id = /\bid:\s*"([^"]+)"/.exec(body)?.[1];
    const priority = /\bpriority:\s*(\d+)/.exec(body)?.[1];
    if (!id || !priority) continue;
    const suppressed = /\bsuppressedBy:\s*\[([^\]]*)\]/.exec(body)?.[1] ?? "";
    out.push({
      id,
      priority: Number(priority),
      suppressedBy: [...suppressed.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
    });
  }
  return out;
}

describe("Home's tier-4 surface registry", () => {
  const regs = registrations();

  it("parses a plausible number of registrations (guards a broken scan)", () => {
    // Without this, a parser change that found nothing would make every
    // assertion below vacuously true.
    expect(regs.length).toBeGreaterThanOrEqual(5);
  });

  it("registers the surfaces the coordinator arbitrates", () => {
    expect(regs.map((r) => r.id).sort()).toEqual(
      [
        "badge",
        "fell-behind",
        "goal-reached",
        "lift-return",
        "trial-expired",
      ].sort()
    );
  });

  it("gives every surface a DISTINCT priority", () => {
    // Equal priorities make `pickNext`'s sort order the arbiter, which is
    // an implementation detail rather than a decision anyone made.
    const priorities = regs.map((r) => r.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it("orders them as ADR-0004 describes", () => {
    const byId = Object.fromEntries(regs.map((r) => [r.id, r.priority]));
    expect(byId["trial-expired"]).toBeGreaterThan(byId["fell-behind"]);
    expect(byId["fell-behind"]).toBeGreaterThan(byId["lift-return"]);
    expect(byId["lift-return"]).toBeGreaterThan(byId["badge"]);
  });

  it("never lets one absence produce two welcome-backs in a visit", () => {
    // The run sheet speaks first when it has something to say about the
    // same lapse; the lift sheet stands down. This is the pairing that was
    // wired but unproven.
    const liftReturn = regs.find((r) => r.id === "lift-return")!;
    expect(liftReturn.suppressedBy).toContain("fell-behind");
  });

  it("keeps a celebration from landing in a reprimand's visit", () => {
    // The pre-existing emotional-sequencing rule, pinned here too so a
    // reshuffle of this block cannot quietly drop it.
    const badge = regs.find((r) => r.id === "badge")!;
    expect(badge.suppressedBy).toContain("fell-behind");
  });
});

describe("Home's day tap — every cell opens its detail card", () => {
  /* A source pin, not a render. Home.tsx has no unit render harness (it
     is the app's most heavily-hooked page), and standing one up for a
     three-line handler would cost more than it protects. What this
     catches is the specific regression: a today branch reappearing in
     `handleDayTap`, which is how a tap on today came to scroll to the
     session cards instead of opening the card every other day opens.

     Deliberately narrow — it proves the SHAPE of the handler, not that
     the peek renders. The card's own today behaviour, including the
     diary link that this handler makes reachable at all, is a real
     render in `DayPeekCard.test.tsx`. */
  function handleDayTapBody(): string {
    const start = HOME.indexOf("const handleDayTap = useCallback(");
    expect(
      start,
      "handleDayTap is gone from Home.tsx — retarget this pin"
    ).toBeGreaterThan(-1);
    const end = HOME.indexOf("[dayTapSeenKey]", start);
    expect(
      end,
      "handleDayTap's dependency array moved — retarget this pin"
    ).toBeGreaterThan(start);
    return HOME.slice(start, end);
  }

  it("sets the peek date — the behaviour every cell shares", () => {
    // The positive. Without it, the absence assertion below is satisfied
    // by a handler that was deleted or gutted entirely.
    expect(handleDayTapBody()).toContain("setPeekDate");
  });

  it("has no today branch short-circuiting the peek", () => {
    const body = handleDayTapBody();
    expect(
      body,
      "a today special-case is back in handleDayTap — tapping today " +
        "should open its card like every other day"
    ).not.toMatch(/localDateString\(\)|scrollIntoView/);
  });
});
