/**
 * Sharing a progress photo: the image is built on the device and handed
 * to the phone's share sheet, where the user picks Photos, Messages,
 * Instagram and so on. Tropos uploads and posts nothing. On the web
 * without a share sheet the image downloads instead.
 *
 * A before-and-after puts two photos of one pose side by side, each with
 * its date beneath. It carries no weight: a number the user did not
 * choose to publish stays off the image.
 */
import { THEME } from "@/lib/theme";
import { logger } from "@/lib/logger";
import { isNativePlatform } from "@/lib/platform";
import { isPhotoShareSupported } from "@/lib/sharePhoto";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonthYear } from "@/utils/formatters";

interface Size {
  width: number;
  height: number;
}

interface Frame extends Size {
  x: number;
  y: number;
  /** Baseline of the date beneath the photo. */
  labelY: number;
}

/** Each photo's frame on a before-and-after image, 3:4 like the photos. */
export const COMPARISON_LAYOUT = (() => {
  const photo = { width: 720, height: 960 };
  const pad = 32;
  const gap = 16;
  const label = 80;
  const frame = (x: number): Frame => ({
    x,
    y: pad,
    ...photo,
    labelY: pad + photo.height + label / 2 + 12,
  });
  return {
    width: pad * 2 + photo.width * 2 + gap,
    height: pad * 2 + photo.height + label,
    fontPx: 34,
    frames: [frame(pad), frame(pad + photo.width + gap)] as const,
  };
})();

/** The part of an image to draw so it fills a frame, cropping the
 *  overflow evenly: CSS `object-fit: cover`. */
export function coverCrop(
  source: Size,
  frame: Size
): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(
    frame.width / source.width,
    frame.height / source.height
  );
  const sw = frame.width / scale;
  const sh = frame.height / scale;
  return {
    sx: (source.width - sw) / 2,
    sy: (source.height - sh) / 2,
    sw,
    sh,
  };
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Empty image"))),
      "image/jpeg",
      0.92
    )
  );
}

/** One photo as a JPEG, the format every share target accepts. */
export async function photoImage(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  return toJpeg(canvas);
}

/** Two photos of one pose side by side, each dated, as a JPEG. */
export async function comparisonImage(
  before: { image: Blob; date: string },
  after: { image: Blob; date: string }
): Promise<Blob> {
  const { width, height, fontPx, frames } = COMPARISON_LAYOUT;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, width, height);

  const font = `600 ${fontPx}px "Plus Jakarta Sans", system-ui, sans-serif`;
  // The app's own face, once loaded; the fallbacks otherwise.
  try {
    await document.fonts?.load(font);
  } catch {
    // Drawn in a fallback face.
  }
  ctx.font = font;
  ctx.fillStyle = THEME.textPrimary;
  ctx.textAlign = "center";

  for (const [side, frame] of [
    [before, frames[0]],
    [after, frames[1]],
  ] as const) {
    const bitmap = await createImageBitmap(side.image);
    const crop = coverCrop(bitmap, frame);
    ctx.drawImage(
      bitmap,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      frame.x,
      frame.y,
      frame.width,
      frame.height
    );
    ctx.fillText(
      formatDayMonthYear(parseLocalDate(side.date)),
      frame.x + frame.width / 2,
      frame.labelY
    );
  }
  return toJpeg(canvas);
}

/** Whether this device can hand an image on: a share sheet that takes
 *  files, or a browser download on the web. */
export function canShareProgressImages(): boolean {
  return isPhotoShareSupported() || !isNativePlatform();
}

export type ShareOutcome = "shared" | "saved" | "cancelled" | "failed";

/** Hand the image to the share sheet, or download it on the web. */
export async function shareProgressImage(
  image: Blob,
  fileName: string
): Promise<ShareOutcome> {
  const file = new File([image], fileName, { type: "image/jpeg" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      logger.error("[progressPhotoShare] share failed:", err);
      return "failed";
    }
  }
  // The native shell has no download to fall back on.
  if (isNativePlatform()) return "failed";
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return "saved";
}
