import { describe, expect, it } from "vitest";
import { chosenDraftName, startingDisplayName } from "../onboardingName";

/* The public name is shown on the profile and found by search, so setup
   starts only from a name the person gave. */
describe("the name setup starts from", () => {
  it("is never made from the email address", () => {
    expect(
      startingDisplayName(undefined, {
        displayName: null,
        email: "jane.smith1990@gmail.com",
      })
    ).toBe("");
    expect(
      startingDisplayName(undefined, {
        displayName: null,
        email: "k7x9qzp2m@privaterelay.appleid.com",
      })
    ).toBe("");
    expect(startingDisplayName(undefined, null)).toBe("");
  });

  it("is the account's own name, from Google or the one Apple shares", () => {
    expect(
      startingDisplayName(undefined, {
        displayName: "  Sam Jones ",
        email: "k7x9qzp2m@privaterelay.appleid.com",
      })
    ).toBe("Sam Jones");
  });

  it("is the name typed before, over the account's", () => {
    expect(
      startingDisplayName("Sammy", {
        displayName: "Sam Jones",
        email: "sam@example.com",
      })
    ).toBe("Sammy");
  });

  it("is not a draft's old default: the address's local part, or Athlete", () => {
    const user = { displayName: null, email: "jane.smith1990@gmail.com" };
    expect(startingDisplayName("jane.smith1990", user)).toBe("");
    expect(startingDisplayName("Athlete", user)).toBe("");
    expect(startingDisplayName("   ", user)).toBe("");
    expect(
      startingDisplayName("jane.smith1990", {
        displayName: "Jane Smith",
        email: "jane.smith1990@gmail.com",
      })
    ).toBe("Jane Smith");
  });
});

describe("a draft's name, as chosen", () => {
  it("is kept when typed, and dropped when it was a default", () => {
    expect(chosenDraftName("Jane", "jane.smith1990@gmail.com")).toBe("Jane");
    expect(chosenDraftName("jane.smith1990", "jane.smith1990@gmail.com")).toBe(
      undefined
    );
    expect(chosenDraftName("Athlete", null)).toBe(undefined);
    expect(chosenDraftName("", "a@b.com")).toBe(undefined);
    expect(chosenDraftName(undefined, "a@b.com")).toBe(undefined);
  });
});
