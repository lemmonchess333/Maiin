import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHOTO_HOLD_MS, startPhotoFade } from "@/website/site/photoFade";
import { restoreRealTimers } from "@/test/fakeTimers";

/** The home page's photographs as the build writes them: the first with
 *  its address, the rest named in data-src. */
function photos(count = 3): HTMLElement {
  const box = document.createElement("div");
  for (let i = 0; i < count; i++) {
    const img = document.createElement("img");
    img.dataset.photo = "";
    img.dataset.shown = String(i === 0);
    if (i === 0) img.src = "/a.webp";
    else img.dataset.src = `/p${i}.webp`;
    box.append(img);
  }
  document.body.append(box);
  return box;
}

function load(img: HTMLImageElement) {
  img.dispatchEvent(new Event("load"));
}

const shown = (box: HTMLElement) =>
  [...box.querySelectorAll<HTMLImageElement>("img")].findIndex(
    (img) => img.dataset.shown === "true"
  );

function motion(reduced: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduced });
}

describe("the home page's photographs", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => {
    await restoreRealTimers();
    document.body.innerHTML = "";
  });

  it("fetches the rest once the first has drawn, then plays once and rests on the first", () => {
    motion(false);
    const box = photos(3);
    const imgs = [...box.querySelectorAll("img")];
    startPhotoFade(box);
    // Nothing else is fetched before the first photograph has drawn.
    expect(imgs[1].getAttribute("src")).toBeNull();
    load(imgs[0]);
    expect(imgs[1].getAttribute("src")).toBe("/p1.webp");
    expect(imgs[2].getAttribute("src")).toBe("/p2.webp");
    load(imgs[1]);
    load(imgs[2]);

    vi.advanceTimersByTime(PHOTO_HOLD_MS);
    expect(shown(box)).toBe(1);
    vi.advanceTimersByTime(PHOTO_HOLD_MS);
    expect(shown(box)).toBe(2);
    vi.advanceTimersByTime(PHOTO_HOLD_MS);
    expect(shown(box)).toBe(0);
    // One pass, then it holds (WCAG 2.2.2).
    vi.advanceTimersByTime(PHOTO_HOLD_MS * 5);
    expect(shown(box)).toBe(0);
  });

  it("waits on a photograph that has not arrived", () => {
    motion(false);
    const box = photos(2);
    const imgs = [...box.querySelectorAll("img")];
    startPhotoFade(box);
    load(imgs[0]);
    vi.advanceTimersByTime(PHOTO_HOLD_MS * 2);
    expect(shown(box)).toBe(0);
    load(imgs[1]);
    vi.advanceTimersByTime(PHOTO_HOLD_MS);
    expect(shown(box)).toBe(1);
  });

  it("never fetches the rest under Reduce Motion", () => {
    motion(true);
    const box = photos(3);
    const imgs = [...box.querySelectorAll("img")];
    startPhotoFade(box);
    load(imgs[0]);
    vi.advanceTimersByTime(PHOTO_HOLD_MS * 3);
    expect(imgs[1].getAttribute("src")).toBeNull();
    expect(shown(box)).toBe(0);
  });
});
