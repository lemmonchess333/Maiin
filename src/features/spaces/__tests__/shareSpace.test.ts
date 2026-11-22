/**
 * Sharing a Space (Run27 call 11): the Space's link through the share
 * sheet, and copied where there is none.
 *
 * On the iPhone the share sheet is the Web Share API inside the Capacitor
 * WKWebView, which opens iOS's own sheet (src/lib/shareFile.ts says the
 * same of every share in Tropos), so "native" here is `navigator.share`
 * present, as WKWebView has it, and "web" is a desktop browser without it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shareSpace, spaceSharePayload } from "../shareSpace";

const BRIGHTON = { id: "brighton-marathon", name: "Brighton Marathon" };
const LINK = "https://troposfit.com/space/brighton-marathon";

const share = vi.fn();
const writeText = vi.fn();

function withShareSheet(present: boolean) {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: present ? share : undefined,
  });
}

beforeEach(() => {
  share.mockReset().mockResolvedValue(undefined);
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  withShareSheet(false);
});

describe("the link", () => {
  it("is the Space's own address on troposfit.com, which opens it", () => {
    expect(spaceSharePayload(BRIGHTON)).toEqual({
      title: "Brighton Marathon",
      text: "Join me in Brighton Marathon on Tropos",
      url: LINK,
    });
  });
});

describe("on the iPhone (the share sheet)", () => {
  beforeEach(() => withShareSheet(true));

  it("hands the link to the share sheet and copies nothing", async () => {
    await expect(shareSpace(BRIGHTON)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(spaceSharePayload(BRIGHTON));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("says nothing when the person closes the sheet", async () => {
    share.mockRejectedValue(
      Object.assign(new Error("cancelled"), { name: "AbortError" })
    );
    await expect(shareSpace(BRIGHTON)).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the link when the sheet refuses to open", async () => {
    share.mockRejectedValue(
      Object.assign(new Error("no gesture"), { name: "NotAllowedError" })
    );
    await expect(shareSpace(BRIGHTON)).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(LINK);
  });
});

describe("on the web (no share sheet)", () => {
  beforeEach(() => withShareSheet(false));

  it("copies the link", async () => {
    await expect(shareSpace(BRIGHTON)).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it("fails when the clipboard refuses too", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    await expect(shareSpace(BRIGHTON)).resolves.toBe("failed");
  });
});
