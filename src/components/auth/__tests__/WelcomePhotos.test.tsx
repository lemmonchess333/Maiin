/**
 * The welcome's photographs: the first is fetched with the screen, the
 * rest only once it has drawn, the cycle moves only to a photograph that
 * has loaded, and Reduce Motion keeps the first one still and never
 * fetches the others.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WelcomePhotos from "../WelcomePhotos";
import { WELCOME_PHOTOS, WELCOME_PHOTO_HOLD_MS } from "@/lib/welcomePhotos";
import { restoreRealTimers } from "@/test/fakeTimers";

const realMatchMedia = window.matchMedia;
function reduceMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

const images = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLImageElement>("img.welcome-photo"));
const shown = (container: HTMLElement) =>
  images(container).findIndex((img) => img.dataset.shown === "true");

beforeEach(() => {
  vi.useFakeTimers();
  reduceMotion(false);
});

afterEach(async () => {
  cleanup();
  await restoreRealTimers();
  window.matchMedia = realMatchMedia;
});

describe("WelcomePhotos", () => {
  it("is decorative: hidden from assistive technology, with empty alt text", () => {
    const { container } = render(<WelcomePhotos />);
    expect(container.querySelector(".welcome-photos")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    for (const img of images(container)) expect(img).toHaveAttribute("alt", "");
  });

  it("fetches only the first photograph until it has drawn", () => {
    const { container } = render(<WelcomePhotos />);
    expect(images(container)).toHaveLength(1);
    expect(images(container)[0]).toHaveAttribute("fetchpriority", "high");
    // Not shown until it has loaded, so it fades in whole.
    expect(images(container)[0].dataset.ready).toBe("false");

    fireEvent.load(images(container)[0]);
    expect(images(container)[0].dataset.ready).toBe("true");
    expect(images(container)).toHaveLength(WELCOME_PHOTOS.length);
  });

  it("moves to the next photograph only once it has loaded", () => {
    const { container } = render(<WelcomePhotos />);
    fireEvent.load(images(container)[0]);
    expect(shown(container)).toBe(0);

    // The second has not loaded: the first holds.
    act(() => vi.advanceTimersByTime(WELCOME_PHOTO_HOLD_MS));
    expect(shown(container)).toBe(0);

    fireEvent.load(images(container)[1]);
    act(() => vi.advanceTimersByTime(WELCOME_PHOTO_HOLD_MS));
    expect(shown(container)).toBe(1);
  });

  it("goes round all five and back to the first", () => {
    const { container } = render(<WelcomePhotos />);
    fireEvent.load(images(container)[0]);
    for (const img of images(container)) fireEvent.load(img);
    for (let i = 1; i <= WELCOME_PHOTOS.length; i++) {
      act(() => vi.advanceTimersByTime(WELCOME_PHOTO_HOLD_MS));
      expect(shown(container)).toBe(i % WELCOME_PHOTOS.length);
    }
  });

  it("under Reduce Motion keeps the first photograph and never fetches the rest", () => {
    reduceMotion(true);
    const { container } = render(<WelcomePhotos />);
    fireEvent.load(images(container)[0]);
    act(() => vi.advanceTimersByTime(WELCOME_PHOTO_HOLD_MS * 3));
    expect(images(container)).toHaveLength(1);
    expect(shown(container)).toBe(0);
  });

  it("pauses while the page is hidden", () => {
    const { container } = render(<WelcomePhotos />);
    fireEvent.load(images(container)[0]);
    for (const img of images(container)) fireEvent.load(img);

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(WELCOME_PHOTO_HOLD_MS * 2));
    expect(shown(container)).toBe(0);

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(WELCOME_PHOTO_HOLD_MS));
    expect(shown(container)).toBe(1);
    delete (document as { hidden?: boolean }).hidden;
  });
});
