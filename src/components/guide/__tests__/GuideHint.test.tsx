import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react";
import type { ReactNode } from "react";
import GuideHint from "../GuideHint";
import { AuthUidContext } from "@/lib/auth";
import {
  GUIDE_UNDER_AUTOMATION_KEY,
  WALK_SEEN_KEY,
  hintSeenKey,
} from "@/lib/firstGuide";

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lifecycleAnalytics", () => ({ track }));

const UID = "hint-user";
const asAccount = ({ children }: { children: ReactNode }) => (
  <AuthUidContext.Provider value={UID}>{children}</AuthUidContext.Provider>
);

/** The thing the hint points at: a working control, drawn with a size
 *  (jsdom draws nothing, and the hint waits for a size). */
const added: Element[] = [];
function anchor(onClick = vi.fn()) {
  const el = document.createElement("button");
  el.textContent = "Mark set complete";
  el.setAttribute("data-guide-anchor", "first-set");
  el.addEventListener("click", onClick);
  el.getBoundingClientRect = () =>
    ({
      left: 300,
      top: 200,
      width: 44,
      height: 44,
      x: 300,
      y: 200,
      right: 344,
      bottom: 244,
      toJSON() {},
    }) as DOMRect;
  document.body.appendChild(el);
  added.push(el);
  return el;
}

function metTheGuide() {
  localStorage.setItem(`${UID}:${WALK_SEEN_KEY}`, "1");
}

function renderHint(props: Partial<Parameters<typeof GuideHint>[0]> = {}) {
  return render(<GuideHint id="first-set" when {...props} />, {
    wrapper: asAccount,
  });
}

/** Long enough for the hint to have looked for its anchor and shown. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });
}

beforeEach(() => {
  localStorage.clear();
  track.mockClear();
});

afterEach(() => {
  cleanup();
  for (const el of added.splice(0)) el.remove();
  Object.defineProperty(navigator, "webdriver", {
    value: undefined,
    configurable: true,
  });
});

describe("GuideHint", () => {
  it("points at its control for an account that has met the guide", async () => {
    metTheGuide();
    anchor();
    renderHint();
    const hint = await screen.findByRole("dialog", { name: "Your first set" });
    expect(hint).toHaveTextContent("tap the box when it’s done");
    expect(track).toHaveBeenCalledExactlyOnceWith("guide_hint_viewed", {
      hint: "first-set",
    });
  });

  it("stays away from an account that never met the guide", async () => {
    anchor();
    renderHint();
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  it("waits for the page to say its moment has come", async () => {
    metTheGuide();
    anchor();
    renderHint({ when: false });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows once: Got it closes it for this account for good", async () => {
    metTheGuide();
    anchor();
    const first = renderHint();
    fireEvent.click(await screen.findByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(`${UID}:${hintSeenKey("first-set")}`)).toBe(
      "1"
    );
    first.unmount();
    renderHint();
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows again when a first-week row asks for it", async () => {
    metTheGuide();
    localStorage.setItem(`${UID}:${hintSeenKey("first-set")}`, "1");
    anchor();
    const onClose = vi.fn();
    renderHint({ requested: true, onClose });
    fireEvent.click(await screen.findByRole("button", { name: "Got it" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("a tap on the control closes it, and the control still works", async () => {
    metTheGuide();
    const onClick = vi.fn();
    const el = anchor(onClick);
    renderHint();
    await screen.findByRole("dialog");
    fireEvent.pointerDown(el);
    fireEvent.click(el);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onClick).toHaveBeenCalledOnce();
    expect(localStorage.getItem(`${UID}:${hintSeenKey("first-set")}`)).toBe(
      "1"
    );
  });

  it("Escape closes it", async () => {
    metTheGuide();
    anchor();
    renderHint();
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("taps inside it don't close it", async () => {
    metTheGuide();
    anchor();
    renderHint();
    const hint = await screen.findByRole("dialog");
    fireEvent.pointerDown(hint);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("uses the page's own words when it has better ones", async () => {
    metTheGuide();
    anchor();
    renderHint({ body: "Tap the box when it’s done." });
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Tap the box when it’s done."
    );
  });

  it("never shows under automation unless a capture spec turns it on", async () => {
    Object.defineProperty(navigator, "webdriver", {
      value: true,
      configurable: true,
    });
    metTheGuide();
    anchor();
    const off = renderHint();
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    off.unmount();

    localStorage.setItem(GUIDE_UNDER_AUTOMATION_KEY, "on");
    renderHint();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("keeps each account's seen flag to itself", async () => {
    metTheGuide();
    anchor();
    renderHint();
    fireEvent.click(await screen.findByRole("button", { name: "Got it" }));
    expect(localStorage.getItem(hintSeenKey("first-set"))).toBeNull();
    expect(localStorage.getItem(`anon:${hintSeenKey("first-set")}`)).toBeNull();
  });
});
