/**
 * The weekly layout's day cells are cards with their session's tint over
 * them, and their words clear §10. The tint was set with the `background`
 * shorthand, which reset `bg-card` and laid it over the sheet: a grey
 * wash on light. On the card, the identity colour as text measures 3.3 to
 * 4.7:1 at caption size, so the label takes the colour's -strong step.
 *
 * vaul's BottomSheet portals out of the test container, so queries use
 * `screen`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import ScheduleLayoutSheet from "../ScheduleLayoutSheet";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

afterEach(cleanup);

const profile = {
  uid: "u-1",
  displayName: "Test",
  email: "t@example.com",
  weeklyWorkoutsTarget: 4,
  weeklyRunDaysTarget: 2,
  runMode: "starter",
} as UserProfile;

function open() {
  render(
    <ScheduleLayoutSheet
      open
      onClose={() => {}}
      profile={profile}
      updateProfile={vi.fn(async () => ({ ok: true }) as UpdateProfileResult)}
      refreshRunSchedule={vi.fn(async () => {})}
      regenerateProgram={vi.fn(async () => {})}
    />
  );
}

const cells = (label: string) =>
  screen.getAllByRole("button", {
    name: new RegExp(`: ${label}\\. Tap to change\\.$`),
  });

describe("the weekly layout's day cells", () => {
  it("lay their session's tint over the card, never in its place", () => {
    open();
    for (const cell of [...cells("Lift"), ...cells("Run")]) {
      expect(cell.className.split(/\s+/)).toContain("bg-card");
      const style = cell.getAttribute("style") ?? "";
      expect(style).toMatch(/background-image:\s*linear-gradient/);
      expect(style).not.toMatch(/(^|;)\s*background:/);
    }
  });

  it("name the session in its colour's text step", () => {
    open();
    for (const cell of cells("Lift"))
      expect(within(cell).getByText("Lift").className).toContain(
        "text-lifting-strong"
      );
    for (const cell of cells("Run"))
      expect(within(cell).getByText("Run").className).toContain(
        "text-running-strong"
      );
  });
});
