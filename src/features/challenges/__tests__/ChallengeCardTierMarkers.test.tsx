/**
 * Tier markers on a lower-is-better (fastest_effort) challenge.
 *
 * Probe sweep 2026-08-05, verifier-confirmed: gold is the SMALLEST
 * threshold for fastest_effort, so the higher-is-better `value / max`
 * mapping put bronze at 140% and silver at 120% — clamped, all three
 * markers and their labels overprinted at left:100%, and the labels
 * rendered raw seconds ("2100") beside a personal line already formatted
 * mm:ss. The bar FILL got its lower-is-better branch in an earlier pass;
 * the markers were the oversight. Markers now share the fill's
 * `max / value` scale, so the fill edge crosses each marker exactly at
 * its threshold.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import { ChallengeCard } from "../ChallengeCard";
import type { Challenge, ChallengeParticipant } from "../useChallenges";

vi.mock("firebase/firestore");
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
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

function makeChallenge(
  metric: string,
  tiers: { bronze: number; silver: number; gold: number }
): Challenge {
  const now = Date.now();
  return {
    id: `c-${metric}`,
    name: "Fastest 5K",
    description: "Best 5K time this month",
    type: "monthly",
    metric,
    icon: "footprints",
    tiers,
    startDate: Timestamp.fromMillis(now - 86400_000),
    endDate: Timestamp.fromMillis(now + 86400_000),
    participantCount: 10,
  } as Challenge;
}

function renderJoined(challenge: Challenge, currentValue: number) {
  const myProgress = {
    uid: "u1",
    currentValue,
    tierAchieved: null,
  } as unknown as ChallengeParticipant;
  return render(
    <ChallengeCard
      challenge={challenge}
      myProgress={myProgress}
      joined={true}
      onJoin={() => {}}
      onLeave={() => {}}
    />
  );
}

/** The marker wrapper div carries the style.left — walk up from the label. */
function markerLeft(label: string): string {
  const el = screen.getByText(label);
  const wrapper = el.parentElement as HTMLElement;
  return wrapper.style.left;
}

describe("fastest_effort tier markers", () => {
  // Production Fastest 5K tiers (challengeDefs.js): lower is better.
  const TIERS = { bronze: 2100, silver: 1800, gold: 1500 };

  it("spread across the bar on the fill's own scale, not stacked at 100%", () => {
    renderJoined(makeChallenge("fastest_effort", TIERS), 2400);
    // max / value: bronze 1500/2100 ≈ 71.4%, silver 1500/1800 ≈ 83.3%,
    // gold 100%. Pre-fix all three read "100%".
    expect(markerLeft("35:00")).toMatch(/^71\.4/);
    expect(markerLeft("30:00")).toMatch(/^83\.3/);
    expect(markerLeft("25:00")).toBe("100%");
  });

  it("labels format as mm:ss, matching the personal line on the same card", () => {
    renderJoined(makeChallenge("fastest_effort", TIERS), 2400);
    // Raw seconds must not appear anywhere on the card.
    expect(screen.queryByText("2100")).toBeNull();
    expect(screen.queryByText("1800")).toBeNull();
    expect(screen.queryByText("1500")).toBeNull();
  });

  it("higher-is-better markers keep their original mapping", () => {
    renderJoined(
      makeChallenge("hybrid_score", {
        bronze: 3000,
        silver: 8000,
        gold: 15000,
      }),
      9000
    );
    expect(markerLeft("3,000")).toBe("20%");
    expect(markerLeft("15,000")).toBe("100%");
  });
});
