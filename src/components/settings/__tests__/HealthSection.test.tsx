/**
 * Settings → Health while Apple Health is still loading: no guess at a
 * state, no 0 and no "No steps yet" alert.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const steps = vi.hoisted(() => ({
  value: {
    status: "ambiguous",
    steps: null as number | null,
    connect: () => Promise.resolve(),
    pending: true,
  },
}));
vi.mock("@/hooks/useSteps", () => ({ useSteps: () => steps.value }));
vi.mock("@/lib/healthKit", () => ({ openHealthSettings: vi.fn() }));
vi.mock("@/components/AccordionSection", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import HealthSection from "../HealthSection";

afterEach(cleanup);

describe("HealthSection", () => {
  it("shows a placeholder while loading, not a 0 or an alert", () => {
    render(<HealthSection />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("Not available here")).toBeNull();
  });

  it("shows the answer once loaded", () => {
    steps.value = {
      ...steps.value,
      pending: false,
      status: "connected",
      steps: 4200,
    };
    render(<HealthSection />);
    expect(screen.getByText("Apple Health connected")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
