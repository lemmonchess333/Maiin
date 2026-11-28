// @vitest-environment jsdom
/**
 * The analytics line on the health-details agreement (owner, 23 November
 * 2026): what Google Analytics counts, ending in Turn off; once off, it
 * says so and points at Settings.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AnalyticsNotice from "../AnalyticsNotice";
import {
  USAGE_ANALYTICS_NOTICE,
  USAGE_ANALYTICS_OFF_NOTICE,
  USAGE_ANALYTICS_TURN_OFF,
} from "@/lib/usageAnalytics";

afterEach(cleanup);

describe("AnalyticsNotice", () => {
  it("ends the line in Turn off, a button with a 44 px target", () => {
    const onTurnOff = vi.fn();
    render(<AnalyticsNotice off={false} onTurnOff={onTurnOff} />);
    const line = screen.getByText(USAGE_ANALYTICS_NOTICE, { exact: false });
    const button = screen.getByRole("button", {
      name: USAGE_ANALYTICS_TURN_OFF,
    });
    expect(line).toContainElement(button);
    // 20 px of line plus 12 px above and below, taken back by the margin.
    expect(button.className).toMatch(/\bpy-3\b/);
    expect(button.className).toMatch(/-my-3\b/);
    expect(button.className).toMatch(/\bmin-w-11\b/);
    expect(button.className).toMatch(/\blink-inline\b/);
    fireEvent.click(button);
    expect(onTurnOff).toHaveBeenCalledTimes(1);
  });

  it("once off, says so and names Settings, with nothing to tap", () => {
    render(<AnalyticsNotice off onTurnOff={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      USAGE_ANALYTICS_OFF_NOTICE
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByText(USAGE_ANALYTICS_NOTICE, { exact: false })
    ).not.toBeInTheDocument();
  });
});
