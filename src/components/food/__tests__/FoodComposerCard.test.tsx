/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { createRef } from "react";

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_t: any, prop: string) => (props: any) => {
        const {
          variants: _v,
          whileTap: _wt,
          initial: _i,
          animate: _a,
          exit: _e,
          transition: _tn,
          ...rest
        } = props;
        const Tag = prop === "create" ? "div" : prop;
        return <Tag {...rest} />;
      },
    }
  ),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import FoodComposerCard from "../FoodComposerCard";

function renderComposer(over: Record<string, any> = {}) {
  const props = {
    nlInput: "",
    setNlInput: vi.fn(),
    nlParsing: false,
    inputFocused: false,
    setInputFocused: vi.fn(),
    setSuggestionsActive: vi.fn(),
    placeholderPrompt: "Search food or describe a meal",
    onParse: vi.fn(),
    inputRef: createRef<HTMLTextAreaElement>(),
    targetMeal: null,
    setTargetMeal: vi.fn(),
    onTargetMeal: vi.fn(),
    showSuggestions: false,
    suggestions: [],
    offResults: [],
    pantryResults: [],
    offEmpty: false,
    offSearchQuery: null,
    onSelectSuggestion: vi.fn(),
    onSelectOff: vi.fn(),
    onSelectPantry: vi.fn(),
    scanUsage: {
      loading: false,
      remaining: 0,
      limit: 0,
      isUnlimited: true,
      resetDate: new Date("2026-06-10T00:00:00"),
    },
    scanOverrides: { onClick: vi.fn(), locked: false },
    onUpgrade: vi.fn(),
    onManualOpen: vi.fn(),
    ...over,
  };
  return { ...render(<FoodComposerCard {...(props as any)} />), props };
}

