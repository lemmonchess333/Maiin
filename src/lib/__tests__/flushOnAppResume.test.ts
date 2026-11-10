// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { flushOnAppResume, RESUME_FLUSH_GAP_MS } from "../flushOnAppResume";

let stop = () => {};
afterEach(() => {
  stop();
  stop = () => {};
  setVisibility("visible");
});

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

/** Leave and come back, as switching apps does. */
function comeBack() {
  setVisibility("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  setVisibility("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("focus"));
}

describe("flushOnAppResume", () => {
  it("retries when the person comes back after the gap", () => {
    const flush = vi.fn();
    let clock = 1_000;
    stop = flushOnAppResume(flush, RESUME_FLUSH_GAP_MS, () => clock);

    clock += RESUME_FLUSH_GAP_MS;
    comeBack();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("does not repeat the flush the caller has just made", () => {
    const flush = vi.fn();
    let clock = 1_000;
    stop = flushOnAppResume(flush, RESUME_FLUSH_GAP_MS, () => clock);

    clock += 5;
    window.dispatchEvent(new Event("focus"));
    expect(flush).not.toHaveBeenCalled();
  });

  it("retries once for one return, however many ways it is reported", () => {
    const flush = vi.fn();
    let clock = 0;
    stop = flushOnAppResume(flush, RESUME_FLUSH_GAP_MS, () => clock);

    clock = RESUME_FLUSH_GAP_MS;
    comeBack();
    window.dispatchEvent(new Event("focus"));
    expect(flush).toHaveBeenCalledTimes(1);

    // And again on a later return.
    clock = RESUME_FLUSH_GAP_MS * 2;
    comeBack();
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("does nothing while the page is hidden", () => {
    const flush = vi.fn();
    let clock = 0;
    stop = flushOnAppResume(flush, RESUME_FLUSH_GAP_MS, () => clock);

    clock = RESUME_FLUSH_GAP_MS;
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flush).not.toHaveBeenCalled();
  });

  it("stops when asked", () => {
    const flush = vi.fn();
    let clock = 0;
    stop = flushOnAppResume(flush, RESUME_FLUSH_GAP_MS, () => clock);
    stop();

    clock = RESUME_FLUSH_GAP_MS;
    comeBack();
    expect(flush).not.toHaveBeenCalled();
  });
});
