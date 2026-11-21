// @vitest-environment jsdom
/**
 * Settings → Social & privacy → Share usage analytics (Priv1 call 2): the
 * simple, free way to object to Google Analytics. On unless turned off.
 * Off stops this device at once and is kept on the account, so it follows
 * the person to their other devices; a save that fails puts the device
 * back as the account still has it. The switch sends no analytics event of
 * its own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { UpdateProfileResult, UserProfile } from "@/lib/auth";

const setUsageAnalytics = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analyticsProvider", () => ({ setUsageAnalytics }));
const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/settingsAnalytics", () => ({ track }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import UsageAnalyticsGroup from "../UsageAnalyticsGroup";
import { USAGE_ANALYTICS_DESCRIPTION } from "@/lib/usageAnalytics";

let saves: Partial<UserProfile>[] = [];

/** The group wired as SettingsPrivacy wires it: the profile's answer in, a
 *  save that changes it once it has gone through (as updateProfile does). */
function Harness({
  initial,
  result = { ok: true },
}: {
  initial?: boolean;
  result?: UpdateProfileResult;
}) {
  const [usageAnalytics, setAnswer] = useState<boolean | undefined>(initial);
  return (
    <UsageAnalyticsGroup
      profile={{ usageAnalytics }}
      updateProfile={async (data) => {
        saves.push(data);
        if (result.ok) setAnswer(data.usageAnalytics);
        return result;
      }}
    />
  );
}

function toggle() {
  return screen.getByRole("switch", { name: "Share usage analytics" });
}

beforeEach(() => {
  saves = [];
  setUsageAnalytics.mockReset();
  track.mockReset();
});
afterEach(cleanup);

describe("Share usage analytics", () => {
  it("is on for an account that never turned it off, and says what it sends", () => {
    render(<Harness />);
    expect(screen.getByText("Share usage analytics")).toBeTruthy();
    expect(screen.getByText(USAGE_ANALYTICS_DESCRIPTION)).toBeTruthy();
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it("says what is sent in the words the owner approved", () => {
    // Events carry counts of what is logged and setup's choices (goal,
    // days a week), never what was logged, so the line says so.
    render(<Harness />);
    expect(
      screen.getByText(
        "Sends how you use the app and your plan choices to Google " +
          "Analytics, tied to this device, not your account. No names, " +
          "and not what you log, only how often."
      )
    ).toBeTruthy();
  });

  it("shows off for an account that turned it off", () => {
    render(<Harness initial={false} />);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("off stops this device at once and keeps false on the account", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.click(toggle());
    });
    expect(setUsageAnalytics.mock.calls).toEqual([[false]]);
    expect(saves).toEqual([{ usageAnalytics: false }]);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("on again starts this device and keeps true on the account", async () => {
    render(<Harness initial={false} />);
    await act(async () => {
      fireEvent.click(toggle());
    });
    expect(setUsageAnalytics.mock.calls).toEqual([[true]]);
    expect(saves).toEqual([{ usageAnalytics: true }]);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it("a save that fails puts this device back as the account has it", async () => {
    render(<Harness result={{ ok: false, error: new Error("denied") }} />);
    await act(async () => {
      fireEvent.click(toggle());
    });
    expect(saves).toEqual([{ usageAnalytics: false }]);
    expect(setUsageAnalytics.mock.calls).toEqual([[false], [true]]);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it("sends no analytics event of its own", async () => {
    render(<Harness />);
    await act(async () => {
      fireEvent.click(toggle());
    });
    expect(saves).toHaveLength(1);
    expect(track).not.toHaveBeenCalled();
  });
});
