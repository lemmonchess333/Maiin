import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { restoreRealTimers } from "@/test/fakeTimers";
import StepDetails, { STEP_DETAILS_AFTER_MS } from "../StepDetails";

const native = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => native.value }));

beforeEach(() => {
  native.value = true;
});
afterEach(async () => {
  await restoreRealTimers();
});

it("offers the steps under a failed checkout on the iPhone", () => {
  render(<StepDetails failed waiting={false} />);
  expect(screen.getByText("Details")).toBeInTheDocument();
});

it("offers them under a checkout still waiting after 15 seconds, not before", async () => {
  vi.useFakeTimers();
  render(<StepDetails failed={false} waiting />);
  await act(async () => {
    vi.advanceTimersByTime(STEP_DETAILS_AFTER_MS - 1);
  });
  expect(screen.queryByText("Taking a while? Details")).toBeNull();
  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.getByText("Taking a while? Details")).toBeInTheDocument();
});

it("shows nothing on the web, or for a checkout that is neither", () => {
  const { rerender } = render(<StepDetails failed={false} waiting={false} />);
  expect(screen.queryByText(/Details/)).toBeNull();
  native.value = false;
  rerender(<StepDetails failed waiting={false} />);
  expect(screen.queryByText(/Details/)).toBeNull();
});
