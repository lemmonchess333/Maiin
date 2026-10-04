import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react";
import GuideWalk from "../GuideWalk";
import type { GuideStop } from "@/lib/firstGuide";

/* jsdom lays nothing out, so every box is zero and the walk would pass
   over every stop as "not on the page". The targets here are given the
   size a phone would give them. */
function sized(
  el: Element,
  box = { left: 16, top: 200, width: 360, height: 120 }
) {
  el.getBoundingClientRect = () =>
    ({
      ...box,
      x: box.left,
      y: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
      toJSON() {},
    }) as DOMRect;
}

/** Page elements a test adds, removed again after React has unmounted. */
const added: Element[] = [];
function add<T extends Element>(el: T): T {
  document.body.appendChild(el);
  added.push(el);
  return el;
}

function target(name: string, top = 200) {
  const el = add(document.createElement("div"));
  el.setAttribute("data-guide-stop", name);
  sized(el, { left: 16, top, width: 360, height: 120 });
  return el;
}

/** Home's header mark, drawn where Home draws it. */
function headerMark() {
  const el = add(document.createElement("span"));
  el.setAttribute("data-brand-mark", "");
  sized(el, { left: 16, top: 30, width: 14, height: 16 });
  return el;
}

/** Everything has a size, as on a phone: the card's mark slot included,
 *  which the walk measures to fly the mark into. */
function layOutEverything() {
  const proto = Element.prototype;
  const original = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function (this: Element) {
    const r = original.call(this);
    if (r.width > 0) return r;
    return {
      left: 40,
      top: 340,
      width: 20,
      height: 20,
      x: 40,
      y: 340,
      right: 60,
      bottom: 360,
      toJSON() {},
    } as DOMRect;
  };
  return () => {
    proto.getBoundingClientRect = original;
  };
}

/** The card is on screen: it shows once its target holds still, and its
 *  main button has focus. The button keeps focus from stop to stop, so
 *  focus alone doesn't say the card can be seen. */
async function cardShown(name: "Next" | "Done" | "Got it" = "Next") {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => {
    expect(button).toBeVisible();
    expect(button).toHaveFocus();
  });
  return button;
}

const STOPS: GuideStop[] = [
  { id: "today", target: "a", title: "Stop one", body: "The first stop." },
  { id: "first-week", target: "b", title: "Stop two", body: "The second." },
  { id: "food", target: "c", title: "Stop three", body: "The last stop." },
];

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  window.scrollBy = vi.fn();
  setReducedMotion(false);
});

afterEach(() => {
  cleanup();
  for (const el of added.splice(0)) el.remove();
  document.documentElement.classList.remove("guiding");
});

