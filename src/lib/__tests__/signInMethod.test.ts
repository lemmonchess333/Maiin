// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { isAppleRelayEmail } from "../appleRelay";
import {
  readLastSignInMethod,
  rememberSignInMethod,
  signInMethodLabel,
  signInMethodOf,
} from "../signInMethod";

beforeEach(() => localStorage.clear());

describe("the sign-in method", () => {
  it("reads the three ways in from Firebase's provider ids", () => {
    expect(signInMethodOf("password")).toBe("password");
    expect(signInMethodOf("google.com")).toBe("google");
    expect(signInMethodOf("apple.com")).toBe("apple");
    expect(signInMethodOf("custom")).toBeNull();
    expect(signInMethodOf(undefined)).toBeNull();
  });

  it("names them as a sentence does", () => {
    expect(signInMethodLabel("password")).toBe("email");
    expect(signInMethodLabel("google")).toBe("Google");
    expect(signInMethodLabel("apple")).toBe("Apple");
  });

  it("remembers the last one on this phone, and ignores anything else stored", () => {
    expect(readLastSignInMethod()).toBeNull();
    rememberSignInMethod("apple");
    expect(readLastSignInMethod()).toBe("apple");
    rememberSignInMethod(null);
    expect(readLastSignInMethod()).toBe("apple");
    localStorage.setItem("tropos.last_sign_in_method", "facebook");
    expect(readLastSignInMethod()).toBeNull();
  });
});

describe("Hide My Email", () => {
  it("knows both relay domains, in any case", () => {
    expect(isAppleRelayEmail("k7x9qzp2m@privaterelay.appleid.com")).toBe(true);
    expect(isAppleRelayEmail("K7X9@Private.iCloud.com")).toBe(true);
    expect(isAppleRelayEmail("sam@icloud.com")).toBe(false);
    expect(isAppleRelayEmail(null)).toBe(false);
  });
});
