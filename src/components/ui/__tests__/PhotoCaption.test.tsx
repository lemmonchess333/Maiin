/**
 * Every photo card on Together (a Space, a race) puts its words on the
 * one scrim, which runs behind the words themselves and
 * so grows with a two-line name, and lets the name take two lines rather
 * than cutting it on its first. White text on a bright photo (the bridge
 * lights behind "Supernova Forth Road Bridge 5K") was hard to read on a
 * scrim fixed to a share of the card.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Timestamp } from "firebase/firestore";
import type { Challenge } from "@/features/challenges/useChallenges";
import type { SpaceDirectoryEntry } from "@/features/spaces/useSpacesDirectory";

vi.mock("firebase/firestore");
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => "km" }));
vi.mock("@/features/challenges/useChallengePercentile", () => ({
  useChallengePercentile: () => null,
}));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => null,
}));
/* A photo for every card, so each draws its photo caption. */
vi.mock("@/lib/editorialImages", () => ({
  spaceEditorialImage: () => "/photo.webp",
}));
const directory = vi.hoisted(() => ({ entries: [] as unknown[] }));
vi.mock("@/features/spaces/useSpacesDirectory", () => ({
  useSpacesDirectory: () => ({
    entries: directory.entries,
    upcomingRaces: directory.entries
      .map((e) => (e as SpaceDirectoryEntry).def)
      .filter((d) => d.kind === "race"),
    refresh: vi.fn(),
  }),
}));

import { ChallengeCard } from "@/features/challenges/ChallengeCard";
import SpacesDirectory from "@/features/spaces/SpacesDirectory";

afterEach(() => cleanup());

/** The name is on the shared scrim and may take two lines. */
function expectCaptioned(name: string) {
  const title = screen.getByText(name);
  expect(title.closest('[data-photo-caption="scrim"]')).not.toBeNull();
  expect(title.className).toContain("line-clamp-2");
  expect(title.className).not.toContain("truncate");
}

describe("photo card captions on Together", () => {
  it("a challenge's header is its medal, not a photo, and its name takes two lines", () => {
    const now = Date.now();
    const challenge = {
      id: "monthly-2026-11-01",
      name: "November Mileage",
      description: "",
      type: "monthly",
      metric: "total_km",
      icon: "footprints",
      tiers: { bronze: 10, silver: 25, gold: 50 },
      startDate: Timestamp.fromMillis(now - 86_400_000),
      endDate: Timestamp.fromMillis(now + 86_400_000),
      participantCount: 0,
    } as unknown as Challenge;
    render(
      <ChallengeCard
        challenge={challenge}
        joined={false}
        onJoin={() => {}}
        onLeave={() => {}}
      />
    );
    // A challenge carries no photograph (Soc16): its picture is its medal.
    const title = screen.getByText("November Mileage");
    const band = title.closest("[data-challenge-medal-band]");
    expect(band).not.toBeNull();
    expect(band!.querySelector("img")).toBeNull();
    expect(band!.querySelector("[data-medal-tier]")).toHaveAttribute(
      "data-medal-tier",
      "bronze"
    );
    expect(title.className).toContain("line-clamp-2");
    expect(title.className).not.toContain("truncate");
  });

  it("a Space and a race in the directory", () => {
    directory.entries = [
      {
        def: {
          id: "runners",
          name: "Runners who lift on the weekend",
          tagline: "t",
          kind: "interest",
          accent: "running",
          icon: "footprints",
        },
        memberCount: 12,
        joined: true,
      },
      {
        def: {
          id: "supernova",
          name: "Supernova Forth Road Bridge 5K",
          tagline: "t",
          kind: "race",
          accent: "running",
          icon: "flag",
          event: {
            dateKey: "2099-09-13",
            distance: "5k",
            city: "Edinburgh",
            countryCode: "GB",
            countryFlag: "🏴",
            websiteUrl: "https://example.org/",
          },
        },
        memberCount: 2,
        joined: false,
      },
    ] satisfies SpaceDirectoryEntry[];
    render(
      <MemoryRouter>
        <SpacesDirectory />
      </MemoryRouter>
    );
    expectCaptioned("Runners who lift on the weekend");
    expectCaptioned("Supernova Forth Road Bridge 5K");
    // The tags at the top sit above the caption's scrim.
    expect(screen.getByText("Joined").closest("span")!.className).toContain(
      "z-10"
    );
  });
});
