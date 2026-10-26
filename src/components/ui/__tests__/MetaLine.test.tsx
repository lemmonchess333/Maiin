import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import MetaLine from "../MetaLine";

/**
 * A fact line never leaves its separator at a line's end or start
 * ("3 exercises ·" alone on a 375px phone). jsdom draws nothing, so these
 * pin the structure the browser relies on: each dot is held to the fact
 * after it, the only break is the space before a dot, and the line sits
 * 0.6em to the left inside a clipped box, so a dot that opens a line is cut
 * away. The text itself still reads with its separators.
 */
describe("MetaLine", () => {
  const renderLine = (items: string[]) =>
    render(<MetaLine items={items} />).container.querySelector("p")!;

  it("reads as the facts with their separators", () => {
    const line = renderLine(["3 exercises", "about 30 min", "Chest"]);
    expect(line.textContent).toBe("3 exercises · about 30 min · Chest");
  });

  it("holds each separator to the fact after it", () => {
    const line = renderLine(["3 exercises", "about 30 min"]);
    const groups = line.querySelectorAll(":scope > span > .whitespace-nowrap");
    expect(groups).toHaveLength(2);
    expect(groups[1].textContent).toBe("· about 30 min");
    const dot = groups[1].querySelector("[data-meta-separator]")!;
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("inline-block", "w-[0.6em]");
  });

  it("opens every line with a box the clip cuts away", () => {
    const line = renderLine(["3 exercises", "about 30 min"]);
    expect(line).toHaveClass("overflow-hidden");
    expect(line.firstElementChild).toHaveClass("-ml-[0.6em]", "block");
    const first = line.querySelector(".whitespace-nowrap")!;
    const spacer = first.querySelector("[data-meta-separator]")!;
    expect(spacer).toHaveClass("w-[0.6em]");
    expect(spacer.textContent).toBe("");
  });

  it("sets numerals in the numeral font, words in the text font", () => {
    const line = renderLine(["about 30 min"]);
    const numeral = Array.from(line.querySelectorAll("span")).find(
      (el) => el.textContent === "30"
    );
    expect(numeral).toHaveClass("font-mono", "tabular-nums");
  });
});
