import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  render,
  cleanup,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import ShareCardSheet, { type ShareCardSheetData } from "../ShareCardSheet";

// Mock the rasterise/dispatch layer (no html-to-image / navigator.share
// in jsdom) and the analytics shim so we can assert the funnel.
const generateShareImage = vi.fn();
const shareImageFile = vi.fn();
vi.mock("@/lib/shareCardGenerator", () => ({
  generateShareImage: (...a: unknown[]) => generateShareImage(...a),
  shareImageFile: (...a: unknown[]) => shareImageFile(...a),
}));
const track = vi.fn();
vi.mock("@/lib/socialAnalytics", () => ({
  track: (...a: unknown[]) => track(...a),
}));
// The post's visibility, read when a card of a post opens (App1 Q51).
const publicPostShareLink = vi.fn();
vi.mock("@/lib/postShareLink", () => ({
  publicPostShareLink: (...a: unknown[]) => publicPostShareLink(...a),
}));
// Any other card's own page (Soc17): the `sharedCard` callable, which
// keeps and takes back a card's copy and gives the invite code for the
// words when it is not kept. The sheet's own calls run as they are.
const prepareSharedCards = vi.fn();
const storeSharedCard = vi.fn();
const removeSharedCard = vi.fn();
vi.mock("@/lib/firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/functions")>()),
  httpsCallable:
    () =>
    async ({ action, token, card, sources }: Record<string, unknown>) => {
      if (action === "prepare")
        return { data: { code: await prepareSharedCards() } };
      if (action === "store")
        return {
          data: { stored: await storeSharedCard(token, card, sources) },
        };
      await removeSharedCard(token);
      return { data: { removed: true } };
    },
}));

import { setNativeInstagramProvider } from "@/lib/shareCard/instagramShare";

/* The sheet stamps the SHARER's unit onto the render data, which resolves
   from the auth profile — and `useAuth` throws outside an AuthProvider,
   which this suite doesn't render. Metric keeps the existing export-flow
   assertions describing what they always did; the unit's effect on the
   rendered card is pinned in ShareCardRenderer.test.tsx. */
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));

const runData: ShareCardSheetData = {
  template: "run",
  handle: "Alex",
  date: "12 Jun 2026",
  distanceKm: 10.42,
  durationSec: 3245,
  paceSecPerKm: 312,
  elevationM: 84,
};

beforeEach(() => {
  generateShareImage.mockReset();
  shareImageFile.mockReset();
  track.mockReset();
  publicPostShareLink.mockReset();
  prepareSharedCards.mockReset().mockResolvedValue(null);
  // Not kept unless a test says so: the words keep the front door.
  storeSharedCard.mockReset().mockResolvedValue(false);
  removeSharedCard.mockReset().mockResolvedValue(undefined);
  setNativeInstagramProvider(null); // web default: no IG bridge
});
afterEach(() => {
  cleanup();
  setNativeInstagramProvider(null);
});

