/** A WebP's native canvas, read from its header without decoding it. */
export function webpSize(data: Buffer): [number, number] {
  if (
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 12) !== "WEBP"
  )
    throw new Error("Not a WebP image");
  for (let offset = 12; offset + 8 <= data.length; ) {
    const kind = data.toString("ascii", offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > data.length) throw new Error("Truncated WebP");
    if (kind === "VP8X" && size >= 10)
      return [
        1 + data.readUIntLE(start + 4, 3),
        1 + data.readUIntLE(start + 7, 3),
      ];
    if (kind === "VP8 " && size >= 10)
      return [
        data.readUInt16LE(start + 6) & 16383,
        data.readUInt16LE(start + 8) & 16383,
      ];
    if (kind === "VP8L" && size >= 5) {
      const bits = data.readUInt32LE(start + 1);
      return [(bits & 16383) + 1, ((bits >>> 14) & 16383) + 1];
    }
    offset = start + size + (size % 2);
  }
  throw new Error("WebP dimensions missing");
}
