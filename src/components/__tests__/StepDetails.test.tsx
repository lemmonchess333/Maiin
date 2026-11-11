import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { restoreRealTimers } from "@/test/fakeTimers";
import StepDetails, { STEP_DETAILS_AFTER_MS } from "../StepDetails";
import { remove, writeString } from "@/lib/localStore";

const native = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => native.value }));

beforeEach(() => {
  native.value = true;
});
afterEach(async () => {
  await restoreRealTimers();
  remove("tropos-step-details");
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

it("on the web, shows the link only when localStorage asks for it", () => {
  native.value = false;
  writeString("tropos-step-details", "on");
  render(<StepDetails failed waiting={false} />);
  expect(screen.getByText("Details")).toBeInTheDocument();
});

it("on a dark overlay, the link and the list take light ink", () => {
  render(<StepDetails failed waiting={false} onDark />);
  expect(screen.getByText("Details").className).toContain("text-white/75");
  expect(screen.getByRole("list").className).toContain("bg-white/10");
});

it("keeps the list to a box that scrolls, so forty steps never push the actions away", () => {
  render(<StepDetails failed waiting={false} />);
  const list = screen.getByRole("list");
  expect(list.className).toContain("max-h-48");
  expect(list.className).toContain("overflow-y-auto");
});
