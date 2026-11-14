/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
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

describe("FoodComposerCard — the camera at the end of the field", () => {
  it("renders one scan control: an orange camera icon inside the field, with no fill", () => {
    const { container } = renderComposer();
    const scans = screen.getAllByRole("button", { name: "Scan a meal" });
    expect(scans).toHaveLength(1);
    // Camera only (owner call): no word beside the camera. The accessible
    // name still says what it does.
    expect(scans[0]).toHaveTextContent("");
    // 24px, in px: a rem size filled the box at 2x text.
    expect(scans[0].querySelector("svg")).toHaveClass("size-[24px]");
    // An icon in the food orange, the theme-following step (the deeper
    // orange on the light field), and no filled square: of five text
    // fields with a scan control seen in four food apps, three held it
    // inside the field as an icon and none drew a filled button (the
    // owner, 11 Nov 2026; Food11 call 3).
    expect(scans[0]).toHaveClass(
      "text-nutrition-strong",
      "bg-transparent",
      "hover:bg-transparent"
    );
    expect(scans[0]).not.toHaveClass("bg-nutrition-fill");
    expect(scans[0]).not.toHaveClass("text-foreground");
    // A 48px tap area, the height of the field. jsdom has no layout;
    // companion-food.capture.spec.ts measures the two boxes in a browser.
    expect(scans[0]).toHaveClass("size-[48px]");
    const field = screen.getByRole("textbox", { name: "What did you eat" });
    expect(field).toHaveClass("block", "min-h-[48px]");
    // Inside the field's box, and after the text in it.
    const box = container.querySelector("[data-field-box]")!;
    expect(box.parentElement!.contains(scans[0])).toBe(true);
    expect(field.parentElement).toBe(scans[0].parentElement);
    expect(
      field.compareDocumentPosition(scans[0]) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("nothing stands beside the field: the field is the whole row", () => {
    const { container } = renderComposer();
    const row = container.querySelector('[data-guide-anchor="food-composer"]')!;
    expect(row.children).toHaveLength(1);
    expect(row.firstElementChild).toBe(
      container.querySelector("[data-field-box]")!.parentElement
    );
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
    expect(button).toHaveClass("text-nutrition-strong", "size-[48px]");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("the suggestions dropdown sits outside the field, so it cannot stretch a control in it", () => {
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

  it("send comes in before the camera when there is text, and the camera stays where it was", () => {
    /* The camera is the field's last control with or without text, so
       it never moves under a thumb: a tap meant for it cannot land on
       send and log a half-typed meal. Two food apps seen with a camera
       in the text box keep it there while the person types. */
    const { rerender, props } = renderComposer();
    const lastControl = () => {
      const all = screen.getAllByRole("button");
      return all[all.length - 1];
    };
    expect(lastControl()).toHaveAccessibleName("Scan a meal");
    rerender(<FoodComposerCard {...(props as any)} nlInput="2 eggs" />);
    const send = screen.getByRole("button", { name: "Log meal" });
    const field = screen.getByRole("textbox", { name: "What did you eat" });
    expect(field.parentElement!.contains(send)).toBe(true);
    expect(lastControl()).toHaveAccessibleName("Scan a meal");
    expect(send).toHaveClass("text-nutrition-strong");
    // Before the camera, on the one row.
    expect(send.parentElement).toHaveClass("right-[54px]");
    // In px, like the field's other controls: in rem it was 64px at
    // twice the text size.
    expect(send).toHaveClass("p-[6px]", "before:-inset-[6px]");
    expect(send.querySelector("svg")).toHaveClass("size-[20px]");
    // The text clears send only while send is there.
    expect(field).toHaveClass("pr-11");
  });

  it('no cancel control, and the field never says "Adding to"', () => {
    /* The field used to carry an X ("Cancel adding to Dinner") beside
       the camera whenever a meal was targeted and the input empty. An X
       in an empty field reads as "clear", and clearing nothing did
       nothing visible. The field names no meal now, so the X and the
       "Adding to…" placeholder that went with it are gone: the
       placeholder shows what a log can look like. */
    renderComposer({ nlInput: "" });
    expect(screen.queryByRole("button", { name: /cancel adding/i })).toBeNull();
    const field = screen.getByRole("textbox", { name: "What did you eat" });
    expect(field).toHaveAttribute(
      "placeholder",
      "Search food or describe a meal"
    );
    expect(screen.getByRole("button", { name: "Scan a meal" })).toBeTruthy();
  });

  it("asks for no meal: no chip, no menu and no row of meals", () => {
    /* The owner, 11 November 2026. The clock files a log under a meal
       and the sheet a diary row opens moves it. A row of four meals
       headed the field until Food11; one chip with a menu stood in it
       for a day after. */
    const { container } = renderComposer();
    expect(
      screen.queryByRole("button", { name: /change meal|choose a meal/i })
    ).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText(/^add to$/i)).toBeNull();
    expect(container).not.toHaveTextContent(/Breakfast|Lunch|Snacks|Dinner/);
  });

  it("is one row at every width: nothing wraps and nothing is reordered", () => {
    /* The chip, the pencil and the camera did not fit a 320px phone
       beside the text, so the field broke into two rows below 19.5em of
       width, with its own order, a break element and a second place for
       send. Without the chip the pencil and the camera are 92px between
       them and the text has 196px at 320. */
    const { container, rerender, props } = renderComposer();
    const row = container.querySelector('[data-guide-anchor="food-composer"]')!;
    const field = screen.getByRole("textbox", { name: "What did you eat" });
    expect(row).not.toHaveClass("@container");
    expect(field.parentElement).not.toHaveClass("flex-wrap");
    expect(container.querySelector("[data-row-break]")).toBeNull();
    rerender(<FoodComposerCard {...(props as any)} nlInput="2 eggs" />);
    for (const el of [row, ...row.querySelectorAll("*")]) {
      expect(el.getAttribute("class") ?? "").not.toMatch(/@max-\[|\border-\d/);
    }
  });

  it("the text takes the field's own inset once the pencil has gone", () => {
    const { rerender, props } = renderComposer();
    const field = () =>
      screen.getByRole("textbox", { name: "What did you eat" });
    expect(field()).toHaveClass("pl-0.5");
    rerender(<FoodComposerCard {...(props as any)} inputFocused />);
    expect(screen.queryByRole("button", { name: "Enter manually" })).toBeNull();
    expect(field()).toHaveClass("pl-3");
  });

  it("keeps the example to one line, so a longer one cannot move the page", () => {
    // The example changes every few seconds. One that wrapped grew the
    // field by a line each time it came round.
    renderComposer();
    expect(
      screen.getByRole("textbox", { name: "What did you eat" })
    ).toHaveClass(
      "placeholder:whitespace-nowrap",
      "placeholder:text-ellipsis",
      "placeholder:overflow-hidden"
    );
  });

  it("the text box is the row's 48px and draws no box of its own", () => {
    /* The field's box is a layer under the pencil, the text and the
       camera, so the text box is the full height of the row and
       level with the camera (companion-food.capture.spec.ts measures
       the two against each other). */
    const { container } = renderComposer();
    const field = screen.getByRole("textbox", { name: "What did you eat" });
    expect(field).toHaveClass("min-h-[48px]", "bg-transparent", "border-0");
    expect(field).not.toHaveClass("ds-input");
    expect(container.querySelector("[data-field-box]")).toHaveClass(
      "ds-input-box",
      "absolute",
      "inset-0"
    );
    expect(screen.getByRole("button", { name: "Scan a meal" })).toHaveClass(
      "size-[48px]"
    );
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
  it("opens manual entry from the pencil in the field — one 44px control, no separate button", () => {
    /* "Enter manually" was a ghost button orphaned two rows below the
       field while a decorative pencil sat in it. The pencil is the
       button now, leading the field; the capture spec that clicks by
       name still finds it. */
    renderComposer();
    const pencil = screen.getByRole("button", { name: "Enter manually" });
    expect(pencil).toHaveClass("size-[44px]", "shrink-0");
    // Never left out at a width: the large-text capture spec opens
    // manual entry by it at every size.
    expect(pencil.className).not.toMatch(/:hidden/);
    const field = screen.getByRole("textbox", { name: "What did you eat" });
    expect(
      pencil.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Enter manually" })
    ).toHaveLength(1);
  });

  it.each([
    ["in the field", { inputFocused: true }],
    ["with something written", { nlInput: "2 eggs" }],
  ])("gives the pencil's 44px to the text while typing (%s)", (_, over) => {
    // The text then starts at the field's edge, as in any text box.
    // Manual entry stays in the focused box's list (Quick add) and its
    // no-results row.
    renderComposer(over);
    expect(screen.queryByRole("button", { name: "Enter manually" })).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "What did you eat" })
    ).toHaveClass("pl-3");
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

  it("holds two controls and a text box at rest: the pencil and the camera", () => {
    renderComposer();
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))
    ).toEqual(["Enter manually", "Scan a meal"]);
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
    expect(screen.getByText("1 free scan left · resets at 00:00")).toBeTruthy();
  });

  it("renders the exhausted caption with a working upgrade action at remaining === 0 (real quota)", () => {
    const onUpgrade = vi.fn();
    renderComposer({ scanUsage: quota({ remaining: 0 }), onUpgrade });
    // Pro's own daily cap, not "unlimited": the server stops Pro at
    // DAILY_AI_LIMITS too.
    const cta = screen.getByRole("button", {
      name: "Out of scans · upgrade for 100 a day · resets at 00:00",
    });
    expect(cta.textContent).not.toMatch(/unlimited/i);
    fireEvent.click(cta);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});

describe("FoodComposerCard keyboard focus", () => {
  const settleBlur = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

  it("keeps suggestions open when focus moves from the field into its rows", async () => {
    const { props } = renderComposer({
      showSuggestions: true,
      offEmpty: true,
      offSearchQuery: "zzqxv",
    });
    const input = screen.getByRole("textbox", { name: "What did you eat" });
    const row = screen.getByRole("button", { name: /no matches found/i });
    fireEvent.blur(input, { relatedTarget: row });
    await settleBlur();
    expect(props.setInputFocused).not.toHaveBeenCalledWith(false);
    expect(props.setSuggestionsActive).not.toHaveBeenCalledWith(false);
    fireEvent.click(row);
    expect(props.onManualOpen).toHaveBeenCalledTimes(1);
  });

  it("closes after focus actually leaves the composer", async () => {
    const { props } = renderComposer({
      showSuggestions: true,
      offEmpty: true,
      offSearchQuery: "zzqxv",
    });
    fireEvent.blur(screen.getByRole("button", { name: /no matches found/i }), {
      relatedTarget: document.body,
    });
    await settleBlur();
    expect(props.setInputFocused).toHaveBeenCalledWith(false);
    expect(props.setSuggestionsActive).toHaveBeenCalledWith(false);
  });

  it("cancels an old blur when focus returns before dismissal", async () => {
    const { props } = renderComposer();
    const input = screen.getByRole("textbox", { name: "What did you eat" });
    fireEvent.blur(input, { relatedTarget: document.body });
    fireEvent.focus(input);
    await settleBlur();
    expect(props.setInputFocused).not.toHaveBeenCalledWith(false);
    expect(props.setSuggestionsActive).not.toHaveBeenCalledWith(false);
  });

  it("does not run a stale blur callback after unmount", async () => {
    const { props, unmount } = renderComposer();
    fireEvent.blur(screen.getByRole("textbox", { name: "What did you eat" }), {
      relatedTarget: document.body,
    });
    unmount();
    await settleBlur();
    expect(props.setInputFocused).not.toHaveBeenCalledWith(false);
    expect(props.setSuggestionsActive).not.toHaveBeenCalledWith(false);
  });
});
