import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  profile: null as { liftingWeightUnit?: unknown } | null,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: h.profile }),
}));

import { LiftUnitProvider, useLiftUnit } from "../useLiftUnit";

function Unit() {
  return <span>{useLiftUnit()}</span>;
}

describe("useLiftUnit (Lift18)", () => {
  it("is kg with no provider", () => {
    render(<Unit />);
    expect(screen.getByText("kg")).toBeInTheDocument();
  });

  it("follows the profile's lifting unit, not its body-weight one", () => {
    h.profile = { liftingWeightUnit: "lbs" };
    const { unmount } = render(
      <LiftUnitProvider>
        <Unit />
      </LiftUnitProvider>
    );
    expect(screen.getByText("lbs")).toBeInTheDocument();
    unmount();
    h.profile = { liftingWeightUnit: undefined };
    render(
      <LiftUnitProvider>
        <Unit />
      </LiftUnitProvider>
    );
    expect(screen.getByText("kg")).toBeInTheDocument();
  });
});