describe("GuideWalk", () => {
  it("is a labelled modal dialog, with focus on its main button", async () => {
    target("a");
    target("b", 400);
    target("c", 560);
    render(<GuideWalk stops={STOPS} onClose={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "Stop one" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toHaveFocus()
    );
  });

  it("walks the stops in order and reports finishing from the last", async () => {
    target("a");
    target("b", 400);
    target("c", 560);
    const onClose = vi.fn();
    const onStep = vi.fn();
    render(<GuideWalk stops={STOPS} onStep={onStep} onClose={onClose} />);
    await screen.findByText("Stop one");
    expect(screen.getByText("of")).toHaveTextContent("1 of 3");

    fireEvent.click(await cardShown());
    await screen.findByText("Stop two");
    fireEvent.click(await cardShown());
    await screen.findByText("Stop three");
    // The last stop has no Skip: Done is the way out.
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    fireEvent.click(await cardShown("Done"));

    await waitFor(() =>
      expect(onClose).toHaveBeenCalledExactlyOnceWith({
        finished: true,
        index: 2,
      })
    );
    expect(onStep.mock.calls.map(([i, s]) => [i, s.id])).toEqual([
      [0, "today"],
      [1, "first-week"],
      [2, "food"],
    ]);
  });

  it("passes over a stop whose card isn't on the page", async () => {
    target("a");
    target("c", 560);
    render(<GuideWalk stops={STOPS} onClose={vi.fn()} />);
    await screen.findByText("Stop one");
    fireEvent.click(await cardShown());
    await screen.findByText("Stop three");
    expect(screen.queryByText("Stop two")).toBeNull();
  });

  it("passes over a card that is there but has no size", async () => {
    target("a");
    // In the page, but drawn at no size (jsdom's zero box).
    add(document.createElement("div")).setAttribute("data-guide-stop", "b");
    target("c", 560);
    render(<GuideWalk stops={STOPS} onClose={vi.fn()} />);
    await screen.findByText("Stop one");
    fireEvent.click(await cardShown());
    await screen.findByText("Stop three");
  });

  it("hides the card on Next until the next target holds still", async () => {
    target("a");
    const moving = target("b", 900);
    target("c", 560);
    // The second stop's card is still scrolling into view.
    let top = 900;
    sized(moving, { left: 16, top, width: 360, height: 120 });
    moving.getBoundingClientRect = () =>
      ({
        left: 16,
        top,
        width: 360,
        height: 120,
        x: 16,
        y: top,
        right: 376,
        bottom: top + 120,
        toJSON() {},
      }) as DOMRect;
    render(<GuideWalk stops={STOPS} onClose={vi.fn()} />);
    const next = await cardShown();
    fireEvent.click(next);
    // The words change at once, but the card is hidden while its target
    // moves, so they never show in the last stop's place…
    expect(screen.getByText("Stop two")).not.toBeVisible();
    // …and a second Next while it is hidden does nothing.
    fireEvent.click(next);
    for (const at of [760, 600, 450, 400]) {
      top = at;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });
      expect(screen.getByText("Stop two")).not.toBeVisible();
    }
    await cardShown();
    expect(screen.getByText("Stop two")).toBeVisible();
    expect(screen.getByText("of")).toHaveTextContent("2 of 3");
  });

  it("ends at once, unfinished, when nothing it names is on the page", async () => {
    const onClose = vi.fn();
    render(<GuideWalk stops={STOPS} onClose={onClose} />);
    await waitFor(() =>
      expect(onClose).toHaveBeenCalledExactlyOnceWith({
        finished: false,
        index: 0,
      })
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Skip ends it unfinished, at the stop it was on", async () => {
    target("a");
    target("b", 400);
    target("c", 560);
    const onClose = vi.fn();
    render(<GuideWalk stops={STOPS} onClose={onClose} />);
    await screen.findByText("Stop one");
    fireEvent.click(await cardShown());
    await screen.findByText("Stop two");
    await cardShown();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() =>
      expect(onClose).toHaveBeenCalledExactlyOnceWith({
        finished: false,
        index: 1,
      })
    );
  });

  it("Escape skips", async () => {
    target("a");
    target("b", 400);
    target("c", 560);
    const onClose = vi.fn();
    render(<GuideWalk stops={STOPS} onClose={onClose} />);
    await screen.findByText("Stop one");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(onClose).toHaveBeenCalledWith({ finished: false, index: 0 })
    );
  });

  it("keeps Tab inside the card", async () => {
    target("a");
    target("b", 400);
    target("c", 560);
    render(<GuideWalk stops={STOPS} onClose={vi.fn()} />);
    await screen.findByText("Stop one");
    const next = screen.getByRole("button", { name: "Next" });
    const skip = screen.getByRole("button", { name: "Skip" });
    await waitFor(() => expect(next).toHaveFocus());
    fireEvent.keyDown(document, { key: "Tab" });
    expect(skip).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(next).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(skip).toHaveFocus();
  });

  it("a single stop opened from the first-week card says Got it, with no count or Skip", async () => {
    target("a");
    const onClose = vi.fn();
    render(<GuideWalk stops={[STOPS[0]]} onClose={onClose} />);
    await screen.findByText("Stop one");
    expect(screen.queryByText("of")).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    fireEvent.click(await cardShown("Got it"));
    await waitFor(() =>
      expect(onClose).toHaveBeenCalledWith({ finished: true, index: 0 })
    );
  });

  it("lifts the mark out of Home's header and puts it back", async () => {
    const restore = layOutEverything();
    headerMark();
    target("a");
    const onClose = vi.fn();
    try {
      render(<GuideWalk stops={[STOPS[0]]} fromHeader onClose={onClose} />);
      // While the guide's mark is out, the header shows none.
      await waitFor(() =>
        expect(document.documentElement).toHaveClass("guiding")
      );
      await screen.findByText("Stop one");
      fireEvent.click(await cardShown("Got it"));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(document.documentElement).not.toHaveClass("guiding");
    } finally {
      restore();
    }
  });

  it("under Reduce Motion the mark stays in the card: no flight", async () => {
    setReducedMotion(true);
    const restore = layOutEverything();
    headerMark();
    target("a");
    try {
      render(<GuideWalk stops={[STOPS[0]]} fromHeader onClose={vi.fn()} />);
      await screen.findByText("Stop one");
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      expect(document.documentElement).not.toHaveClass("guiding");
    } finally {
      restore();
    }
  });

  it("gives the header its mark back if it is taken away mid-walk", async () => {
    const restore = layOutEverything();
    headerMark();
    target("a");
    try {
      const { unmount } = render(
        <GuideWalk stops={[STOPS[0]]} fromHeader onClose={vi.fn()} />
      );
      await waitFor(() =>
        expect(document.documentElement).toHaveClass("guiding")
      );
      unmount();
      expect(document.documentElement).not.toHaveClass("guiding");
    } finally {
      restore();
    }
  });
});
