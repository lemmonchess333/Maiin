/**
 * useOnScreenKeyboard: the tab bar rode on the iPhone keyboard over the
 * field being typed in (owner's recording, 23 November 2026). Layout hides
 * the bar while a field that brings the keyboard has focus, on the iPhone
 * app and on a touch screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const P = vi.hoisted(() => ({ native: true }));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => P.native }));

import { bringsKeyboard, useOnScreenKeyboard } from "../useOnScreenKeyboard";

function field(html: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  return wrap.firstElementChild as HTMLElement;
}

function coarsePointer(coarse: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: coarse,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  P.native = true;
  coarsePointer(false);
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("bringsKeyboard", () => {
  it("is true for a text field, a number field and a text area", () => {
    expect(bringsKeyboard(field('<input type="text" />'))).toBe(true);
    expect(bringsKeyboard(field("<input />"))).toBe(true);
    expect(
      bringsKeyboard(field('<input type="text" inputmode="numeric" />'))
    ).toBe(true);
    expect(bringsKeyboard(field('<input type="number" />'))).toBe(true);
    expect(bringsKeyboard(field("<textarea></textarea>"))).toBe(true);
  });

  it("is false for what the phone answers without a keyboard", () => {
    expect(bringsKeyboard(field('<input type="checkbox" />'))).toBe(false);
    expect(bringsKeyboard(field('<input type="date" />'))).toBe(false);
    expect(bringsKeyboard(field("<button>Save</button>"))).toBe(false);
    expect(bringsKeyboard(field("<select><option>a</option></select>"))).toBe(
      false
    );
    expect(bringsKeyboard(field('<input type="text" readonly />'))).toBe(false);
    expect(
      bringsKeyboard(field('<input type="text" inputmode="none" />'))
    ).toBe(false);
    expect(bringsKeyboard(null)).toBe(false);
  });
});

describe("useOnScreenKeyboard", () => {
  it("is up while a field has focus in the iPhone app, and down after", () => {
    const input = field(
      '<input id="max-hr" type="text" />'
    ) as HTMLInputElement;
    const { result } = renderHook(() => useOnScreenKeyboard());
    expect(result.current).toBe(false);
    act(() => input.focus());
    expect(result.current).toBe(true);
    act(() => input.blur());
    expect(result.current).toBe(false);
  });

  it("stays up moving from one field to the next", () => {
    const a = field('<input type="text" />') as HTMLInputElement;
    const b = field('<input type="text" />') as HTMLInputElement;
    const { result } = renderHook(() => useOnScreenKeyboard());
    act(() => a.focus());
    act(() => b.focus());
    expect(result.current).toBe(true);
  });

  it("goes down when focus moves to a button", () => {
    const a = field('<input type="text" />') as HTMLInputElement;
    const button = field("<button>Save</button>") as HTMLButtonElement;
    const { result } = renderHook(() => useOnScreenKeyboard());
    act(() => a.focus());
    act(() => button.focus());
    expect(result.current).toBe(false);
  });

  it("is up on a touch screen's browser", () => {
    P.native = false;
    coarsePointer(true);
    const input = field('<input type="text" />') as HTMLInputElement;
    const { result } = renderHook(() => useOnScreenKeyboard());
    act(() => input.focus());
    expect(result.current).toBe(true);
  });

  it("never on a computer's browser, which keeps its tab bar", () => {
    P.native = false;
    coarsePointer(false);
    const input = field('<input type="text" />') as HTMLInputElement;
    const { result } = renderHook(() => useOnScreenKeyboard());
    act(() => input.focus());
    expect(result.current).toBe(false);
  });
});
