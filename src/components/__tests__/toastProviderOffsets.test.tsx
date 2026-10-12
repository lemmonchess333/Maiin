/**
 * Toasts keep clear of the tab bar at the bottom, and only there.
 *
 * sonner reads a single offset value as all four sides. The 80px meant to
 * lift toasts above the tab bar was a string, so it was also the left and
 * right margin: on a 393px phone every toast was 233px wide, its title
 * wrapping and its action dropped onto a line of its own (Food pass,
 * "Greek yogurt with / honey deleted"). An object names the bottom alone
 * and leaves the sides at sonner's own margins.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const toaster = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));
vi.mock("sonner", () => ({
  Toaster: (props: Record<string, unknown>) => {
    toaster.props = props;
    return null;
  },
}));

import { ToastProvider } from "@/components/ToastProvider";

describe("ToastProvider — offsets", () => {
  it("lifts toasts above the tab bar on phones and wider screens, and sets no side margin", () => {
    render(<ToastProvider />);
    for (const key of ["offset", "mobileOffset"]) {
      const offset = toaster.props?.[key];
      expect(offset, key).toEqual({
        bottom: expect.stringContaining("80px"),
      });
    }
  });
});
