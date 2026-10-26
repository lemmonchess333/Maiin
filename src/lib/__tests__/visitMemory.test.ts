// @vitest-environment jsdom — reads and writes session storage and history.
/**
 * What a screen holds for the rest of a visit (`sessionStore`), Train's
 * tab (`trainTab`), and where Back goes (`backNavigation`). Storage must
 * fail soft where it refuses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readSessionJson,
  readSessionString,
  removeSessionKey,
  writeSessionString,
} from "../sessionStore";
import { rememberTrainTab, rememberedTrainTab, trainTabFor } from "../trainTab";
import { cameFromInApp, goBackOr } from "../backNavigation";

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "");
});

describe("sessionStore", () => {
  it("round-trips, and answers null for what is not there or not JSON", () => {
    expect(writeSessionString("k", "v")).toBe(true);
    expect(readSessionString("k")).toBe("v");
    expect(readSessionJson("k")).toBeNull();
    removeSessionKey("k");
    expect(readSessionString("k")).toBeNull();
  });

  it("never throws where storage refuses every call", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(readSessionString("k")).toBeNull();
    expect(writeSessionString("k", "v")).toBe(false);
    expect(rememberedTrainTab("user-A")).toBeNull();
  });
});

describe("Train's tab", () => {
  it("opens on the address's tab, else the visit's last choice, else by the plan", () => {
    expect(
      trainTabFor({ urlTab: "run", remembered: "lift", liftDays: 3 })
    ).toBe("run");
    expect(trainTabFor({ urlTab: null, remembered: "run", liftDays: 3 })).toBe(
      "run"
    );
    // A runner's plan has no lifting days: Train opens on Run.
    expect(trainTabFor({ urlTab: null, remembered: null, liftDays: 0 })).toBe(
      "run"
    );
    expect(trainTabFor({ urlTab: null, remembered: null, liftDays: 3 })).toBe(
      "lift"
    );
    expect(
      trainTabFor({ urlTab: null, remembered: null, liftDays: null })
    ).toBe("lift");
  });

  it("remembers the choice per account", () => {
    rememberTrainTab("user-A", "run");
    expect(rememberedTrainTab("user-A")).toBe("run");
    expect(rememberedTrainTab("user-B")).toBeNull();
    rememberTrainTab(null, "run");
    expect(rememberedTrainTab(null)).toBeNull();
  });
});

describe("Back", () => {
  it("goes back to the screen this one was opened from", () => {
    window.history.replaceState({ idx: 2 }, "");
    const navigate = vi.fn();
    expect(cameFromInApp()).toBe(true);
    goBackOr(navigate, "/program?tab=run");
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it("opened directly, goes to the fallback in this screen's place", () => {
    window.history.replaceState({ idx: 0 }, "");
    const navigate = vi.fn();
    expect(cameFromInApp()).toBe(false);
    goBackOr(navigate, "/program?tab=run");
    expect(navigate).toHaveBeenCalledWith("/program?tab=run", {
      replace: true,
    });
  });
});
