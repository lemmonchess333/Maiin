import { describe, expect, it } from "vitest";
import { recoveryFoodPath, recoverySportOf } from "../recoveryFood";

/* The finish screens' link and the Food page that reads it agree on the
   address, for both sports (App1 Q30), and Food reads nothing else as a
   finish. */
describe("recoveryFood", () => {
  it.each(["lift", "run"] as const)(
    "Food reads a %s finish's link back as that sport",
    (sport) => {
      const url = new URL(recoveryFoodPath(sport), "https://tropos.test");
      expect(url.pathname).toBe("/food");
      expect(recoverySportOf(url.searchParams.get("context"))).toBe(sport);
    }
  );

  it("reads no finish without one", () => {
    expect(recoverySportOf(null)).toBeNull();
    expect(recoverySportOf("")).toBeNull();
    expect(recoverySportOf("post-swim")).toBeNull();
  });
});
