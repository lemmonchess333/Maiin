/**
 * The photo detail's cap on both sides: the field stops where the server
 * starts refusing, so nothing a person can type is turned away, and the
 * server keeps its own check for a request the app did not make.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { FOOD_PHOTO_DETAIL_MAX, tidyFoodPhotoDetail } from "../foodPhotoDetail";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/foodPhotoDetail.js") as {
  FOOD_DETAIL_MAX_CHARS: number;
  readFoodDetail: (raw: unknown) => { detail?: string | null; error?: string };
};

describe("photo detail — client and server", () => {
  it("share one cap", () => {
    expect(FOOD_PHOTO_DETAIL_MAX).toBe(server.FOOD_DETAIL_MAX_CHARS);
  });

  it("the server takes every detail the field can send", () => {
    const longest = tidyFoodPhotoDetail(
      "  cooked   in butter ".padEnd(FOOD_PHOTO_DETAIL_MAX * 2, "x")
    );
    expect(longest).toHaveLength(FOOD_PHOTO_DETAIL_MAX);
    expect(server.readFoodDetail(longest)).toEqual({ detail: longest });
    expect(tidyFoodPhotoDetail("   ")).toBeNull();
  });
});
