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
