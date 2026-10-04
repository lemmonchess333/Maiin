// @vitest-environment jsdom — the web download needs a document.
/**
 * shareFile: the share sheet where there is one, a download on the web,
 * and on the native app never a download. WKWebView drops a blob
 * `<a download>` without a word, which is how exports on iPhone said
 * "exported" while nothing was saved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const platform = vi.hoisted(() => ({ native: false }));
vi.mock("@/lib/platform", () => ({
  isNativePlatform: () => platform.native,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

import { canShareFile, shareFile } from "../shareFile";
import { shareImageFile } from "../shareCardGenerator";

const FILE = new File(["Date,Exercise\n"], "tropos-workouts-2026-10-04.csv", {
  type: "text/csv",
});

function failure(name: string) {
  return Object.assign(new Error(name), { name });
}

let share: ReturnType<typeof vi.fn>;
let canShare: ReturnType<typeof vi.fn>;
let click: ReturnType<typeof vi.spyOn>;
let createUrl: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  platform.native = false;
  share = vi.fn().mockResolvedValue(undefined);
  canShare = vi.fn().mockReturnValue(true);
  Object.defineProperty(navigator, "share", {
    value: share,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "canShare", {
    value: canShare,
    configurable: true,
    writable: true,
  });
  createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shareFile — the share sheet", () => {
  it("hands the file to the share sheet when it takes files", async () => {
    expect(await shareFile(FILE, { title: "Workouts" })).toBe("shared");
    expect(canShare).toHaveBeenCalledWith({ files: [FILE] });
    expect(share).toHaveBeenCalledWith({ files: [FILE], title: "Workouts" });
    expect(click).not.toHaveBeenCalled();
  });

  it("works the same in the native app", async () => {
    platform.native = true;
    expect(await shareFile(FILE)).toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [FILE] });
  });

  it("reports a dismissed sheet as cancelled, on both", async () => {
    share.mockRejectedValue(failure("AbortError"));
    expect(await shareFile(FILE)).toBe("cancelled");
    platform.native = true;
    expect(await shareFile(FILE)).toBe("cancelled");
    expect(share).toHaveBeenCalledTimes(2);
    expect(click).not.toHaveBeenCalled();
  });
});

describe("shareFile — on the native app there is no download", () => {
  beforeEach(() => {
    platform.native = true;
  });

  it("fails, rather than claim a download, when the sheet takes no files", async () => {
    canShare.mockReturnValue(false);
    expect(await shareFile(FILE)).toBe("failed");
    expect(canShare).toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it("reports a sheet refused for want of a fresh tap as blocked", async () => {
    share.mockRejectedValue(failure("NotAllowedError"));
    expect(await shareFile(FILE)).toBe("blocked");
    expect(share).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });

  it("fails when the sheet fails any other way", async () => {
    share.mockRejectedValue(new TypeError("not allowed type"));
    expect(await shareFile(FILE)).toBe("failed");
    expect(share).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });
});

describe("shareFile — the web downloads when it cannot share", () => {
  it("downloads under the file's own name when the sheet takes no files", async () => {
    canShare.mockReturnValue(false);
    expect(await shareFile(FILE)).toBe("downloaded");
    expect(createUrl).toHaveBeenCalledWith(FILE);
    expect(click).toHaveBeenCalledOnce();
    const link = click.mock.contexts[0] as unknown as HTMLAnchorElement;
    expect(link.download).toBe("tropos-workouts-2026-10-04.csv");
    expect(link.href).toBe("blob:export");
  });

  it("downloads when the sheet fails, including for want of a fresh tap", async () => {
    share.mockRejectedValueOnce(failure("NotAllowedError"));
    expect(await shareFile(FILE)).toBe("downloaded");
    share.mockRejectedValueOnce(new TypeError("unsupported"));
    expect(await shareFile(FILE)).toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("downloads where there is no Web Share at all", async () => {
    Object.defineProperty(navigator, "share", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(canShareFile(FILE)).toBe(false);
    expect(await shareFile(FILE)).toBe("downloaded");
    expect(click).toHaveBeenCalledOnce();
  });

  it("treats a canShare that throws as no share sheet", async () => {
    canShare.mockImplementation(() => {
      throw new TypeError("bad files");
    });
    expect(canShareFile(FILE)).toBe(false);
    expect(await shareFile(FILE)).toBe("downloaded");
  });
});

describe("shareImageFile — the share card on the same path", () => {
  const card = new File(["png"], "tropos-story.png", { type: "image/png" });

  it("shares the card with its text", async () => {
    expect(await shareImageFile(card, "My run on Tropos")).toBe("shared");
    expect(share).toHaveBeenCalledWith({
      files: [card],
      text: "My run on Tropos",
    });
  });

  it("fails on the native app instead of claiming a download", async () => {
    platform.native = true;
    canShare.mockReturnValue(false);
    expect(await shareImageFile(card, "My run on Tropos")).toBe("failed");
    expect(click).not.toHaveBeenCalled();
  });

  it("calls a sheet refused for want of a fresh tap a failure", async () => {
    platform.native = true;
    share.mockRejectedValue(failure("NotAllowedError"));
    expect(await shareImageFile(card, "My run on Tropos")).toBe("failed");
    expect(share).toHaveBeenCalledOnce();
  });
});
