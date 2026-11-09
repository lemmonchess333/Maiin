// @vitest-environment jsdom
/**
 * `encodeJpeg`, the one path a picked photo takes before it is uploaded
 * (a Space post's, a shared session's).
 *
 * What it promises: the photo is drawn onto a canvas no larger than
 * `maxEdge` on its longest side and the canvas is encoded as a JPEG at the
 * quality asked for. What is uploaded is always the canvas's output, never
 * the file that was picked, which is what keeps a photo's EXIF (its
 * location among it) on the phone. jsdom has no canvas, so the decode and
 * the canvas are stubbed at their DOM boundary; the backlog row checks a
 * downloaded photo for EXIF on a device.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blobToDataUrl, encodeJpeg } from "../imageEncode";

const H = vi.hoisted(() => ({
  natural: { w: 4032, h: 3024 },
  decodeFails: false,
  drawn: null as null | { w: number; h: number },
  toBlob: null as null | { type: string; quality: number },
}));

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(_url: string) {
    queueMicrotask(() => {
      if (H.decodeFails) return this.onerror?.();
      this.naturalWidth = H.natural.w;
      this.naturalHeight = H.natural.h;
      this.onload?.();
    });
  }
}

const output = new Blob([new Uint8Array(1234)], { type: "image/jpeg" });
const picked = new File([new Uint8Array(99)], "IMG_0001.HEIC", {
  type: "image/heic",
});

let createElement: typeof document.createElement;

beforeEach(() => {
  H.natural = { w: 4032, h: 3024 };
  H.decodeFails = false;
  H.drawn = null;
  H.toBlob = null;
  vi.stubGlobal("Image", FakeImage);
  URL.createObjectURL = vi.fn(() => "blob:picked");
  URL.revokeObjectURL = vi.fn();
  createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas") return createElement(tag);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (
          _img: unknown,
          _x: number,
          _y: number,
          w: number,
          h: number
        ) => {
          H.drawn = { w, h };
        },
      }),
      toBlob: (cb: (b: Blob | null) => void, type: string, quality: number) => {
        H.toBlob = { type, quality };
        cb(output);
      },
    };
    return canvas as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("encodeJpeg", () => {
  it("draws the photo no longer than maxEdge and encodes the canvas as a JPEG", async () => {
    const result = await encodeJpeg(picked, { maxEdge: 1600, quality: 0.82 });
    expect(H.drawn).toEqual({ w: 1600, h: 1200 });
    expect(H.toBlob).toEqual({ type: "image/jpeg", quality: 0.82 });
    expect(result).toEqual({ blob: output, width: 1600, height: 1200 });
    // What goes up is the canvas's output, never the file picked.
    expect(result.blob).not.toBe(picked);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picked");
  });

  it("keeps a portrait photo's shape, and never scales a small one up", async () => {
    H.natural = { w: 3024, h: 4032 };
    expect(
      await encodeJpeg(picked, { maxEdge: 1600, quality: 0.82 })
    ).toMatchObject({ width: 1200, height: 1600 });
    H.natural = { w: 800, h: 600 };
    expect(
      await encodeJpeg(picked, { maxEdge: 1600, quality: 0.82 })
    ).toMatchObject({ width: 800, height: 600 });
  });

  it("rejects a photo it cannot decode, and lets go of it", async () => {
    H.decodeFails = true;
    await expect(
      encodeJpeg(picked, { maxEdge: 1600, quality: 0.82 })
    ).rejects.toThrow("photo decode failed");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picked");
  });
});

describe("blobToDataUrl", () => {
  it("reads the encoded JPEG as the data URL a preview and a request body take", async () => {
    const blob = new Blob(["hi"], { type: "image/jpeg" });
    expect(await blobToDataUrl(blob)).toBe("data:image/jpeg;base64,aGk=");
  });
});