describe("FoodComposerCard — the camera button beside the field", () => {
  it("renders one scan control: a food-orange camera square beside the field, not an icon inside it", () => {
    renderComposer();
    const scans = screen.getAllByRole("button", { name: "Scan a meal" });
    expect(scans).toHaveLength(1);
    // Camera only (owner call): no word beside the camera. The accessible
    // name still says what it does.
    expect(scans[0]).toHaveTextContent("");
    expect(scans[0].querySelector("svg")).toBeTruthy();
    // A square, the height of the field.
    expect(scans[0]).toHaveClass("size-14");
    // The food orange (the nutrition variant) — the owner call recorded
    // in CLAUDE.md's Button mapping — not the brand purple.
    expect(scans[0]).toHaveClass("bg-nutrition-fill");
    // Beside the field, not inside it, and after it in the row.
    const field = screen.getByRole("textbox", { name: "What did you eat" });
    expect(field.parentElement!.contains(scans[0])).toBe(false);
    expect(
      field.compareDocumentPosition(scans[0]) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("opens the scanner and hands over the button's box to grow the scanner from", () => {
    const onClick = vi.fn();
    renderComposer({ scanOverrides: { onClick, locked: false } });
    const button = screen.getByRole("button", { name: "Scan a meal" });
    const box = new DOMRect(280, 630, 56, 56);
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(box);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(box);
  });

  it("a locked account gets the same button, and it still opens the scanner", () => {
    /* The scanner carries the gate: it opens on Barcode, which is free,
       and holds the photo tabs behind the Pro offer. A locked button
       that went to the paywall left free accounts no way to a barcode. */
    const onClick = vi.fn();
    renderComposer({ scanOverrides: { onClick, locked: true } });
    const button = screen.getByRole("button", { name: "Scan a meal" });
    expect(button).toHaveClass("bg-nutrition-fill");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("the suggestions dropdown sits outside the field-and-button row, so it cannot stretch the button", () => {
    renderComposer({
      showSuggestions: true,
      offEmpty: true,
      offSearchQuery: "zzqxv",
    });
    const scan = screen.getByRole("button", { name: "Scan a meal" });
    const noMatches = screen.getByRole("button", {
      name: /no matches found/i,
    });
    expect(scan.parentElement!.contains(noMatches)).toBe(false);
  });

  it("send button appears in the field alongside the camera button when there is input text", () => {
    renderComposer({ nlInput: "2 eggs" });
    const send = screen.getByRole("button", { name: "Log meal" });
    const field = screen.getByRole("textbox", { name: "What did you eat" });
    expect(field.parentElement!.contains(send)).toBe(true);
    expect(screen.getByRole("button", { name: "Scan a meal" })).toBeTruthy();
  });

  it('no cancel control: the pills own the meal, and the field never says "Adding to"', () => {
    /* The field used to carry an X ("Cancel adding to Dinner") beside
       the camera whenever a meal was targeted and the input empty. An X
       in an empty field reads as "clear", and clearing nothing did
       nothing visible. Tapping the selected pill is the one way out of
       a target (the page's toggle), so the X and the "Adding to…"
       placeholder that went with it are gone: the pills say where, the
       placeholder shows what. */
    renderComposer({ targetMeal: "dinner", nlInput: "" });
    expect(screen.queryByRole("button", { name: /cancel adding/i })).toBeNull();
    const field = screen.getByRole("textbox", { name: "What did you eat" });
    expect(field).toHaveAttribute(
      "placeholder",
      "Search food or describe a meal"
    );
    expect(screen.getByRole("button", { name: "Scan a meal" })).toBeTruthy();
  });

  it("the meal pills head the field, and there is no caption above them", () => {
    /* Owner call (Food options page, 5a): pick the meal, then say
       what. The radiogroup precedes the textbox in document order, and
       the ADD TO caption that used to sit between field and pills is
       gone — four meal names above an input are self-describing. */
    renderComposer();
    const slots = screen.getByRole("radiogroup", { name: "Add to meal" });
    const field = screen.getByRole("textbox", { name: "What did you eat" });
    expect(
      slots.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
      "pills must come before the field"
    ).toBeTruthy();
    expect(screen.queryByText(/^add to$/i)).toBeNull();
  });

  it("renders the Pro hint slot directly under the field", () => {
    renderComposer({ proHint: <p data-testid="hint">hint</p> });
    const field = screen.getByRole("textbox", { name: "What did you eat" });
    const hint = screen.getByTestId("hint");
    expect(
      field.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe("FoodComposerCard — visible manual entry", () => {
  it("opens manual entry from the pencil leading the field — one 44px control, no separate button", () => {
    /* "Enter manually" was a ghost button orphaned two rows below the
       field while a decorative pencil sat in it. The pencil is the
       button now; the capture spec that clicks by name still finds it. */
    renderComposer();
    const pencil = screen.getByRole("button", { name: "Enter manually" });
    expect(pencil).toHaveClass("size-11", "absolute", "left-0");
    expect(
      screen.getAllByRole("button", { name: "Enter manually" })
    ).toHaveLength(1);
  });

  it("opens manual entry without a search or a scan", () => {
    const { props } = renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "Enter manually" }));
    expect(props.onManualOpen).toHaveBeenCalledOnce();
  });

  it("manual entry stays reachable via the dropdown's no-results row", () => {
    const onManualOpen = vi.fn();
    renderComposer({
      onManualOpen,
      showSuggestions: true,
      offEmpty: true,
      offSearchQuery: "zzqxv",
    });
    fireEvent.click(screen.getByRole("button", { name: /no matches found/i }));
    expect(onManualOpen).toHaveBeenCalledTimes(1);
  });

  it("keeps meal selection separate from scan and manual entry", () => {
    renderComposer({ targetMeal: "dinner" });
    // The meal slots are a SegmentedControl (radiogroup), not pill buttons:
    // no button carries a meal name, and the only buttons are the manual
    // entry pencil and the Scan button (the clear-target X is gone; the
    // selected pill's toggle is the way out of a target).
    expect(
      screen.queryByRole("button", {
        name: /^(Breakfast|Lunch|Snacks|Dinner)$/,
      })
    ).toBeNull();
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))
    ).toEqual(["Enter manually", "Scan a meal"]);
    const slots = screen.getByRole("radiogroup", { name: "Add to meal" });
    expect(within(slots).getAllByRole("radio")).toHaveLength(4);
    expect(
      within(slots).getByRole("radio", { name: "Dinner" })
    ).toHaveAttribute("aria-checked", "true");
  });
});

describe("FoodComposerCard — conditional quota caption (wave2 B)", () => {
  const quota = (over: Record<string, unknown> = {}) => ({
    loading: false,
    remaining: 5,
    limit: 10,
    isUnlimited: false,
    resetDate: new Date("2026-06-10T00:00:00"),
    ...over,
  });

  it("renders NO quota caption when the user has headroom (remaining > 1)", () => {
    renderComposer({ scanUsage: quota({ remaining: 5 }) });
    expect(screen.queryByText(/scan.* left/i)).toBeNull();
    expect(screen.queryByText(/out of scans/i)).toBeNull();
  });

  it("renders NO quota caption for unlimited (Pro/trial) users", () => {
    renderComposer({
      scanUsage: quota({ remaining: 0, isUnlimited: true }),
    });
    expect(screen.queryByText(/out of scans/i)).toBeNull();
  });

  it("renders NO quota caption when limit === 0 (Pro-only tier — the scanner carries the gate)", () => {
    renderComposer({
      scanUsage: quota({ remaining: 0, limit: 0 }),
      scanOverrides: { onClick: vi.fn(), locked: true },
    });
    expect(screen.queryByText(/out of scans/i)).toBeNull();
    // The way in is still there: the same Scan button.
    expect(screen.getByRole("button", { name: "Scan a meal" })).toBeTruthy();
  });

  it("renders the last-scan caption at remaining === 1", () => {
    renderComposer({ scanUsage: quota({ remaining: 1 }) });
    expect(screen.getByText(/1 free scan left · resets 10 Jun/i)).toBeTruthy();
  });

  it("renders the exhausted caption with a working upgrade action at remaining === 0 (real quota)", () => {
    const onUpgrade = vi.fn();
    renderComposer({ scanUsage: quota({ remaining: 0 }), onUpgrade });
    const cta = screen.getByRole("button", {
      name: /out of scans — upgrade for unlimited/i,
    });
    fireEvent.click(cta);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});
