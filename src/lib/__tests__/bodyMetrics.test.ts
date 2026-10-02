import { describe, it, expect } from "vitest";
import { formatHeight } from "../bodyMetrics";

describe("formatHeight", () => {
  it("keeps centimetres for a cm user", () => {
    expect(formatHeight(175, "cm")).toBe("175 cm");
    expect(formatHeight(172.72, "cm")).toBe("172.7 cm");
  });

  it("gives feet and inches to a feet user, not centimetres", () => {
    // 175 cm is 68.9 in: 5 ft 9 in.
    expect(formatHeight(175, "ft")).toBe("5 ft 9 in");
    // A whole number of feet says only the feet.
    expect(formatHeight(182.88, "ft")).toBe("6 ft");
  });
});
