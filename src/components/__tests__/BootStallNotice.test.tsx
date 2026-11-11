import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { restoreRealTimers } from "@/test/fakeTimers";
import { traceBoot } from "@/lib/bootTrace";
import BootStallNotice, { BOOT_STALL_MS } from "../BootStallNotice";

afterEach(async () => {
  await restoreRealTimers();
});

it("says nothing while starting is quick", async () => {
  vi.useFakeTimers();
  traceBoot("App code started");
  render(<BootStallNotice />);
  await act(async () => {
    vi.advanceTimersByTime(BOOT_STALL_MS - 1);
  });
  expect(screen.queryByText("Tropos is taking a while to start")).toBeNull();
});

it("shows the steps so far once starting has taken too long, and the ones after", async () => {
  vi.useFakeTimers();
  traceBoot("App code started");
  traceBoot("Waiting for sign-in to answer");
  render(<BootStallNotice />);
  await act(async () => {
    vi.advanceTimersByTime(BOOT_STALL_MS);
  });
  expect(
    screen.getByText("Tropos is taking a while to start")
  ).toBeInTheDocument();
  const list = screen.getByRole("list", {
    name: "What Tropos has done so far",
  });
  expect(list.textContent).toContain("App code started");
  expect(list.textContent).toContain("Waiting for sign-in to answer");
  await act(async () => {
    traceBoot("Unhandled: Error: auth/network-request-failed");
  });
  expect(list.textContent).toContain("auth/network-request-failed");
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});
