/**
 * The set table's badges are quiet (owner, 2026-10-12): a warm-up's is
 * grey, not the amber status colour. Drop sets and sets to failure keep
 * their colours: they are rare, and chosen on purpose.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import SetTypeChip from "../SetTypeChip";

afterEach(() => cleanup());

describe("SetTypeChip", () => {
  it("draws a warm-up's badge in grey, not amber", () => {
    const { container } = render(<SetTypeChip type="warmup" label="W" />);
    const chip = container.querySelector('[data-set-type="warmup"]')!;
    expect(chip.className.split(" ")).toEqual(
      expect.arrayContaining(["bg-muted", "text-muted-foreground"])
    );
    expect(chip.className).not.toMatch(/warning/);
  });
});
