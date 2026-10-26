// @vitest-environment jsdom
/**
 * The address an email change is going to, kept so Login can explain the
 * sign-out that confirming it causes. (jsdom: the note is in localStorage.)
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearEmailChange,
  noteEmailChange,
  pendingEmailChange,
} from "../emailChangeNote";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => localStorage.clear());

describe("emailChangeNote", () => {
  it("keeps the new address for a week, then forgets it", () => {
    noteEmailChange("new@example.com", 1_000);
    expect(pendingEmailChange(1_000 + 6 * DAY)).toBe("new@example.com");
    expect(pendingEmailChange(1_000 + 8 * DAY)).toBeNull();
  });

  it("is cleared by a sign-in, and reads nothing it did not write", () => {
    noteEmailChange("new@example.com");
    clearEmailChange();
    expect(pendingEmailChange()).toBeNull();
    localStorage.setItem("tropos-email-change-pending", '{"email":7}');
    expect(pendingEmailChange()).toBeNull();
  });
});
