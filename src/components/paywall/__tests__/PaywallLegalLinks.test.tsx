/**
 * App Store Guideline 3.1.2: every auto-renewable-subscription surface must
 * carry functional Terms + Privacy links. Apple checks this at review, and a
 * missing link is a standard first-submission rejection — which makes it a
 * launch gate, not polish (CLAUDE.md "App Store listing" section).
 *
 * Re-cut 2026-08-03 from PR #1456 after that branch drifted unmergeable.
 * The gap was real at re-cut time: neither ProModal nor Upgrade rendered any
 * legal link on main.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { PaywallLegalLinks } from "../PaywallLegalLinks";
// Vite `?raw` imports — the actual shipped source of both paywall surfaces,
// so the wiring assertions below can't pass against a stale copy.
import proModalSource from "@/components/ProModal.tsx?raw";
import upgradeSource from "@/pages/Upgrade.tsx?raw";

describe("PaywallLegalLinks", () => {
  it("links to the same in-app legal routes Settings uses", () => {
    render(
      <MemoryRouter>
        <PaywallLegalLinks />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms"
    );
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
  });
});

describe("both paywall surfaces carry the links (3.1.2 wiring)", () => {
  // Rendering ProModal/Upgrade end-to-end needs the auth + checkout stack;
  // what 3.1.2 actually requires is that the component is IN each surface.
  // Pin the wiring on the shipped source text so deleting either usage —
  // the regression that matters — fails here rather than at App Review.
  it("ProModal renders PaywallLegalLinks", () => {
    expect(proModalSource).toContain("<PaywallLegalLinks />");
  });

  it("Upgrade renders PaywallLegalLinks and an iOS restore affordance", () => {
    expect(upgradeSource).toContain("<PaywallLegalLinks />");
    // Guideline 3.1.2's sibling requirement — a restore mechanism on the
    // purchase surface. ProModal already had one; Upgrade gained parity.
    expect(upgradeSource).toContain("Restore purchases");
  });
});
