import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SupersetBlock from "../SupersetBlock";

describe("SupersetBlock (Lift22, owner's B)", () => {
  it("holds the pair's two rows under one line saying what a superset is", () => {
    render(
      <SupersetBlock>
        <p>Hack Squat</p>
        <p>Standing Calf Raise</p>
      </SupersetBlock>
    );
    const block = screen.getByRole("group", { name: "Superset" });
    expect(within(block).getByText("One set of each, then rest")).toBeTruthy();
    expect(within(block).getByText("Hack Squat")).toBeTruthy();
    expect(within(block).getByText("Standing Calf Raise")).toBeTruthy();
  });
});
