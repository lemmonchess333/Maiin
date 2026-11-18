/**
 * An anniversary's reveal (App1 Q58): its words, Share handing a square
 * card of it to the share sheet, and Escape and Done closing it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { displayName: "Sam" } }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
const share = vi.hoisted(() => ({
  generateShareImage: vi.fn(async () => new File(["x"], "card.png")),
  shareImageFile: vi.fn(async () => "shared" as const),
}));
vi.mock("@/lib/shareCardGenerator", () => share);

import AnniversaryReveal from "../AnniversaryReveal";
import { group } from "@/test/localeGrouping";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AnniversaryReveal", () => {
  it("says what was earned and since when, and records it as it draws", () => {
    const shown = vi.fn();
    render(
      <AnniversaryReveal
        anniversary={{
          kind: "sessions100",
          day: "2026-11-14",
          since: "2025-12-01",
        }}
        onShown={shown}
        onDone={vi.fn()}
      />
    );
    const dialog = screen.getByRole("dialog", { name: "Your 100th session" });
    expect(within(dialog).getByText(/trained 100 times/).textContent).toBe(
      "You’ve trained 100 times since 1\u00a0Dec\u00a02025."
    );
    expect(shown).toHaveBeenCalledTimes(1);
  });

  it("shares a square card of it, its words ending on Tropos", async () => {
    render(
      <AnniversaryReveal
        anniversary={{ kind: "km1000", day: "2026-11-14", since: null }}
        onDone={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share.shareImageFile).toHaveBeenCalledTimes(1));
    const [node, options] = share.generateShareImage.mock
      .calls[0] as unknown as [HTMLElement, { format: string }];
    expect(options.format).toBe("square");
    expect(node.textContent).toContain(`${group(1000)} km run`);
    expect(share.shareImageFile).toHaveBeenCalledWith(
      expect.any(File),
      `${group(1000)} km run on Tropos`
    );
  });

  it("closes on Escape and on Done", () => {
    const done = vi.fn();
    render(
      <AnniversaryReveal
        anniversary={{ kind: "oneYear", day: "2026-11-14", since: null }}
        onDone={done}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(done).toHaveBeenCalledTimes(2);
  });
});
