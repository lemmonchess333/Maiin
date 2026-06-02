import { describe, it, expect } from "vitest";
import {
  mayTargetUser,
  DEFAULT_PUSH_CONSENT,
  type PushConsent,
} from "../pushConsent";

describe("mayTargetUser — the senders' gate (#969)", () => {
  const on: PushConsent = {
    enabled: true,
    streak: true,
    recap: true,
    badge: true,
  };

  it("blocks every type when the global switch is off", () => {
    const off: PushConsent = { ...on, enabled: false };
    expect(mayTargetUser(off, "streak")).toBe(false);
    expect(mayTargetUser(off, "recap")).toBe(false);
    expect(mayTargetUser(off, "badge")).toBe(false);
  });

  it("allows a type when global + that type are on", () => {
    expect(mayTargetUser(on, "streak")).toBe(true);
    expect(mayTargetUser(on, "badge")).toBe(true);
  });

  it("blocks only the types switched off, when global is on", () => {
    const c: PushConsent = { ...on, recap: false };
    expect(mayTargetUser(c, "recap")).toBe(false);
    expect(mayTargetUser(c, "streak")).toBe(true);
  });

  it("defaults an absent per-type flag to ON (older docs get the standard set)", () => {
    expect(mayTargetUser({ enabled: true }, "streak")).toBe(true);
    expect(mayTargetUser({ enabled: true }, "recap")).toBe(true);
  });

  it("treats null/undefined consent as no-send (default off)", () => {
    expect(mayTargetUser(null, "streak")).toBe(false);
    expect(mayTargetUser(undefined, "badge")).toBe(false);
  });

  it("default consent is opt-out by default (global off)", () => {
    expect(DEFAULT_PUSH_CONSENT.enabled).toBe(false);
    expect(mayTargetUser(DEFAULT_PUSH_CONSENT, "streak")).toBe(false);
  });
});
