/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

describe("FoodComposerCard — scan icon in the input row (wave2 A)", () => {
  it("renders the scan affordance as a single icon button in the input row, not a full-width CTA", () => {
    renderComposer();
    const scans = screen.getAllByRole("button", { name: "Scan your meal" });
    expect(scans).toHaveLength(1);
    // Icon-only: no visible label text inside the control.
    expect(scans[0].textContent).toBe("");
    // The old full-width button carried its label as text — assert the
    // string only exists as an aria-label now.
    expect(screen.queryByText("Scan your meal")).toBeNull();
  });

  it("active scan icon fires the overrides onClick (open scanner)", () => {
    const onClick = vi.fn();
    renderComposer({ scanOverrides: { onClick, locked: false } });
    fireEvent.click(screen.getByRole("button", { name: "Scan your meal" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("locked scan icon is labelled for upgrade and fires the overrides onClick (paywall)", () => {
    const onClick = vi.fn();
    renderComposer({ scanOverrides: { onClick, locked: true } });
    expect(screen.queryByRole("button", { name: "Scan your meal" })).toBeNull();
    const lockedBtn = screen.getByRole("button", {
      name: "Unlock unlimited scans",
    });
    fireEvent.click(lockedBtn);
    expect(onClick).toHaveBeenCalledTimes(1);
    // No full-width locked CTA text either — icon-only.
    expect(screen.queryByText("Unlock unlimited scans")).toBeNull();
  });

  it("send button appears alongside the scan icon when there is input text", () => {
    renderComposer({ nlInput: "2 eggs" });
    expect(screen.getByRole("button", { name: "Log meal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scan your meal" })).toBeTruthy();
  });

  it("cancel-target button appears alongside the scan icon when a target meal is set and input is empty", () => {
    renderComposer({ targetMeal: "dinner" });
    expect(
      screen.getByRole("button", { name: /cancel adding to dinner/i })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scan your meal" })).toBeTruthy();
  });
});
