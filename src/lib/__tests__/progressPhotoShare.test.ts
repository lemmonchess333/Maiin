// @vitest-environment jsdom — the images are drawn on a canvas, and the web download needs a document.
/**
 * Sharing a progress photo: built on the device, handed to the share
 * sheet, downloaded on the web, never uploaded.
 *
 * What is pinned is what ends up on the image and where it goes: a
 * before-and-after puts each photo in its own 3:4 frame, cropped like
 * `object-fit: cover`, with its own date (en-GB, the local day it names)
 * beneath and nothing else written on it; and a share is "shared",
 * "cancelled" or "failed", or "saved" as a download on the web, never a
 * download in the native app, where WKWebView drops one without a word.
 *
 * jsdom has no canvas, so the 2D context is a recorder and `toBlob`
 * answers from the canvas's own size.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const H = vi.hoisted(() => ({
  native: false,
  shareSupported: false,
  logError: vi.fn(),
}));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => H.native }));
vi.mock("@/lib/sharePhoto", () => ({
  isPhotoShareSupported: () => H.shareSupported,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: H.logError, warn: vi.fn(), log: vi.fn() },
}));

import {
  COMPARISON_LAYOUT,
  canShareProgressImages,
  comparisonImage,
  coverCrop,
  photoImage,
  shareProgressImage,
} from "../progressPhotoShare";
import { THEME } from "@/lib/theme";

const FONT = '600 34px "Plus Jakarta Sans", system-ui, sans-serif';

interface Drawn {
  op: "fillRect" | "drawImage" | "fillText";
  args: unknown[];
  fillStyle?: unknown;
  font?: string;
  textAlign?: string;
}

let drawn: Drawn[];
let encoded: {
  width: number;
  height: number;
  type?: string;
  quality?: unknown;
}[];
let encodeEmpty: boolean;

/** A decoded photo of a given size, as `createImageBitmap` hands it back. */
const bitmaps = new Map<Blob, { width: number; height: number }>();
function photoOf(width: number, height: number) {
  const blob = new Blob([`${width}x${height}`], { type: "image/jpeg" });
  bitmaps.set(blob, { width, height });
  return blob;
}

function stubCanvas() {
  const ctx = {
    fillStyle: "" as unknown,
    font: "",
    textAlign: "",
    fillRect: (...args: unknown[]) =>
      drawn.push({ op: "fillRect", args, fillStyle: ctx.fillStyle }),
    drawImage: (...args: unknown[]) => drawn.push({ op: "drawImage", args }),
    fillText: (...args: unknown[]) =>
      drawn.push({
        op: "fillText",
        args,
        fillStyle: ctx.fillStyle,
        font: ctx.font,
        textAlign: ctx.textAlign,
      }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as never
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback,
    type,
    quality
  ) {
    encoded.push({ width: this.width, height: this.height, type, quality });
    callback(encodeEmpty ? null : new Blob(["drawn"], { type }));
  });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (blob: Blob) => bitmaps.get(blob))
  );
}

function setFonts(load: ((font: string) => Promise<unknown>) | undefined) {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: load ? { load: vi.fn(load) } : undefined,
  });
}

