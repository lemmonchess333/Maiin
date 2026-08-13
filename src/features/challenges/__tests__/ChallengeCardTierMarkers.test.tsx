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

/**
 * Edge labels must stay inside the bar.
 *
 * Device screenshot, 2026-08-13: the August Hybrid Hero card rendered its
 * gold tier as "15,00" and then the screen edge. Gold sits at exactly
 * `left: 100%` by construction — it IS `max` — and the marker wrapper is
 * centred with `-translate-x-1/2`, so half the label always hung past the
 * bar. Any tiered challenge whose gold label is wide enough clips.
 *
 * The dot must NOT move with it: its whole job is marking where the fill
 * edge crosses its threshold, so only the text is pulled back.
 */
describe("tier labels at the extremes", () => {
  function labelFor(text: string): HTMLElement {
    const el = screen.getByText(text);
    return el;
  }

  it("pulls the gold label back inside instead of centring it off the edge", () => {
    // higher-is-better, so gold (15,000) lands at left:100%.
    renderJoined(
      makeChallenge("hybrid_score", {
        bronze: 3000,
        silver: 8000,
        gold: 15000,
      }),
      44
    );
    expect(labelFor("15,000").className).toContain("-translate-x-1/2");
  });

  it("leaves a mid-bar label centred on its threshold", () => {
    /* The pull-back is for the extremes only — a silver marker at ~53%
       has room on both sides and should stay centred, or every label
       would sit off-centre from its own tick. */
    renderJoined(
      makeChallenge("hybrid_score", {
        bronze: 3000,
        silver: 8000,
        gold: 15000,
      }),
      44
    );
    expect(labelFor("8,000").className).not.toContain("translate-x");
  });

  it("keeps the label on one line so it cannot wrap instead of clipping", () => {
    renderJoined(
      makeChallenge("hybrid_score", {
        bronze: 3000,
        silver: 8000,
        gold: 15000,
      }),
      44
    );
    expect(labelFor("15,000").className).toContain("whitespace-nowrap");
  });
});
