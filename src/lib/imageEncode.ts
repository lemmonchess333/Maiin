/**
 * A picked photo, made small enough to upload: decoded through an <img>,
 * drawn onto a canvas no larger than `maxEdge` on its longest side, and
 * encoded as a JPEG.
 *
 * One path for every photo the app uploads from the picker (a Space post's,
 * a shared session's). An <img> rather than createImageBitmap, because
 * WKWebView decodes what the photo library hands over (HEIC included) that
 * way, and applies the photo's orientation as it draws.
 *
 * Re-encoding through the canvas keeps the pixels and nothing else: the
 * file's EXIF block, the place the photo was taken included, the camera
 * and the time, is not carried into the JPEG the canvas writes. That is
 * the privacy guarantee a photo other people see rests on, so no photo is
 * ever uploaded as the file that was picked.
 */

export interface EncodedImage {
  blob: Blob;
  /** The encoded image's size in pixels. */
  width: number;
  height: number;
}

/** Decode `file`, downscale it to `maxEdge` and encode it as a JPEG at
 *  `quality`. Rejects when the photo cannot be decoded or encoded. */
export async function encodeJpeg(
  file: Blob,
  { maxEdge, quality }: { maxEdge: number; quality: number }
): Promise<EncodedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("photo decode failed"));
      img.src = objectUrl;
    });

    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (!longest) throw new Error("photo has no dimensions");
    const scale = Math.min(1, maxEdge / longest);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (out) =>
          out ? resolve(out) : reject(new Error("photo encode failed")),
        "image/jpeg",
        quality
      );
    });
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
