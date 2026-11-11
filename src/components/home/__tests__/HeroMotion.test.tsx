/**
 * HeroMotion: Home's hero picture as a flipbook. It plays its cycles,
 * then rests on its first frame; it never moves under Reduce Motion.
 * The animation frame clock is driven by hand, so each frame is counted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import HeroMotion from "../HeroMotion";
import SessionHero from "../SessionHero";
import {
  heroMotionCycles,
  heroMotionFor,
  sheetPosition,
  type HeroMotionSheet,
} from "@/lib/heroMotion";

const SHEET: HeroMotionSheet = {
  src: "form-art/motion/run-easy.webp",
  still: "form-art/run-easy.webp",
  frames: 6,
  fps: 12,
  frameWidth: 240,
  frameHeight: 480,
  cols: 3,
  sha256: "",
};

let callbacks: Array<(now: number) => void> = [];
let now = 0;

/** Advance the frame clock by `ms`, one animation frame per 1000/60 ms. */
async function advance(ms: number) {
  const end = now + ms;
  while (now < end) {
    now += 1000 / 60;
    const due = callbacks;
    callbacks = [];
    await act(async () => {
      for (const cb of due) cb(now);
    });
  }
}

beforeEach(() => {
  callbacks = [];
  now = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: (now: number) => void) => {
      callbacks.push(cb);
      return callbacks.length;
    })
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  // jsdom has no image decoding: the sheet decodes at once.
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: () => Promise.resolve(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
});

const position = (el: HTMLElement) => el.style.backgroundPosition;

describe("sheetPosition", () => {
  it("finds each frame in a grid of three a row", () => {
    expect(sheetPosition(SHEET, 0)).toBe("0% 0%");
    expect(sheetPosition(SHEET, 2)).toBe("100% 0%");
    expect(sheetPosition(SHEET, 4)).toBe("50% 100%");
  });

  it("puts a single row at the top", () => {
    expect(sheetPosition({ ...SHEET, cols: 6 }, 3)).toBe("60% 0%");
  });
});

describe("HeroMotion", () => {
  it("plays its cycles, then rests on the first frame", async () => {
    const { container } = render(<HeroMotion sheet={SHEET} cycles={2} />);
    const flipbook = container.firstElementChild as HTMLElement;
    await act(async () => {}); // the sheet decodes
    const seen = new Set<string>();
    // A frame is 1000/12 ms: two cycles of six take one second.
    for (let t = 0; t < 1000; t += 50) {
      await advance(50);
      seen.add(position(flipbook));
    }
    expect(seen.size).toBe(SHEET.frames);
    await advance(200);
    expect(position(flipbook)).toBe("0% 0%");
    // At rest it asks for no more frames.
    const asked = vi.mocked(window.requestAnimationFrame).mock.calls.length;
    await advance(500);
    expect(vi.mocked(window.requestAnimationFrame).mock.calls.length).toBe(
      asked
    );
  });

  it("never moves under Reduce Motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { container } = render(<HeroMotion sheet={SHEET} cycles={3} />);
    const flipbook = container.firstElementChild as HTMLElement;
    await act(async () => {});
    await advance(1000);
    expect(flipbook.dataset.heroMotion).toBe("still");
    expect(position(flipbook)).toBe("0% 0%");
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("waits while the app is in the background", async () => {
    const state = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    const { container } = render(<HeroMotion sheet={SHEET} cycles={1} />);
    const flipbook = container.firstElementChild as HTMLElement;
    await act(async () => {});
    await advance(500);
    expect(position(flipbook)).toBe("0% 0%");
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    state.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(200);
    expect(position(flipbook)).not.toBe("0% 0%");
  });

  it("draws the sheet at the frame's own shape", () => {
    const { container } = render(<HeroMotion sheet={SHEET} cycles={1} />);
    const flipbook = container.firstElementChild as HTMLElement;
    expect(flipbook.style.aspectRatio).toBe("240 / 480");
    expect(flipbook.style.backgroundSize).toBe("300% 200%");
    expect(flipbook.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the hero's picture", () => {
  it("is the flipbook where the drawing has one, the still where not", () => {
    const { container, rerender } = render(
      <SessionHero
        sport="run"
        title="Easy run"
        picture={{ src: "/form-art/run-easy.webp", motion: SHEET }}
      />
    );
    expect(container.querySelector("[data-hero-motion]")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();

    rerender(
      <SessionHero
        sport="run"
        title="Easy run"
        picture={{ src: "/form-art/run-easy.webp", motion: null }}
      />
    );
    expect(container.querySelector("[data-hero-motion]")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/form-art/run-easy.webp"
    );
  });

  it("moves for about five seconds, in whole loops", () => {
    // Six frames at 12 fps is half a second a loop: ten loops.
    expect(heroMotionCycles(SHEET)).toBe(10);
    // A loop longer than five seconds still plays once.
    expect(heroMotionCycles({ ...SHEET, frames: 90 })).toBe(1);
  });

  it("finds no flipbook for a drawing that has none", () => {
    expect(heroMotionFor("form-art/no-such-drawing.webp")).toBeNull();
  });
});
