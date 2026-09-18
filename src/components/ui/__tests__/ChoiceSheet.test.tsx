/**
 * ChoiceSheet draws ONE drag handle, whichever header mode it is in.
 *
 * With a title the sheet's own header already carries the handle; the
 * body used to add a second pill under the description on the session
 * chooser and the goal-reached ask, which read as a sheet nested in a
 * sheet. With `hideHeader` the body's pill is the only one.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ChoiceSheet } from "../ChoiceSheet";
import { buttonClasses } from "../buttonClasses";

afterEach(cleanup);

function handles(): number {
  return document.querySelectorAll(".h-1.rounded-full.bg-border").length;
}

const choices = [
  {
    id: "a",
    label: "Do it",
    variant: "primary" as const,
    onSelect: async () => {},
  },
];

describe("ChoiceSheet — one drag handle", () => {
  it("with a visible header, the body adds no second pill", () => {
    render(
      <ChoiceSheet
        open
        onClose={() => {}}
        title="How do you want to train today?"
        description="Pick one."
        choices={choices}
      />
    );
    expect(
      screen.getByText("How do you want to train today?")
    ).toBeInTheDocument();
    expect(handles()).toBe(1);
  });

  it("with the header hidden, the body's pill is the only one", () => {
    render(
      <ChoiceSheet
        open
        onClose={() => {}}
        title="Welcome back"
        hideHeader
        choices={choices}
      >
        <p>Welcome back</p>
      </ChoiceSheet>
    );
    expect(handles()).toBe(1);
  });
});

/**
 * The row borrows the `md` size's height; it must borrow its padding too.
 *
 * `ChoiceSheet` sizes its own rows rather than calling `buttonClasses`
 * (the sheet's rows are not `Button`s), and it took `min-h-[44px]` from
 * the `md` size while dropping that size's `px-4`. So the label and the
 * optional sublabel began at the button's edge — and the sublabel is a
 * `block`, so the long ones wrapped flush against both rounded corners.
 * "Recommended — hard run yesterday, and this session loads the same
 * legs" is the worst of them, and it is the one the session chooser shows
 * most often.
 *
 * The expectation is DERIVED from `buttonClasses`, not restated. A pin
 * that hardcodes `px-4` passes when the design system's own padding
 * changes and the sheet's does not, which is the drift this is for.
 */
describe("ChoiceSheet — rows are inset like the size they borrow", () => {
  function rowClasses(): string {
    render(
      <ChoiceSheet
        open
        onClose={() => {}}
        title="How do you want to train today?"
        choices={[
          {
            id: "easier",
            label: "Easier today · one set less per lift",
            sublabel:
              "Recommended — hard run yesterday, and this session loads the same legs",
            variant: "secondary" as const,
            onSelect: async () => {},
          },
        ]}
      />
    );
    return screen.getByRole("button", { name: /Easier today/ }).className ?? "";
  }

  it("carries the md size's horizontal padding", () => {
    const md = buttonClasses({ size: "md", variant: "secondary" });
    const mdPx = md.match(/\bpx-\d+\b/)?.[0];
    expect(mdPx, "buttonClasses md no longer sets px-*").toBeTruthy();
    expect(rowClasses()).toContain(mdPx!);
  });

  it("renders the long sublabel rather than dropping it", () => {
    // Anchors the test above: a padding assertion on a row that never
    // rendered would pass for the wrong reason.
    rowClasses();
    expect(
      screen.getByText(/hard run yesterday, and this session loads/)
    ).toBeInTheDocument();
  });
});
