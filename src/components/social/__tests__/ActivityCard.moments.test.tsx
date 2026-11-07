import { beforeEach, describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActivityCard from "../ActivityCard";
import type { FeedItem } from "../../../hooks/useSocialFeed";
import { LiftUnitContext } from "@/hooks/useLiftUnit";
import type { LiftUnit } from "@/lib/liftLoad";
import type { DistanceUnit } from "@/lib/distanceUnits";

const h = vi.hoisted(() => ({ distanceUnit: "km" as DistanceUnit }));

vi.mock("../../../lib/auth", () => ({
  useAuth: () => ({ user: { uid: "viewer" }, profile: null }),
}));
vi.mock("../../../lib/socialApi", () => ({
  giveHighFive: vi.fn(),
  getKudosList: vi.fn(async () => []),
  blockUser: vi.fn(),
}));
vi.mock("../../../hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("../../../hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ addBlocked: vi.fn(), blocked: new Set() }),
}));
vi.mock("../../../hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => h.distanceUnit,
}));

/**
 * Moments on a post (Soc15): drawn from the post's own kinds and numbers
 * in the reader's units, above the action row. A post from before them
 * keeps its PR and challenge lines, and a post with neither draws nothing
 * new.
 */

const BENCH_ROW = {
  name: "Bench Press",
  exerciseId: "bench-press",
  summary: "3×5×90 kg",
  setCount: 3,
  targetReps: 5,
  targetWeightKg: 90,
};

const post = (
  type: "run" | "workout",
  activity: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) =>
  ({
    id: "a1",
    activityId: "a1",
    authorId: "author",
    authorName: "Test Author",
    type,
    summary: "",
    createdAt: { toDate: () => new Date() },
    kudosCount: 0,
    activity: {
      authorId: "author",
      authorName: "Test Author",
      type,
      ...activity,
    },
    ...extra,
  }) as unknown as FeedItem;

const draw = (item: FeedItem, liftUnit: LiftUnit = "kg") => {
  const { container } = render(
    <LiftUnitContext value={liftUnit}>
      <MemoryRouter>
        <ActivityCard feedItem={item} />
      </MemoryRouter>
    </LiftUnitContext>
  );
  return {
    text: (container.textContent ?? "").replace(/\u00A0/g, " "),
    tiles: [...container.querySelectorAll("[data-moment-tone]")].map((el) =>
      el.getAttribute("data-moment-tone")
    ),
  };
};

describe("moments on the feed card", () => {
  beforeEach(() => {
    h.distanceUnit = "km";
  });

  it("draws a lift's moments, and its PR count on the hero", () => {
    const { text, tiles } = draw(
      post("workout", {
        activityTitle: "Push",
        totalVolume: 4200,
        exercises: [BENCH_ROW],
        prCount: 2,
        moments: [
          { kind: "streak", days: 30 },
          { kind: "pr", exercise: "Bench Press", weightKg: 90, reps: 5 },
          { kind: "planWeek", week: 4, weeks: 12 },
        ],
      })
    );
    expect(text).toContain("30-day streak");
    expect(text).toContain("New PR");
    expect(text).toContain("Bench Press 90 kg × 5");
    expect(text).toContain("Week 4 of 12 done");
    expect(text).toContain("2 PRs");
    expect(tiles).toEqual(["milestone", "best", "milestone"]);
  });

  it("draws a first session in its sport's colour: coral on a run", () => {
    const tile = (type: "run" | "workout") => {
      const { container, unmount } = render(
        <MemoryRouter>
          <ActivityCard
            feedItem={post(type, { moments: [{ kind: "firstSession" }] })}
          />
        </MemoryRouter>
      );
      const cls =
        container.querySelector("[data-moment-tone]")?.className ?? "";
      unmount();
      return cls;
    };
    expect(tile("run")).toContain("text-running-strong");
    expect(tile("run")).not.toContain("text-primary");
    expect(tile("workout")).toContain("text-primary");
  });

  it("reads a lift's PR in the reader's load unit", () => {
    const { text } = draw(
      post("workout", {
        exercises: [BENCH_ROW],
        moments: [
          { kind: "pr", exercise: "Bench Press", weightKg: 90, reps: 5 },
        ],
      }),
      "lbs"
    );
    expect(text).toContain("Bench Press 198.4 lb × 5");
  });

  it("draws a run's moments in the reader's distance unit", () => {
    h.distanceUnit = "mi";
    const { text, tiles } = draw(
      post("run", {
        runName: "Sunday long run",
        distance: 21300,
        duration: 6900,
        avgPace: 324,
        moments: [
          { kind: "firstDistance", meters: 21097 },
          { kind: "fastestEffort", meters: 5000, seconds: 1361 },
          { kind: "longestRun", meters: 21300 },
        ],
      })
    );
    expect(text).toContain("First half marathon");
    expect(text).toContain("Fastest 5K");
    expect(text).toContain("22:41");
    expect(text).toContain("Longest run yet");
    expect(text).toContain("13.2 mi");
    expect(tiles).toEqual(["best", "best", "best"]);
  });

  it("still draws an older post's PR and challenge lines as before", () => {
    const { text, tiles } = draw(
      post(
        "workout",
        {
          exercises: [BENCH_ROW],
          prHit: true,
          prExercise: "Bench Press",
          prWeight: 100,
          challengeMilestone: "Week 3 complete",
        },
        { prHit: true, prExercise: "Bench Press", prWeight: 100 }
      )
    );
    expect(text).toContain("New PR: Bench Press 100 kg");
    expect(text).toContain("Week 3 complete");
    expect(tiles).toEqual([]);
  });

  it("draws nothing new for a post with no moments, or none it can read", () => {
    for (const moments of [undefined, [], [{ kind: "localLegend" }], "PR"]) {
      const { text, tiles } = draw(
        post("workout", { exercises: [BENCH_ROW], moments })
      );
      expect(tiles).toEqual([]);
      expect(text).not.toContain("New PR");
      expect(text).not.toContain("streak");
    }
  });
});
