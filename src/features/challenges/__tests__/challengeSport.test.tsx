/**
 * A challenge's bar fills in its sport's colour: coral for running, purple
 * for lifting, the brand purple for a mixed or time challenge. The tier
 * metal is the marker's and the badge's, as a ring, never the fill. A
 * bronze fill beside purple and coral read as the food orange, and silver
 * and gold fills all but vanished on a light card.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { createRequire } from "node:module";
import { Timestamp } from "firebase/firestore";
import { THEME } from "@/lib/theme";
import {
  challengeSport,
  METRIC_SPORT,
  SPORT_ACCENT,
  SPORT_BAR_FILL,
} from "../challengeSport";
import { ChallengeCard } from "../ChallengeCard";
import { TIER_COLORS } from "../useChallenges";
import type {
  Challenge,
  ChallengeParticipant,
  ChallengeTier,
} from "../useChallenges";

vi.mock("firebase/firestore");
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => "km" }));
vi.mock("../useChallengePercentile", () => ({
  useChallengePercentile: () => null,
}));
vi.mock("@/lib/editorialImages", () => ({
  challengeEditorialImage: () => null,
}));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => null,
}));

afterEach(() => cleanup());

describe("challengeSport — the metric's sport", () => {
  it.each([
    ["total_km", "running"],
    ["fastest_effort", "running"],
    ["total_volume", "lifting"],
    ["workout_count", "lifting"],
    ["hybrid_score", "mixed"],
    ["active_days", "mixed"],
    ["training_minutes", "mixed"],
  ] as const)("%s is a %s challenge", (metric, sport) => {
    expect(challengeSport(metric)).toBe(sport);
  });

  it("reads a metric it does not know as mixed, the brand purple", () => {
    expect(challengeSport("streak_days")).toBe("mixed");
    expect(challengeSport("constructor")).toBe("mixed");
    expect(challengeSport("")).toBe("mixed");
  });

  it("places every metric the server's challenges use", () => {
    const require = createRequire(import.meta.url);
    const { buildCurrentChallenges } =
      require("../../../../functions/lib/challengeDefs") as {
        buildCurrentChallenges: (now: Date) => { metric: string }[];
      };
    const metrics = new Set<string>();
    // A year of months covers every season and every featured rotation.
    for (let month = 0; month < 12; month++)
      for (const c of buildCurrentChallenges(
        new Date(Date.UTC(2026, month, 15))
      ))
        metrics.add(c.metric);
    expect(metrics.size).toBeGreaterThan(3);
    for (const metric of metrics)
      expect(Object.hasOwn(METRIC_SPORT, metric), metric).toBe(true);
  });

  it("colours each sport with its own identity, never a tier metal", () => {
    expect(SPORT_ACCENT).toEqual({
      running: THEME.running,
      lifting: THEME.lifting,
      mixed: THEME.brand,
    });
    expect(SPORT_BAR_FILL).toEqual({
      running: "bg-running",
      lifting: "bg-lifting",
      mixed: "bg-primary",
    });
    const metals = Object.values(THEME.tier);
    for (const colour of Object.values(SPORT_ACCENT))
      expect(metals).not.toContain(colour);
  });
});

function challenge(metric: string, over: Partial<Challenge> = {}): Challenge {
  const now = Date.now();
  return {
    id: `c-${metric}`,
    name: "Challenge",
    description: "A month of it",
    type: "monthly",
    metric,
    icon: "trophy",
    tiers: { bronze: 10, silver: 20, gold: 30 },
    startDate: Timestamp.fromMillis(now - 86400_000),
    endDate: Timestamp.fromMillis(now + 86400_000),
    participantCount: 10,
    ...over,
  } as Challenge;
}

function participant(
  uid: string,
  currentValue: number,
  tierAchieved: ChallengeTier | null
) {
  return {
    uid,
    currentValue,
    tierAchieved,
    displayName: uid,
  } as unknown as ChallengeParticipant;
}

function renderJoined(
  c: Challenge,
  me: ChallengeParticipant,
  leaderboard: ChallengeParticipant[] = []
) {
  return render(
    <ChallengeCard
      challenge={c}
      myProgress={me}
      leaderboard={leaderboard}
      joined={true}
      onJoin={() => {}}
      onLeave={() => {}}
    />
  );
}

/** The bar's fill: the one child of the track. */
function barFill(container: HTMLElement): HTMLElement {
  const fill = container.querySelector(".h-2.bg-muted > div");
  expect(fill, "the progress bar renders").not.toBeNull();
  return fill as HTMLElement;
}

describe("the challenge card's bar", () => {
  it.each([
    ["total_km", "bg-running"],
    ["total_volume", "bg-lifting"],
    ["hybrid_score", "bg-primary"],
    ["training_minutes", "bg-primary"],
  ])("%s fills in %s, whatever tier is reached", (metric, fill) => {
    for (const [value, tier] of [
      [5, null],
      [12, "bronze"],
      [25, "silver"],
      [31, "gold"],
    ] as const) {
      const { container } = renderJoined(
        challenge(metric),
        participant("me", value, tier)
      );
      const bar = barFill(container);
      expect(bar.className, `${metric} at ${tier ?? "no tier"}`).toContain(
        fill
      );
      expect(bar.style.backgroundColor).toBe("");
      cleanup();
    }
  });

  it("fills a reached group goal in its sport's colour, not gold", () => {
    const c = challenge("total_km", {
      collectiveTarget: 100,
      tiers: { bronze: 100, silver: 100, gold: 100 },
    });
    const { container } = renderJoined(c, participant("me", 60, null), [
      participant("me", 60, null),
      participant("b", 50, null),
    ]);
    const bar = barFill(container);
    expect(bar.className).toContain("bg-running");
    expect(bar.style.backgroundColor).toBe("");
  });

  it("rings the tier badge in the metal, round a trophy in the text colour", () => {
    renderJoined(challenge("total_km"), participant("me", 12, "bronze"));
    const badge = screen.getByRole("img", { name: "Bronze achieved" });
    expect(badge.className).toContain("text-foreground");
    expect(badge.style.backgroundColor).toBe("");
    expect(badge.style.boxShadow).toContain("inset");
    expect(badge.getAttribute("style")).toMatch(/box-shadow:[^;]*2px/);
    expect(badge.querySelector("svg")?.getAttribute("class")).not.toMatch(
      /text-white/
    );
  });

  it("keeps the metal on the reached tier's marker", () => {
    renderJoined(challenge("total_km"), participant("me", 12, "bronze"));
    const dot = screen.getByText("10 km")
      .previousElementSibling as HTMLElement | null;
    expect(dot).not.toBeNull();
    // jsdom serialises the colour as rgb(); compare against the metal.
    const probe = document.createElement("div");
    probe.style.backgroundColor = TIER_COLORS.bronze;
    expect(dot!.style.backgroundColor).toBe(probe.style.backgroundColor);
  });

  it("writes a leaderboard tier in the text colour, ringed in its metal", () => {
    const board = ["a", "b", "c", "d"].map((uid, i) =>
      participant(uid, 31 - i * 7, null)
    );
    renderJoined(
      challenge("total_volume"),
      participant("a", 31, "gold"),
      board
    );
    fireEvent.click(screen.getByRole("button", { name: /Full leaderboard/ }));
    const gold = screen.getByText("Gold", { selector: "span.rounded-full" });
    expect(gold.className).toContain("text-foreground");
    expect(gold.style.color).toBe("");
    expect(gold.style.boxShadow).toContain("inset");
  });
});
