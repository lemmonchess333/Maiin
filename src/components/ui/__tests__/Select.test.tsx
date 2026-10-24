import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Select } from "../Select";

/**
 * The Select primitive: a native <select> (so the platform picker opens)
 * on the `.ds-input` field, with the layout on its box and the
 * pointer-focus class that keeps a tapped select free of the keyboard
 * outline.
 */

function Radius(props: Partial<Parameters<typeof Select>[0]>) {
  return (
    <Select aria-label="Radius" defaultValue="200" {...props}>
      <option value="200">200 m</option>
      <option value="500">500 m</option>
    </Select>
  );
}

describe("Select", () => {
  it("is a native combobox on the field, named and with its options", () => {
    render(<Radius />);
    const field = screen.getByRole("combobox", { name: "Radius" });
    expect(field.tagName).toBe("SELECT");
    expect(field).toHaveClass("ds-input", "appearance-none");
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("puts layout on the box and type on the field", () => {
    render(<Radius className="ml-auto w-auto" fieldClassName="text-lg" />);
    const field = screen.getByRole("combobox", { name: "Radius" });
    expect(field.parentElement).toHaveClass("ml-auto", "w-auto");
    expect(field.parentElement).not.toHaveClass("w-full");
    expect(field).toHaveClass("text-lg");
    expect(field).not.toHaveClass("text-sm");
  });

  it("marks a focus that starts with a pointer, until blur", () => {
    const onPointerDown = vi.fn();
    const onBlur = vi.fn();
    render(<Radius onPointerDown={onPointerDown} onBlur={onBlur} />);
    const field = screen.getByRole("combobox", { name: "Radius" });
    expect(field.className).not.toContain("ds-input-pointer-focus");
    fireEvent.pointerDown(field);
    expect(field.className).toContain("ds-input-pointer-focus");
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    fireEvent.blur(field);
    expect(field.className).not.toContain("ds-input-pointer-focus");
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("leaves a keyboard focus its outline", () => {
    render(<Radius />);
    const field = screen.getByRole("combobox", { name: "Radius" });
    fireEvent.focus(field);
    expect(field.className).not.toContain("ds-input-pointer-focus");
  });

  it("reports a change and honours disabled", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Radius onChange={onChange} />);
    const field = screen.getByRole("combobox", { name: "Radius" });
    fireEvent.change(field, { target: { value: "500" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender(<Radius onChange={onChange} disabled />);
    expect(screen.getByRole("combobox", { name: "Radius" })).toBeDisabled();
  });

  it("draws the icon inside the field, clear of the value, and hides it from assistive tech", () => {
    render(<Radius icon={<svg data-testid="glyph" />} />);
    const field = screen.getByRole("combobox", { name: "Radius" });
    expect(field).toHaveClass("pl-10");
    expect(
      screen.getByTestId("glyph").closest('[aria-hidden="true"]')
    ).toBeTruthy();
  });
});
