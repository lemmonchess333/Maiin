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
    // No post: the words end with the front door (no link of its own).
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
