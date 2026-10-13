/**
 * The app's side of photo screening (Ship1): a photo the server passes
 * may be used, one it refuses rejects with the reason, and one it could
 * not check rejects as a failed upload.
 */
import { describe, expect, it, vi } from "vitest";

const call = vi.hoisted(() => vi.fn());
vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) => {
    expect(name).toBe("screenPhoto");
    return call;
  },
}));
vi.mock("../firebase", () => ({ functions: {} }));

import {
  PHOTO_REFUSED_MESSAGE,
  PhotoRefusedError,
  screenUploadedPhoto,
} from "../photoScreen";

describe("screenUploadedPhoto", () => {
  it("resolves for a photo the screening passes", async () => {
    call.mockResolvedValueOnce({ data: { ok: true } });
    await expect(
      screenUploadedPhoto("space-photos/u1/1.jpg")
    ).resolves.toBeUndefined();
    expect(call).toHaveBeenCalledWith({ path: "space-photos/u1/1.jpg" });
  });

  it("rejects a refused photo with the reason the app shows", async () => {
    call.mockResolvedValueOnce({ data: { ok: false } });
    const refusal = screenUploadedPhoto("profile-photos/u1/a.jpg");
    await expect(refusal).rejects.toBeInstanceOf(PhotoRefusedError);
    await expect(refusal).rejects.toThrow(PHOTO_REFUSED_MESSAGE);
  });

  it("passes on a photo it could not check as a failure, not a refusal", async () => {
    const unavailable = Object.assign(new Error("Couldn't check"), {
      code: "functions/unavailable",
    });
    call.mockRejectedValueOnce(unavailable);
    await expect(screenUploadedPhoto("space-photos/u1/2.jpg")).rejects.toBe(
      unavailable
    );
  });
});