describe("ShareCardSheet — export funnel", () => {
  it("emits share_card_opened when opened", () => {
    render(<ShareCardSheet open onOpenChange={() => {}} data={runData} />);
    expect(track).toHaveBeenCalledWith("share_card_opened", {
      template: "run",
    });
  });

  it("does not emit opened while closed", () => {
    render(
      <ShareCardSheet open={false} onOpenChange={() => {}} data={runData} />
    );
    expect(track).not.toHaveBeenCalledWith(
      "share_card_opened",
      expect.anything()
    );
  });

  it("export → generates, dispatches, emits exported with outcome, and closes", async () => {
    const file = new File(["x"], "tropos-story.png", { type: "image/png" });
    generateShareImage.mockResolvedValue(file);
    shareImageFile.mockResolvedValue("shared");
    const onOpenChange = vi.fn();

    render(<ShareCardSheet open onOpenChange={onOpenChange} data={runData} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(generateShareImage).toHaveBeenCalled());
    // Default format/background are story/brand.
    expect(generateShareImage).toHaveBeenCalledWith(expect.anything(), {
      format: "story",
      background: "brand",
    });
    // A copy not kept, and no invite code: the words end with the front
    // door (no link of its own).
    expect(shareImageFile).toHaveBeenCalledWith(
      file,
      expect.stringMatching(/run/i),
      undefined
    );
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith("share_card_exported", {
        template: "run",
        format: "story",
        background: "brand",
        destination: "sheet",
        outcome: "shared",
      })
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("ends a public post's card with the post's own page (App1 Q51)", async () => {
    const file = new File(["x"], "tropos-story.png", { type: "image/png" });
    generateShareImage.mockResolvedValue(file);
    shareImageFile.mockResolvedValue("shared");
    publicPostShareLink.mockResolvedValue(
      "https://troposfit.com/activity/post1"
    );

    render(
      <ShareCardSheet
        open
        onOpenChange={() => {}}
        data={{ ...runData, postId: "post1" }}
      />
    );
    await waitFor(() =>
      expect(publicPostShareLink).toHaveBeenCalledWith("post1")
    );
    // The read settles before the tap, as it does when someone looks at
    // the card first.
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() =>
      expect(shareImageFile).toHaveBeenCalledWith(
        file,
        "My run on Tropos",
        "https://troposfit.com/activity/post1"
      )
    );
    // A public post keeps its own page: no copy is kept.
    expect(storeSharedCard).not.toHaveBeenCalled();
  });

  it("with a native IG provider, exports direct to Instagram (destination=instagram), skipping the sheet", async () => {
    const file = new File(["x"], "tropos-story.png", { type: "image/png" });
    generateShareImage.mockResolvedValue(file);
    const igProvider = vi.fn().mockResolvedValue(true);
    setNativeInstagramProvider(igProvider);
    const onOpenChange = vi.fn();

    render(<ShareCardSheet open onOpenChange={onOpenChange} data={runData} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(igProvider).toHaveBeenCalled());
    // Brand (opaque) export → background asset, not a sticker.
    expect(igProvider).toHaveBeenCalledWith({
      file,
      asTransparentSticker: false,
    });
    // Direct IG handoff → the OS sheet is NOT used.
    expect(shareImageFile).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith("share_card_exported", {
        template: "run",
        format: "story",
        background: "brand",
        destination: "instagram",
        outcome: "shared",
      })
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("picking a photo switches to photo background and overlays the image", async () => {
    render(<ShareCardSheet open onOpenChange={() => {}} data={runData} />);
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File(["x"], "pic.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    // FileReader → data URL → photo background → renderer paints an <img>.
    await waitFor(() => expect(document.querySelector("img")).toBeTruthy());
  });

  it("a failed generation reports failed and does NOT close the sheet", async () => {
    generateShareImage.mockResolvedValue(null);
    const onOpenChange = vi.fn();

    render(<ShareCardSheet open onOpenChange={onOpenChange} data={runData} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() =>
      expect(track).toHaveBeenCalledWith("share_card_exported", {
        template: "run",
        format: "story",
        background: "brand",
        outcome: "failed",
      })
    );
    expect(shareImageFile).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("ShareCardSheet, a card's own page (Soc17)", () => {
  const file = new File(["x"], "tropos-story.png", { type: "image/png" });

  it("ends any other card with its own page once its copy is kept", async () => {
    generateShareImage.mockResolvedValue(file);
    shareImageFile.mockResolvedValue("shared");
    storeSharedCard.mockResolvedValue(true);

    render(
      <ShareCardSheet
        open
        onOpenChange={() => {}}
        data={{ ...runData, runId: "r1", points: [] }}
      />
    );
    // The sheet's card links arrive as it opens, before the tap.
    await waitFor(() => expect(prepareSharedCards).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(shareImageFile).toHaveBeenCalled());
    const [token, copy, sources] = storeSharedCard.mock.calls[0];
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(sources).toEqual({ runId: "r1" });
    // The figures as drawn, without the name.
    expect(copy).toMatchObject({ template: "run", distanceKm: 10.42 });
    expect(JSON.stringify(copy)).not.toContain("Alex");
    expect(shareImageFile).toHaveBeenCalledWith(
      file,
      "My run on Tropos",
      `https://troposfit.com/card/${token}`
    );
    expect(removeSharedCard).not.toHaveBeenCalled();
  });

  it("ends with the sharer's invite link when the copy is not kept", async () => {
    generateShareImage.mockResolvedValue(file);
    shareImageFile.mockResolvedValue("shared");
    prepareSharedCards.mockResolvedValue("K7P49M2H");

    render(<ShareCardSheet open onOpenChange={() => {}} data={runData} />);
    await waitFor(() => expect(prepareSharedCards).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() =>
      expect(shareImageFile).toHaveBeenCalledWith(
        file,
        "My run on Tropos",
        "https://troposfit.com/?invite=K7P49M2H"
      )
    );
  });

  it("takes the copy back when the share is cancelled", async () => {
    generateShareImage.mockResolvedValue(file);
    shareImageFile.mockResolvedValue("cancelled");
    storeSharedCard.mockResolvedValue(true);
    const onOpenChange = vi.fn();

    render(
      <ShareCardSheet
        open
        onOpenChange={onOpenChange}
        data={{ ...runData, runId: "r1" }}
      />
    );
    await waitFor(() => expect(prepareSharedCards).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => expect(removeSharedCard).toHaveBeenCalledTimes(1));
    expect(removeSharedCard).toHaveBeenCalledWith(
      storeSharedCard.mock.calls[0][0]
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
