import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { preparedCutoutPath } from "./prepared-cutout";

const directories: string[] = [];
const hash = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
afterEach(() =>
  directories
    .splice(0)
    .forEach((directory) => rmSync(directory, { recursive: true }))
);

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "tropos-cutout-"));
  directories.push(directory);
  const source = Buffer.from("released reference bytes");
  const image = Buffer.from(
    "prepared image bytes; decoding is checked by the exporter"
  );
  writeFileSync(join(directory, "leg-raise.png"), image);
  const record = {
    reviewStatus: "reviewed",
    reference: "form-frames/leg-raise/3.webp",
    referenceSha256: hash(source),
    image: "leg-raise.png",
    imageSha256: hash(image),
  };
  const save = () =>
    writeFileSync(join(directory, "leg-raise.json"), JSON.stringify(record));
  save();
  const read = (bytes = source) =>
    preparedCutoutPath(directory, "leg-raise", record.reference, bytes);
  return { directory, record, save, read };
}

describe("prepared card artwork", () => {
  it("uses the reviewed image and keeps the normal path for exercises without one", () => {
    const { directory, read } = fixture();
    expect(read()).toBe(join(directory, "leg-raise.png"));
    expect(
      preparedCutoutPath(directory, "other", "other.webp", Buffer.from("other"))
    ).toBeNull();
  });
  it("rejects stale reference bytes instead of silently publishing the old thumbnail", () => {
    const { read } = fixture();
    expect(() => read(Buffer.from("replaced pose"))).toThrow(
      "reference changed"
    );
  });
  it("rejects changes to the reviewed image", () => {
    const { directory, read } = fixture();
    writeFileSync(join(directory, "leg-raise.png"), "unreviewed edit");
    expect(() => read()).toThrow("image changed");
  });
  it("requires review and an exercise-local source", () => {
    const { record, save, read } = fixture();
    record.reviewStatus = "pending";
    save();
    expect(() => read()).toThrow("has not passed review");
    record.reviewStatus = "reviewed";
    record.image = "../different.png";
    save();
    expect(() => read()).toThrow("must name its exercise PNG");
  });
});
