import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import PeriodOverview from "../PeriodOverview";

vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => "km" }));

/**
 * The summary rings measure against the user's OWN weekly targets.
 *
 * They used to measure against a flat five per week the app picked, and
 * that was wrong in both directions at once. A three-day lifter hitting
 * every scheduled session read 60% full — the surface most likely to say
 * "you are on plan" telling them they were behind. A freeform runner,
 * who by definition has no run plan, was scored against five runs a week
 * they never agreed to.
 *
 * Both figures were already on the profile. `daysPerWeek` is onboarding's
 * own question, and `getWeeklyRunTarget` is the canonical run resolver —
 * whose default is 0 precisely because "no plan" is a real answer.
 */

/** Fraction of the ring's circumference the progress arc covers. */
function arcFraction(svg: SVGElement): number | null {
  const arc = [...svg.querySelectorAll("circle")].find((c) =>
    c.getAttribute("stroke-dasharray")
  );
  if (!arc) return null; // no target → track only
  const [drawn, total] = arc
    .getAttribute("stroke-dasharray")!
    .split(" ")
    .map(Number);
  return drawn / total;
}

function rings(props: Partial<Parameters<typeof PeriodOverview>[0]> = {}) {
  const { container } = render(
    <PeriodOverview
      runCount={0}
      runDistance={0}
      liftCount={0}
      liftVolume={0}
      avgCalories={0}
      nutritionAdherence={0}
      rangeDays={7}
      {...props}
    />
  );
  /* Each column renders TWO svgs — the ring and the lucide icon sitting
     inside it — so select the rings by the rotation that starts their
     arc at twelve o'clock rather than by document order. */
  const svgs = [...container.querySelectorAll("svg")].filter((el) =>
    (el.getAttribute("style") ?? "").includes("rotate(-90deg)")
  );
  expect(svgs).toHaveLength(3);
  return { runs: svgs[0], sessions: svgs[1], adherence: svgs[2] };
}

describe("summary rings measure the user's own target", () => {
  it("a three-day lifter who trained three times reads full", () => {
    /* The headline case. At the old flat five this read 0.6 — behind,
       for a week in which they did exactly what they planned. */
    const { sessions } = rings({ liftCount: 3, weeklyLiftTarget: 3 });
    expect(arcFraction(sessions)).toBe(1);
  });

  it("a six-day lifter who trained three times reads half", () => {
    const { sessions } = rings({ liftCount: 3, weeklyLiftTarget: 6 });
    expect(arcFraction(sessions)).toBe(0.5);
  });

  it("prorates the target across a longer range", () => {
    // 3/week over 30 days → 13 sessions.
    const { sessions } = rings({
      liftCount: 13,
      weeklyLiftTarget: 3,
      rangeDays: 30,
    });
    expect(arcFraction(sessions)).toBe(1);
  });

  it("never exceeds a full ring", () => {
    const { sessions } = rings({ liftCount: 99, weeklyLiftTarget: 3 });
    expect(arcFraction(sessions)).toBe(1);
  });

  it("draws NO arc when the user has set no target", () => {
    /* A freeform runner. The old code ran `Math.max(1, …)`, which turned
       "no plan" into "one a week" and filled the ring on the first run —
       a completed target nobody set. */
    const { runs } = rings({ runCount: 4, weeklyRunTarget: 0 });
    expect(arcFraction(runs)).toBeNull();
  });

  it("an absent target behaves as no target, not as five", () => {
    const { runs, sessions } = rings({ runCount: 4, liftCount: 4 });
    expect(arcFraction(runs)).toBeNull();
    expect(arcFraction(sessions)).toBeNull();
  });

  it("still shows the count when there is no target to draw", () => {
    // The ring is decoration; the figure beneath it carries the meaning,
    // so losing the arc must not lose the number.
    const { container } = render(
      <PeriodOverview
        runCount={4}
        runDistance={0}
        liftCount={0}
        liftVolume={0}
        avgCalories={0}
        nutritionAdherence={0}
        rangeDays={7}
      />
    );
    expect(container.textContent).toContain("4");
    expect(container.textContent).toContain("Runs");
  });

  it("adherence is a percentage and keeps its own scale", () => {
    // Not a session count — its target is 100 and does not come from
    // the profile, so the change above must not have touched it.
    const { adherence } = rings({ nutritionAdherence: 40 });
    expect(arcFraction(adherence)).toBeCloseTo(0.4, 5);
  });

  it("is not the old flat five", () => {
    /* The regression this exists to stop. Under the old rule a
       three-session week against a three-day plan drew 3/5. */
    const { sessions } = rings({ liftCount: 3, weeklyLiftTarget: 3 });
    expect(arcFraction(sessions)).not.toBeCloseTo(0.6, 5);
  });
});

describe("History feeds the rings from the profile, not a literal", () => {
  /* The component tests above cannot see this. Passing `weeklyLiftTarget={5}`
     from the call site reproduces the exact defect with every one of them
     still green — the same "tested copy is not the running copy" shape the
     house rules name. */
  const history = readFileSync("src/pages/History.tsx", "utf8");

  it("takes the lift target from the profile", () => {
    expect(history).toMatch(/weeklyLiftTarget=\{profile\?\.daysPerWeek/);
  });

  it("takes the run target through the canonical resolver", () => {
    /* Not `profile.weeklyRunsTarget` directly: onboarding writes BOTH that
       and `weeklyRunDaysTarget`, the apply path writes only one, and
       `getWeeklyRunTarget` is the resolver that reconciles them. */
    expect(history).toMatch(
      /weeklyRunTarget=\{getWeeklyRunTarget\(profile\)\}/
    );
  });

  it("passes no numeric literal to either", () => {
    expect(history).not.toMatch(/weekly(Lift|Run)Target=\{\d/);
  });
});
