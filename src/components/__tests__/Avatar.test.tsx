import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Avatar from "../Avatar";

/* The Avatar component is the single source of truth for fallback
 * letters across the social surface (leaderboard rows, comments,
 * activity-card author rows, suggestions, search). The `fallbackInitial`
 * prop was added in PR G specifically so leaderboards can keep
 * displayName="You" for the row label while still showing the user's
 * actual first letter in the fallback circle — fixing the "Y" avatar
 * that was visible on the live build. These tests pin that contract. */

describe("Avatar fallback letter", () => {
  it("uses fallbackInitial when provided, even if displayName is set", () => {
    render(<Avatar displayName="You" fallbackInitial="M" />);
    expect(screen.getByText("M")).toBeTruthy();
    expect(screen.queryByText("Y")).toBeNull();
  });

  it("falls back to displayName.charAt(0) when fallbackInitial is absent", () => {
    render(<Avatar displayName="Myles" />);
    expect(screen.getByText("M")).toBeTruthy();
  });

  it("uppercases the fallback letter regardless of input casing", () => {
    render(<Avatar fallbackInitial="m" />);
    expect(screen.getByText("M")).toBeTruthy();
  });

  it("ignores leading whitespace in fallbackInitial", () => {
    render(<Avatar fallbackInitial=" alex " />);
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("renders '?' when both displayName and fallbackInitial are missing", () => {
    render(<Avatar />);
    expect(screen.getByText("?")).toBeTruthy();
  });

  it("renders '?' when fallbackInitial is an empty string", () => {
    render(<Avatar displayName="" fallbackInitial="" />);
    expect(screen.getByText("?")).toBeTruthy();
  });

  it("falls through to displayName when fallbackInitial is null", () => {
    render(<Avatar displayName="Sara" fallbackInitial={null} />);
    expect(screen.getByText("S")).toBeTruthy();
  });

  it("renders an image when photoURL is provided (no initial in DOM)", () => {
    render(
      <Avatar photoURL="https://example.com/me.jpg" displayName="You" fallbackInitial="M" />,
    );
    expect(screen.queryByText("M")).toBeNull();
    expect(screen.queryByText("Y")).toBeNull();
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe("https://example.com/me.jpg");
  });
});
