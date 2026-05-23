/**
 * Tests for the base64 string helpers.
 */
import { describe, it, expect } from "vitest";
import { stripDataUrlPrefix } from "../base64Helpers";

describe("stripDataUrlPrefix", () => {
  it("strips the data:image/jpeg;base64, prefix", () => {
    expect(stripDataUrlPrefix("data:image/jpeg;base64,AAAA")).toBe("AAAA");
  });

  it("strips the data:image/png;base64, prefix", () => {
    expect(stripDataUrlPrefix("data:image/png;base64,BBBB")).toBe("BBBB");
  });

  it("strips arbitrary mime types", () => {
    /* The regex matches any mime — supports future formats
       (image/webp, image/heic via canvas, etc) without changes. */
    expect(stripDataUrlPrefix("data:image/webp;base64,CCCC")).toBe("CCCC");
    expect(stripDataUrlPrefix("data:application/pdf;base64,DDDD")).toBe(
      "DDDD",
    );
  });

  it("returns the input unchanged when no prefix is present", () => {
    /* Already-stripped payloads pass through. */
    expect(stripDataUrlPrefix("AAAABBBBCCCC")).toBe("AAAABBBBCCCC");
  });

  it("returns empty string unchanged", () => {
    expect(stripDataUrlPrefix("")).toBe("");
  });

  it("preserves the payload's characters verbatim (no trim or re-encode)", () => {
    /* base64 contains +, /, = padding — none should be mangled. */
    const payload = "abc+/123==";
    expect(stripDataUrlPrefix(`data:image/jpeg;base64,${payload}`)).toBe(
      payload,
    );
  });

  it("does NOT strip a data: URL without a base64 component", () => {
    /* "data:text/plain,Hello" is a valid data URL but not base64 —
       the regex requires `;base64,` so it should pass through. */
    expect(stripDataUrlPrefix("data:text/plain,Hello")).toBe(
      "data:text/plain,Hello",
    );
  });

  it("handles a malformed 'data:' prefix gracefully", () => {
    /* Missing the `;base64,` — the regex doesn't match, so the
       input passes through unchanged (no exception). */
    expect(stripDataUrlPrefix("data:malformed")).toBe("data:malformed");
  });
});
