import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import type { CirclesSectionState } from "@/components/social/CirclesSection";
import CommunityView from "../CommunityView";

/* Soc13: Challenges sit above Spaces. A live Circle still leads; without
   one, Circles drops below both as the start/join card. */
let circlesState: CirclesSectionState = "none";

function CirclesStub({
  onStateChange,
}: {
  onStateChange: (s: CirclesSectionState) => void;
}) {
  useEffect(() => onStateChange(circlesState), [onStateChange]);
  return <div data-testid="section">circles</div>;
}
vi.mock("@/components/social/CirclesSection", () => ({
  default: CirclesStub,
}));
vi.mock("@/features/spaces/SpacesDirectory", () => ({
  default: () => <div data-testid="section">spaces</div>,
}));
vi.mock("@/lib/lazyRetry", () => ({
  lazyRetry: () => () => <div data-testid="section">challenges</div>,
}));

const order = async () => {
  render(
    <CommunityView
      active
      chromeHidden={false}
      uid="me"
      openPeople={() => {}}
      refreshRef={{ current: null }}
    />
  );
  await screen.findByText("challenges");
  return screen.getAllByTestId("section").map((el) => el.textContent);
};

describe("the Together page's order", () => {
  it("puts the challenge first, then Spaces, then Circles, without a live Circle", async () => {
    circlesState = "none";
    expect(await order()).toEqual(["challenges", "spaces", "circles"]);
  });

  it("does the same for a Circle still waiting on its first invite", async () => {
    circlesState = "solo";
    expect(await order()).toEqual(["challenges", "spaces", "circles"]);
  });

  it("leads with a live Circle, then the challenge, then Spaces", async () => {
    circlesState = "live";
    expect(await order()).toEqual(["circles", "challenges", "spaces"]);
  });
});
