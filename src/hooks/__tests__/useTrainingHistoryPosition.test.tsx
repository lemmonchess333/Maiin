import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useTrainingHistoryPosition as usePagePosition,
  useTrainingHistoryRestore,
} from "../useTrainingHistoryPosition";

/** The element that holds the rows, as the page's ref holds it. */
const rows: { current: HTMLElement | null } = { current: null };

function useTrainingHistoryPosition(
  uid: string,
  filters: string,
  ready: boolean,
  rowCount: number,
  provisional: boolean
) {
  const position = usePagePosition(uid, filters);
  useTrainingHistoryRestore(position, rows, ready, rowCount, provisional);
  return position;
}

const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
let scrollY = 0;
/** Where the rows start on the page: what is above them sets it. */
let rowsAt = 0;

/** The rows' element, placed on the page at `rowsAt`. */
function rowsElement() {
  const rows = document.createElement("div");
  rows.getBoundingClientRect = () => ({ top: rowsAt - scrollY }) as DOMRect;
  return rows;
}

beforeEach(() => {
  scrollY = 0;
  rowsAt = 300;
  rows.current = null;
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    get: () => scrollY,
  });
  vi.spyOn(window, "scrollTo").mockImplementation((options) => {
    scrollY = (options as ScrollToOptions).top ?? 0;
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalScrollY)
    Object.defineProperty(window, "scrollY", originalScrollY);
});

describe("Training History position", () => {
  it("restores again after a provisional sync banner leaves without repeatedly moving offline readers", () => {
    const uid = "history-position-banner-test";
    const filters = "older-period";
    const firstVisit = renderHook(() =>
      useTrainingHistoryPosition(uid, filters, true, 71, false)
    );
    rows.current = rowsElement();
    act(() => firstVisit.result.current.showMore());
    expect(firstVisit.result.current.count).toBe(60);
    scrollY = 4574;
    act(() => firstVisit.result.current.remember(rows.current));
    firstVisit.unmount();

    scrollY = 0;
    const back = renderHook(
      ({ ready, rowCount, provisional }) =>
        useTrainingHistoryPosition(uid, filters, ready, rowCount, provisional),
      {
        initialProps: { ready: false, rowCount: 0, provisional: false },
      }
    );
    expect(back.result.current.count).toBe(60);
    expect(scrollY).toBe(0);

    rows.current = rowsElement();
    back.rerender({ ready: true, rowCount: 71, provisional: true });
    expect(scrollY).toBe(4574);

    // A cached/offline period may keep the banner for a long time. Renders
    // while it stays visible must not pull the reader back after they scroll.
    scrollY = 4400;
    back.rerender({ ready: true, rowCount: 72, provisional: true });
    expect(scrollY).toBe(4400);

    // The banner above the list leaves when the server confirms the period.
    scrollY = 4450;
    back.rerender({ ready: true, rowCount: 72, provisional: false });
    expect(scrollY).toBe(4574);

    scrollY = 4000;
    back.rerender({ ready: true, rowCount: 73, provisional: false });
    expect(scrollY).toBe(4000);
  });

  it("returns to the same row when what is above the rows changed height", () => {
    const uid = "history-position-shift-test";
    const filters = "older-period";
    // Left with the sync banner showing above the rows.
    rowsAt = 424;
    const firstVisit = renderHook(() =>
      useTrainingHistoryPosition(uid, filters, true, 71, true)
    );
    rows.current = rowsElement();
    act(() => firstVisit.result.current.showMore());
    scrollY = 4698;
    act(() => firstVisit.result.current.remember(rows.current));
    firstVisit.unmount();

    // Back after the period finished syncing: no banner, rows 124 px higher.
    rowsAt = 300;
    scrollY = 0;
    const back = renderHook(
      ({ ready }) => useTrainingHistoryPosition(uid, filters, ready, 71, false),
      { initialProps: { ready: false } }
    );
    rows.current = rowsElement();
    back.rerender({ ready: true });
    expect(scrollY - rowsAt).toBe(4698 - 424);
  });

  it("waits for the rows before restoring a place in them", () => {
    const uid = "history-position-rows-test";
    const filters = "older-period";
    const firstVisit = renderHook(() =>
      useTrainingHistoryPosition(uid, filters, true, 40, false)
    );
    rows.current = rowsElement();
    scrollY = 2000;
    act(() => firstVisit.result.current.remember(rows.current));
    firstVisit.unmount();

    rows.current = null;
    scrollY = 0;
    const back = renderHook(
      ({ rowCount }) =>
        useTrainingHistoryPosition(uid, filters, true, rowCount, false),
      { initialProps: { rowCount: 40 } }
    );
    expect(scrollY).toBe(0);
    rows.current = rowsElement();
    back.rerender({ rowCount: 41 });
    expect(scrollY).toBe(2000);
  });
});
