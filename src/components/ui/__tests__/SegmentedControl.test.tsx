/**
 * SegmentedControl primitive tests.
 *
 * Pins the WAI-ARIA radiogroup contract the hand-rolled pill rows
 * never had: radiogroup/radio roles + aria-checked, roving tabindex,
 * and Arrow/Home/End selection that skips disabled options and wraps.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SegmentedControl } from "../SegmentedControl";

afterEach(() => cleanup());

const DAYS = [
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
];

describe("SegmentedControl", () => {
  it("renders a labelled radiogroup with one radio per option", () => {
    render(
      <SegmentedControl
        options={DAYS}
        value={4}
        onChange={() => {}}
        ariaLabel="Lift days"
      />
    );
    expect(screen.getByRole("radiogroup", { name: "Lift days" })).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("commits the clicked option", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={DAYS}
        value={4}
        onChange={onChange}
        ariaLabel="Lift days"
      />
    );
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("uses roving tabindex — only the selected radio is tabbable", () => {
    render(
      <SegmentedControl
        options={DAYS}
        value={4}
        onChange={() => {}}
        ariaLabel="Lift days"
      />
    );
    const [a, b, c] = screen.getAllByRole("radio");
    expect(a.tabIndex).toBe(-1);
    expect(b.tabIndex).toBe(0);
    expect(c.tabIndex).toBe(-1);
  });

  it("ArrowRight moves selection forward and wraps at the end", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={DAYS}
        value={4}
        onChange={onChange}
        ariaLabel="Lift days"
      />
    );
    const radios = screen.getAllByRole("radio");
    fireEvent.keyDown(radios[1], { key: "ArrowRight" }); // 4 → 5
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.keyDown(radios[2], { key: "ArrowRight" }); // 5 → wrap → 3
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it("ArrowLeft moves backward and wraps to the end", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={DAYS}
        value={3}
        onChange={onChange}
        ariaLabel="Lift days"
      />
    );
    const radios = screen.getAllByRole("radio");
    fireEvent.keyDown(radios[0], { key: "ArrowLeft" }); // 3 → wrap → 5
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it("Home/End jump to the first/last enabled option", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={DAYS}
        value={4}
        onChange={onChange}
        ariaLabel="Lift days"
      />
    );
    const radios = screen.getAllByRole("radio");
    fireEvent.keyDown(radios[1], { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.keyDown(radios[1], { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it("skips a disabled option during arrow nav and never selects it", () => {
    const onChange = vi.fn();
    const opts = [
      { value: "a", label: "A" },
      { value: "b", label: "B", disabled: true },
      { value: "c", label: "C" },
    ];
    render(
      <SegmentedControl
        options={opts}
        value="a"
        onChange={onChange}
        ariaLabel="Letters"
      />
    );
    const radios = screen.getAllByRole("radio");
    expect((radios[1] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(radios[0], { key: "ArrowRight" }); // a → skip b → c
    expect(onChange).toHaveBeenCalledWith("c");
    expect(onChange).not.toHaveBeenCalledWith("b");
  });

  it("a whole-group disable blocks selection", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={DAYS}
        value={4}
        onChange={onChange}
        ariaLabel="Lift days"
        disabled
      />
    );
    const radios = screen.getAllByRole("radio");
    expect(radios.every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(radios[2]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Space/Enter commit the focused option", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={DAYS}
        value={4}
        onChange={onChange}
        ariaLabel="Lift days"
      />
    );
    const radios = screen.getAllByRole("radio");
    fireEvent.keyDown(radios[2], { key: " " });
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("running tone applies the coral fill to the selected option", () => {
    render(
      <SegmentedControl
        options={[
          { value: "5k", label: "5K" },
          { value: "10k", label: "10K" },
        ]}
        value="10k"
        onChange={() => {}}
        ariaLabel="Race distance"
        tone="running"
      />
    );
    const selected = screen.getByRole("radio", { name: "10K" });
    // DS1b: running tone resolves via the --running token class.
    expect(selected.className).toContain("bg-running");
  });
});
