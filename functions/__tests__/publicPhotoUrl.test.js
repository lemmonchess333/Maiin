import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const { publicPhotoUrl } = createRequire(import.meta.url)(
  "../lib/publicPhotoUrl"
);

describe("public avatar URL boundary", () => {
  it.each([
    "https://firebasestorage.googleapis.com/v0/b/demo-tropos.appspot.com/o/a?alt=media&token=synthetic",
    "https://lh3.googleusercontent.com/a.png",
    "https://appleid.cdn-apple.com/a.png",
    `https://firebasestorage.googleapis.com/${"a".repeat(600)}`,
  ])("preserves supported URLs without truncation: %s", (value) => {
    expect(publicPhotoUrl(value)).toBe(value);
  });
  it.each([
    null,
    undefined,
    42,
    "",
    "not-a-url",
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "file:///tmp/avatar",
    "http://lh3.googleusercontent.com/a",
    "https://tracker.example.test/pixel",
    "https://lh3.googleusercontent.com.evil.test/a",
    "https://lh3.googleusercontent.com@evil.test/a",
    "https://user:pass@lh3.googleusercontent.com/a",
    "https://lh3.googleusercontent.com:444/a",
    " https://lh3.googleusercontent.com/a",
    `https://lh3.googleusercontent.com/${"a".repeat(2048)}`,
  ])("drops unsupported input: %s", (value) => {
    expect(publicPhotoUrl(value)).toBeUndefined();
  });
});
