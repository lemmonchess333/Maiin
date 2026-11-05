// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  auth: { currentUser: { uid: "reader" } as { uid: string } | null },
  call: vi.fn(),
}));
vi.mock("../firebase", () => ({ auth: H.auth, functions: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_: unknown, name: string) => (data: unknown) =>
    H.call(name, data),
}));
import {
  activityMediaKey,
  readActivityMediaUrl,
} from "../activityMedia";

const url = (path = "post-photos/author/post-1/Photo0001.jpg") =>
  `https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/${encodeURIComponent(path)}`;

beforeEach(() => {
  H.auth.currentUser = { uid: "reader" };
  H.call.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:private-image");
});

describe("activity media identity", () => {
  it("reads legacy and tokenless identities without passing their token", () => {
    for (const suffix of ["", "?alt=media&token=secret", "#fragment"])
      expect(activityMediaKey(url() + suffix)).toEqual({
        activityId: "post-1",
        kind: "photo",
        id: "Photo0001",
      });
    expect(activityMediaKey(url("route-maps/author/run-1/dark.jpg"))).toEqual({
      activityId: "run-1",
      kind: "map",
      id: "dark",
    });
  });
  it.each([
    "https://evil.example/image.jpg",
    "data:image/jpeg;base64,/9j/2Q==",
    "blob:old-image",
    url().replace("adaptive-fitness-af8bb", "other-project"),
    url("post-photos/author/post-1/short.jpg"),
    url("post-photos/author/post-1/Photo0001.jpg/extra"),
    url("post-photos/author/../Photo0001.jpg"),
    url("route-maps/author/post-1/secret.jpg"),
    url().replace("https://", "http://"),
    url().replace("https://", "https://user:password@"),
    url().replace("%2Fauthor", "%2author"),
  ])("rejects unexpected identity %s", (value) =>
    expect(activityMediaKey(value)).toBeNull()
  );
});

describe("authenticated media reads", () => {
  it("returns a memory-only URL, never reads the bearer URL", async () => {
    H.call.mockResolvedValue({
      data: { base64: "/9j/2Q==", contentType: "image/jpeg" },
    });
    expect(await readActivityMediaUrl(url() + "?token=secret")).toBe(
      "blob:private-image"
    );
    expect(H.call).toHaveBeenCalledWith("readActivityMedia", {
      activityId: "post-1",
      kind: "photo",
      id: "Photo0001",
    });
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });
  it("uses a report-scoped request for moderation, never a caller-selected activity", async () => {
    H.call.mockResolvedValue({
      data: { base64: "/9j/2Q==", contentType: "image/jpeg" },
    });
    await readActivityMediaUrl(url(), "report-1");
    expect(H.call).toHaveBeenCalledWith("readReportedActivityMedia", {
      reportId: "report-1",
      id: "Photo0001",
    });
  });
  it("fails closed when denied, without returning the original URL", async () => {
    H.call.mockRejectedValue(new Error("permission-denied"));
    await expect(readActivityMediaUrl(url())).rejects.toThrow();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("does not fetch without a signed-in user", async () => {
    H.auth.currentUser = null;
    await expect(readActivityMediaUrl(url())).rejects.toThrow();
    expect(H.call).not.toHaveBeenCalled();
  });
  it("discards a response if the user changed while it was in flight", async () => {
    H.call.mockImplementation(async () => {
      H.auth.currentUser = { uid: "other" };
      return { data: { base64: "/9j/2Q==", contentType: "image/jpeg" } };
    });
    await expect(readActivityMediaUrl(url())).rejects.toThrow();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it.each([
    { base64: "bad!", contentType: "image/jpeg" },
    { base64: "/9j/2Q==", contentType: "text/html" },
  ])("rejects a malformed response", async (data) => {
    H.call.mockResolvedValue({ data });
    await expect(readActivityMediaUrl(url())).rejects.toThrow();
  });
});