function setShareSheet(
  canShare: ((data: { files: File[] }) => boolean) | undefined,
  share: ((data: { files: File[] }) => Promise<void>) | undefined
) {
  Object.defineProperty(navigator, "canShare", {
    value: canShare,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "share", {
    value: share,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  H.native = false;
  H.shareSupported = false;
  H.logError.mockReset();
  drawn = [];
  encoded = [];
  encodeEmpty = false;
  bitmaps.clear();
  stubCanvas();
  setFonts(async () => []);
});
afterEach(() => {
  setShareSheet(undefined, undefined);
  delete (document as { fonts?: unknown }).fonts;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("COMPARISON_LAYOUT", () => {
  const { width, height, frames } = COMPARISON_LAYOUT;

  it("gives each photo a 3:4 frame, side by side at the same height", () => {
    for (const frame of frames) {
      expect(frame.width / frame.height).toBeCloseTo(3 / 4);
    }
    expect(frames[0].y).toBe(frames[1].y);
    expect(frames[0].width).toBe(frames[1].width);
    expect(frames[1].x).toBeGreaterThan(frames[0].x + frames[0].width);
  });

  it("keeps both photos and both dates on the image", () => {
    for (const frame of frames) {
      expect(frame.x).toBeGreaterThan(0);
      expect(frame.y).toBeGreaterThan(0);
      expect(frame.x + frame.width).toBeLessThan(width);
      expect(frame.labelY).toBeGreaterThan(frame.y + frame.height);
      expect(frame.labelY).toBeLessThan(height);
    }
    // The same margin either side.
    expect(width - (frames[1].x + frames[1].width)).toBe(frames[0].x);
  });
});

describe("coverCrop", () => {
  const FRAME = { width: 720, height: 960 };

  it("takes the whole photo when it is already the frame's shape", () => {
    expect(coverCrop({ width: 1200, height: 1600 }, FRAME)).toEqual({
      sx: 0,
      sy: 0,
      sw: 1200,
      sh: 1600,
    });
  });

  it("crops a landscape photo's sides evenly", () => {
    expect(coverCrop({ width: 1600, height: 1200 }, FRAME)).toEqual({
      sx: 350,
      sy: 0,
      sw: 900,
      sh: 1200,
    });
  });

  it("crops a tall photo's top and bottom evenly", () => {
    const crop = coverCrop({ width: 1000, height: 2000 }, FRAME);
    expect(crop.sx).toBe(0);
    expect(crop.sw).toBe(1000);
    expect(crop.sh).toBeCloseTo(4000 / 3);
    expect(crop.sy).toBeCloseTo(1000 / 3);
    expect(crop.sy * 2 + crop.sh).toBeCloseTo(2000);
  });

  it("fills the frame from a photo smaller than it", () => {
    expect(coverCrop({ width: 300, height: 300 }, FRAME)).toEqual({
      sx: 37.5,
      sy: 0,
      sw: 225,
      sh: 300,
    });
  });
});

describe("photoImage", () => {
  it("re-encodes one photo as a JPEG at its own size", async () => {
    const photo = photoOf(30, 40);

    const image = await photoImage(photo);

    expect(image.type).toBe("image/jpeg");
    expect(encoded).toEqual([
      { width: 30, height: 40, type: "image/jpeg", quality: 0.92 },
    ]);
    expect(drawn).toEqual([
      { op: "drawImage", args: [bitmaps.get(photo), 0, 0] },
    ]);
  });

  it("rejects when the canvas gives back no image", async () => {
    encodeEmpty = true;
    await expect(photoImage(photoOf(30, 40))).rejects.toThrow("Empty image");
  });
});

describe("comparisonImage", () => {
  const before = () => ({ image: photoOf(1200, 1600), date: "2026-03-01" });
  const after = () => ({ image: photoOf(1600, 1200), date: "2026-06-14" });

  it("draws before on the left and after on the right, each cropped to its frame", async () => {
    const b = before();
    const a = after();

    const image = await comparisonImage(b, a);

    expect(image.type).toBe("image/jpeg");
    expect(encoded).toEqual([
      {
        width: COMPARISON_LAYOUT.width,
        height: COMPARISON_LAYOUT.height,
        type: "image/jpeg",
        quality: 0.92,
      },
    ]);
    const images = drawn.filter((d) => d.op === "drawImage");
    expect(images.map((d) => d.args)).toEqual([
      [bitmaps.get(b.image), 0, 0, 1200, 1600, 32, 32, 720, 960],
      [bitmaps.get(a.image), 350, 0, 900, 1200, 768, 32, 720, 960],
    ]);
  });

  it("paints the app's background behind the photos first", async () => {
    await comparisonImage(before(), after());

    expect(drawn[0]).toEqual({
      op: "fillRect",
      args: [0, 0, COMPARISON_LAYOUT.width, COMPARISON_LAYOUT.height],
      fillStyle: THEME.bg,
    });
  });

  it("dates each photo beneath it, by the local day it names, and writes nothing else", async () => {
    await comparisonImage(before(), after());

    const [left, right] = COMPARISON_LAYOUT.frames;
    const text = drawn.filter((d) => d.op === "fillText");
    expect(text.map((d) => d.args)).toEqual([
      ["1 Mar 2026", left.x + left.width / 2, left.labelY],
      ["14 Jun 2026", right.x + right.width / 2, right.labelY],
    ]);
    for (const label of text) {
      expect(label).toMatchObject({
        fillStyle: THEME.textPrimary,
        font: FONT,
        textAlign: "center",
      });
    }
  });

  it("waits for the app's typeface before writing the dates", async () => {
    const requested: string[] = [];
    let drawnWhenLoaded = -1;
    setFonts(async (font) => {
      requested.push(font);
      await new Promise((resolve) => setTimeout(resolve, 0));
      drawnWhenLoaded = drawn.length;
      return [];
    });

    await comparisonImage(before(), after());

    expect(requested).toEqual([FONT]);
    // Only the background was down when the face arrived: no date yet.
    expect(drawn.slice(0, drawnWhenLoaded).map((d) => d.op)).toEqual([
      "fillRect",
    ]);
    expect(drawn.filter((d) => d.op === "fillText")).toHaveLength(2);
  });

  it("still dates both photos when the typeface cannot load, or there is no font API", async () => {
    setFonts(async () => {
      throw new Error("NetworkError");
    });
    await comparisonImage(before(), after());
    expect(drawn.filter((d) => d.op === "fillText")).toHaveLength(2);

    drawn = [];
    setFonts(undefined);
    await comparisonImage(before(), after());
    expect(drawn.filter((d) => d.op === "fillText")).toHaveLength(2);
  });

  it("rejects when the canvas gives back no image", async () => {
    encodeEmpty = true;
    await expect(comparisonImage(before(), after())).rejects.toThrow(
      "Empty image"
    );
  });
});

describe("canShareProgressImages", () => {
  it("is true wherever an image can be handed on", () => {
    for (const [native, shareSupported, expected] of [
      [true, true, true],
      [false, true, true],
      // The web can always download.
      [false, false, true],
      // The native app has no download to fall back on.
      [true, false, false],
    ] as const) {
      H.native = native;
      H.shareSupported = shareSupported;
      expect(canShareProgressImages()).toBe(expected);
    }
  });
});

describe("shareProgressImage", () => {
  const IMAGE = new Blob(["drawn"], { type: "image/jpeg" });
  const NAME = "tropos-progress-2026-06-14.jpg";
  let click: ReturnType<typeof vi.spyOn>;
  let clicked: { href: string; download: string; connected: boolean }[];
  let createUrl: ReturnType<typeof vi.spyOn>;
  let revoke: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clicked = [];
    createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:progress");
    revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({
          href: this.href,
          download: this.download,
          connected: this.isConnected,
        });
      });
  });

  it("hands the image to the share sheet as a named JPEG", async () => {
    const share = vi.fn(async (_data: { files: File[] }) => {});
    setShareSheet(() => true, share);

    expect(await shareProgressImage(IMAGE, NAME)).toBe("shared");

    const [file] = share.mock.calls[0][0].files;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe(NAME);
    expect(file.type).toBe("image/jpeg");
    expect(click).not.toHaveBeenCalled();
  });

  it("works the same in the native app", async () => {
    H.native = true;
    setShareSheet(
      () => true,
      async () => {}
    );
    expect(await shareProgressImage(IMAGE, NAME)).toBe("shared");
  });

  it("calls a dismissed share sheet cancelled, not a failure", async () => {
    setShareSheet(
      () => true,
      async () => {
        throw Object.assign(new Error("Share canceled"), {
          name: "AbortError",
        });
      }
    );

    expect(await shareProgressImage(IMAGE, NAME)).toBe("cancelled");
    expect(H.logError).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it("reports and logs a share that fails, and does not download instead", async () => {
    setShareSheet(
      () => true,
      async () => {
        throw Object.assign(new Error("Permission denied"), {
          name: "NotAllowedError",
        });
      }
    );

    expect(await shareProgressImage(IMAGE, NAME)).toBe("failed");
    expect(H.logError).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
  });

  it("downloads the image on the web when there is no share sheet for files", async () => {
    for (const canShare of [undefined, () => false]) {
      clicked = [];
      setShareSheet(canShare, vi.fn());

      expect(await shareProgressImage(IMAGE, NAME)).toBe("saved");

      expect(clicked).toEqual([
        { href: "blob:progress", download: NAME, connected: true },
      ]);
      expect(document.querySelector("a")).toBeNull();
    }
    const file = createUrl.mock.calls[0][0] as File;
    expect(file.name).toBe(NAME);
  });

  it("lets the download go before giving its URL back", async () => {
    setShareSheet(undefined, undefined);

    await shareProgressImage(IMAGE, NAME);
    expect(revoke).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revoke).toHaveBeenCalledWith("blob:progress");
  });

  it("fails in the native app without a share sheet, and never downloads", async () => {
    H.native = true;
    setShareSheet(() => false, vi.fn());

    expect(await shareProgressImage(IMAGE, NAME)).toBe("failed");
    expect(createUrl).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});
