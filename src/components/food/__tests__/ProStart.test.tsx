/**
 * ProStart — what greets a new subscriber on Food, and the one ask.
 *
 * The reminder ask exists to make the day-5 notification possible, so
 * the pins are about WHEN it appears: permission undecided and never
 * asked before → shown; granted or denied → nothing, done at once;
 * asked before → nothing, done at once. Answering either way records
 * the ask so it never repeats for this account.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";

vi.mock("@/lib/notifications");

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ProStartChip, TrialReminderAsk } from "../ProStart";
import { trialReminderAskKey } from "@/lib/proStart";
import { notificationsFake } from "@/test/notificationsFake";
import {
  resetNotifications,
  setNotificationPermission,
} from "@/test/notificationsHarness";

// The mock module routes requests to the fake singleton at call time, so
// a spy on the instance sees exactly what the component asked for.
let requestSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetNotifications();
  localStorage.clear();
  requestSpy = vi.spyOn(notificationsFake, "requestPermission");
});
afterEach(() => {
  cleanup();
  requestSpy.mockRestore();
});

describe("ProStartChip", () => {
  it("says Pro is on and points at the camera", () => {
    render(<ProStartChip />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Pro is on. Point the camera at your next meal."
    );
  });
});

describe("TrialReminderAsk", () => {
  it("asks once when permission is undecided, and turning it on requests the permission", async () => {
    setNotificationPermission("default");
    const onDone = vi.fn();
    render(<TrialReminderAsk uid="u1" onDone={onDone} />);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Want a reminder before your trial ends?");
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(trialReminderAskKey("u1"))).not.toBeNull();
  });

  it("Not now records the ask without requesting anything", async () => {
    setNotificationPermission("default");
    const onDone = vi.fn();
    render(<TrialReminderAsk uid="u1" onDone={onDone} />);
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(requestSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem(trialReminderAskKey("u1"))).not.toBeNull();
  });

  it("asks nothing when permission is already granted, or denied", async () => {
    for (const state of ["granted", "denied"] as const) {
      setNotificationPermission(state);
      const onDone = vi.fn();
      render(<TrialReminderAsk uid={`u-${state}`} onDone={onDone} />);
      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      cleanup();
    }
  });

  it("asks nothing the second time, whatever was answered the first", async () => {
    setNotificationPermission("default");
    localStorage.setItem(trialReminderAskKey("u1"), "2026-09-13T00:00:00.000Z");
    const onDone = vi.fn();
    render(<TrialReminderAsk uid="u1" onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("Food wires the landing", () => {
  it("renders the chip under the pro-start context and the ask only with the trial flag", () => {
    const food = readFileSync(
      resolve(__dirname, "../../../pages/Food.tsx"),
      "utf8"
    );
    const start = food.indexOf(
      'searchParams.get("context") === PRO_START_CONTEXT'
    );
    expect(start).toBeGreaterThan(0);
    const block = food.slice(start, food.indexOf("FOOD-02", start));
    expect(block).toContain("<ProStartChip />");
    expect(block).toMatch(
      /searchParams\.get\("trial"\) === "1" && \(\s*<TrialReminderAsk/
    );
  });
});
