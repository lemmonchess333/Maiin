/**
 * ProgressPhotos — the section on Analytics' Body page.
 *
 * Pins, in the order a user meets them:
 *   - the private-only contract: no public/private control anywhere, and
 *     the privacy line says what the encryption does and no more (Soc9);
 *   - one way to add photos, each saved on a day and pose, encrypted
 *     before upload, never as a plain image;
 *   - older photos keep the pose their check-in gave them;
 *   - a photo can be deleted (after a confirm), replaced, or moved to
 *     another day, and a move never puts two photos of one pose on a day;
 *   - Compare opens on the first day and the latest;
 *   - sharing hands a JPEG to the share sheet, or downloads it on the
 *     web, and posts nothing;
 *   - an account switch never shows one account's photos under another.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
  within,
} from "@testing-library/react";
import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deleteObject, uploadBytes } from "firebase/storage";
import { decryptProgressPhoto } from "@/lib/progressPhotoCrypto";

let currentUid: string | null = "u-self";
vi.mock("@/lib/auth", () => ({
  useUid: () => currentUid,
}));
vi.mock("@/lib/firebase", () => ({ db: {}, storage: {} }));
vi.mock("firebase/firestore");
vi.mock("firebase/storage", () => ({
  ref: vi.fn((_storage: unknown, path: string) => ({ fullPath: path })),
  uploadBytes: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
  getDownloadURL: vi.fn(async () => "https://example.invalid/blob"),
}));
vi.mock("@/lib/historyAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/* Opening a stored photo downloads and decrypts it; the decrypt path is
   pinned by the upload round trip below and in progressPhotoCrypto's own
   suite, so here it answers with a small image. */
vi.mock("@/lib/progressPhotos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/progressPhotos")>()),
  readProgressPhoto: vi.fn(
    async () => new Blob(["stored image"], { type: "image/webp" })
  ),
}));

import ProgressPhotos from "../ProgressPhotos";
import { track } from "@/lib/historyAnalytics";
import { toast } from "@/lib/toast";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  allPaths,
  deferReads,
  pendingReads,
  releaseRead,
} from "@/test/firestoreHarness";
import { localDateString } from "@/lib/dateHelpers";

const PHOTOS = "users/u-self/progressPhotos";

function photoDoc(date: string, extra: Record<string, unknown> = {}) {
  return {
    storagePath: `progress-photos/u-self/${date}-${String(extra.pose ?? "x")}.enc`,
    iv: [1, 2, 3],
    date,
    visibility: "private",
    createdAt: 1,
    ...extra,
  };
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

function stubImages() {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 30, height: 40 }))
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback, type) =>
      callback(new Blob(["drawn image"], { type: type ?? "image/png" }))
  );
}

async function openDay(label: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name: label }));
  return screen.findByRole("dialog");
}

function pickFile(dialog: HTMLElement, buttonName: string) {
  fireEvent.click(within(dialog).getByRole("button", { name: buttonName }));
  fireEvent.change(
    document.querySelector('input[type="file"]') as HTMLInputElement,
    {
      target: {
        files: [new File(["source"], "photo.jpg", { type: "image/jpeg" })],
      },
    }
  );
}

beforeEach(() => {
  currentUid = "u-self";
  resetFirestore();
  setOnline(true);
  URL.createObjectURL = vi.fn(() => "blob:progress-photo");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  resetFirestore();
  setOnline(true);
});

describe("private-only contract", () => {
  it("offers no public/private control, and says what the encryption does", async () => {
    render(<ProgressPhotos />);
    expect(await screen.findByText("No photos yet")).toBeInTheDocument();
    expect(screen.getByText(/private to your account/i)).toBeInTheDocument();
    // Soc9: Tropos can read both stores, so the honest claim is "never
    // shown to other users", never "only you can view".
    expect(screen.getByText(/never shown to other users/i)).toBeInTheDocument();
    expect(screen.queryByText(/only you can/i)).toBeNull();
    expect(screen.queryByText(/make photos public/i)).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("still offers no control once there are photos", async () => {
    seedFirestore({
      [`${PHOTOS}/p1`]: photoDoc("2026-07-01", { pose: "front" }),
      [`${PHOTOS}/p2`]: photoDoc("2026-07-08", { pose: "front" }),
    });
    render(<ProgressPhotos />);
    // Anchored on the rows themselves: the privacy line renders empty
    // or not, so it proves nothing about the photos having loaded.
    await screen.findByRole("button", { name: /1 Jul 2026/ });
    expect(screen.getByRole("button", { name: /8 Jul 2026/ })).toBeTruthy();
    expect(screen.queryByText(/make photos public/i)).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("writes every photo as private and never as public (source pin)", () => {
    const source = readFileSync(
      resolve(__dirname, "../../../lib/progressPhotos.ts"),
      "utf8"
    );
    expect(source).toMatch(/visibility:\s*"private"/);
    expect(source).not.toMatch(/visibility:\s*"public"/);
    expect(source).not.toMatch(/\?\s*"private"\s*:\s*"public"/);
    expect(source).not.toMatch(/\?\s*"public"\s*:\s*"private"/);
    // Fail-closed: no path uploads the plain image.
    expect(source).not.toMatch(/Falling back to unencrypted/i);
    expect(source).not.toMatch(/zero IV indicates unencrypted/i);
  });
});

describe("adding photos", () => {
  it("an empty section offers one Add photos, and a list offers it once too", async () => {
    const { unmount } = render(<ProgressPhotos />);
    await screen.findByText("No photos yet");
    expect(screen.getAllByRole("button", { name: /add photos/i })).toHaveLength(
      1
    );
    unmount();

    seedFirestore({
      [`${PHOTOS}/p1`]: photoDoc("2026-07-01", { pose: "front" }),
    });
    render(<ProgressPhotos />);
    await screen.findByRole("button", { name: /1 Jul 2026/ });
    expect(screen.queryByText("No photos yet")).toBeNull();
    expect(screen.getAllByRole("button", { name: /add photos/i })).toHaveLength(
      1
    );
  });

  it("encrypts before upload and saves the day and pose with the random key", async () => {
    stubImages();
    render(<ProgressPhotos />);
    fireEvent.click(await screen.findByRole("button", { name: "Add photos" }));
    const dialog = await screen.findByRole("dialog");
    pickFile(dialog, "Add side photo");

    await waitFor(() => expect(uploadBytes).toHaveBeenCalledOnce());
    const [fileRef, encrypted, options] = vi.mocked(uploadBytes).mock.calls[0];
    expect(options).toEqual({ contentType: "image/webp" });
    const path = (fileRef as unknown as { fullPath: string }).fullPath;
    expect(path).toMatch(/^progress-photos\/u-self\/.+\.enc$/);

    await waitFor(() =>
      expect(track).toHaveBeenCalledWith("history_progress_photo_added", {
        pose: "side",
      })
    );
    const stored = allPaths().filter((p) => p.startsWith(`${PHOTOS}/`));
    expect(stored).toHaveLength(1);
    const metadata = readDoc(stored[0])!;
    expect(metadata).toMatchObject({
      date: localDateString(),
      pose: "side",
      visibility: "private",
      encryptionVersion: 2,
      storagePath: path,
    });
    expect(metadata.encryptionKey).toHaveLength(32);
    const restored = await decryptProgressPhoto(
      (encrypted as Uint8Array).buffer as ArrayBuffer,
      "u-self",
      metadata as never
    );
    expect(new TextDecoder().decode(restored)).toBe("drawn image");
  });

  it("uploads nothing when the key cannot be made", async () => {
    stubImages();
    vi.spyOn(webcrypto.subtle, "generateKey").mockRejectedValueOnce(
      new Error("Crypto unavailable")
    );
    render(<ProgressPhotos />);
    fireEvent.click(await screen.findByRole("button", { name: "Add photos" }));
    pickFile(await screen.findByRole("dialog"), "Add front photo");
    expect(
      await screen.findByText(/Couldn't encrypt the photo/)
    ).toBeInTheDocument();
    expect(uploadBytes).not.toHaveBeenCalled();
  });

  it("says a connection is needed instead of starting an upload offline", async () => {
    stubImages();
    setOnline(false);
    render(<ProgressPhotos />);
    fireEvent.click(await screen.findByRole("button", { name: "Add photos" }));
    pickFile(await screen.findByRole("dialog"), "Add front photo");
    expect(
      await screen.findByText("Adding a photo needs a connection.")
    ).toBeInTheDocument();
    expect(uploadBytes).not.toHaveBeenCalled();
  });
});

describe("older photos", () => {
  it("keep the pose their check-in gave them", async () => {
    seedFirestore({
      [`${PHOTOS}/old`]: photoDoc("2026-06-01"),
      "users/u-self/progressCheckins/c1": {
        date: "2026-06-01",
        note: "A private note",
        photoIds: { side: "old" },
      },
    });
    render(<ProgressPhotos />);
    expect(
      await screen.findByRole("button", { name: "1 Jun 2026, side" })
    ).toBeInTheDocument();
    // Notes are no longer shown anywhere.
    expect(screen.queryByText("A private note")).toBeNull();
  });
});

describe("deleting, replacing and moving", () => {
  beforeEach(() => {
    seedFirestore({
      [`${PHOTOS}/front`]: photoDoc("2026-07-01", { pose: "front" }),
    });
  });

  it("deletes the file and the document, after a confirm", async () => {
    render(<ProgressPhotos />);
    const dialog = await openDay(/1 Jul 2026/);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete front photo" })
    );
    // Nothing goes until the confirm.
    expect(deleteObject).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(readDoc(`${PHOTOS}/front`)).toBeUndefined());
    expect(vi.mocked(deleteObject).mock.calls[0][0]).toEqual({
      fullPath: "progress-photos/u-self/2026-07-01-front.enc",
    });
    expect(track).toHaveBeenCalledWith("history_progress_photo_deleted", {
      pose: "front",
    });
  });

  it("Keep leaves the photo alone", async () => {
    render(<ProgressPhotos />);
    const dialog = await openDay(/1 Jul 2026/);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete front photo" })
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep" }));
    expect(within(dialog).queryByText(/can't be recovered/)).toBeNull();
    expect(deleteObject).not.toHaveBeenCalled();
    expect(readDoc(`${PHOTOS}/front`)).toBeDefined();
  });

  it("refuses to delete offline, and says why", async () => {
    render(<ProgressPhotos />);
    const dialog = await openDay(/1 Jul 2026/);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete front photo" })
    );
    setOnline(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(
      await within(dialog).findByText("Deleting a photo needs a connection.")
    ).toBeInTheDocument();
    expect(deleteObject).not.toHaveBeenCalled();
    expect(readDoc(`${PHOTOS}/front`)).toBeDefined();
  });

  it("replacing a photo deletes the one it replaces", async () => {
    stubImages();
    render(<ProgressPhotos />);
    const dialog = await openDay(/1 Jul 2026/);
    pickFile(dialog, "Replace front photo");
    await waitFor(() => expect(readDoc(`${PHOTOS}/front`)).toBeUndefined());
    expect(vi.mocked(deleteObject).mock.calls[0][0]).toEqual({
      fullPath: "progress-photos/u-self/2026-07-01-front.enc",
    });
    const left = allPaths().filter((p) => p.startsWith(`${PHOTOS}/`));
    expect(left).toHaveLength(1);
    expect(readDoc(left[0])).toMatchObject({
      date: "2026-07-01",
      pose: "front",
    });
  });

  it("moves a day's photos to another day", async () => {
    render(<ProgressPhotos />);
    const dialog = await openDay(/1 Jul 2026/);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Change date" })
    );
    fireEvent.change(within(dialog).getByLabelText("Date taken"), {
      target: { value: "2026-06-24" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Move photos" })
    );
    await waitFor(() =>
      expect(readDoc(`${PHOTOS}/front`)).toMatchObject({
        date: "2026-06-24",
        pose: "front",
      })
    );
  });

  it("will not move onto a day that already has that pose", async () => {
    seedFirestore({
      [`${PHOTOS}/other`]: photoDoc("2026-06-24", { pose: "front" }),
    });
    render(<ProgressPhotos />);
    const dialog = await openDay(/1 Jul 2026/);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Change date" })
    );
    fireEvent.change(within(dialog).getByLabelText("Date taken"), {
      target: { value: "2026-06-24" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Move photos" })
    );
    expect(
      await within(dialog).findByText(
        "24 Jun 2026 already has a front photo. Delete one of them first."
      )
    ).toBeInTheDocument();
    expect(readDoc(`${PHOTOS}/front`)).toMatchObject({ date: "2026-07-01" });
  });
});

describe("Compare", () => {
  beforeEach(() => {
    seedFirestore({
      [`${PHOTOS}/a`]: photoDoc("2026-06-01", { pose: "front" }),
      [`${PHOTOS}/b`]: photoDoc("2026-07-01", { pose: "back" }),
      [`${PHOTOS}/c`]: photoDoc("2026-08-01", { pose: "front" }),
    });
  });

  it("opens on the first day and the latest, pose against pose", async () => {
    render(<ProgressPhotos />);
    fireEvent.click(await screen.findByRole("button", { name: "Compare" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Before")).toHaveValue("2026-06-01");
    expect(within(dialog).getByLabelText("After")).toHaveValue("2026-08-01");
    expect(
      [...dialog.querySelectorAll("figcaption")].map((f) => f.textContent)
    ).toEqual(["1 Jun 2026", "1 Aug 2026"]);
    expect(track).toHaveBeenCalledWith("history_progress_photos_compared");
  });

  it("says so when two days share no pose", async () => {
    render(<ProgressPhotos />);
    fireEvent.click(await screen.findByRole("button", { name: "Compare" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("After"), {
      target: { value: "2026-07-01" },
    });
    expect(
      within(dialog).getByText("These two days have no pose in common.")
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Share before and after" })
    ).toBeNull();
  });

  it("shares a before-and-after through the share sheet, and posts nothing", async () => {
    stubImages();
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      onLine: true,
      canShare: () => true,
      share,
    });
    render(<ProgressPhotos />);
    fireEvent.click(await screen.findByRole("button", { name: "Compare" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Share before and after" })
    );
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    const [{ files }] = share.mock.calls[0] as unknown as [{ files: File[] }];
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe("image/jpeg");
    expect(files[0].name).toBe("tropos-progress-2026-06-01-to-2026-08-01.jpg");
    expect(track).toHaveBeenCalledWith("history_progress_photo_shared", {
      shareKind: "compare",
      shareVia: "share_sheet",
    });
    expect(uploadBytes).not.toHaveBeenCalled();
  });

  it("downloads the image on the web without a share sheet", async () => {
    stubImages();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<ProgressPhotos />);
    const dialog = await openDay(/1 Aug 2026/);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Share front photo" })
    );
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(
      "tropos-progress-2026-08-01.jpg"
    );
    expect(toast.success).toHaveBeenCalledWith("Image saved");
    expect(track).toHaveBeenCalledWith("history_progress_photo_shared", {
      shareKind: "photo",
      shareVia: "download",
    });
  });
});

describe("account isolation", () => {
  const seedTwoAccounts = () =>
    seedFirestore({
      "users/u-self/progressPhotos/photo": photoDoc("2026-05-01", {
        pose: "front",
      }),
      "users/other/progressPhotos/photo": {
        ...photoDoc("2026-05-02", { pose: "front" }),
        storagePath: "progress-photos/other/p.enc",
      },
    });

  it("clears one account's photos immediately on a switch and on sign-out", async () => {
    seedTwoAccounts();
    const { rerender } = render(<ProgressPhotos />);
    await screen.findByRole("button", { name: /1 May 2026/ });
    deferReads();
    currentUid = "other";
    rerender(<ProgressPhotos />);
    expect(screen.queryByRole("button", { name: /1 May 2026/ })).toBeNull();
    expect(pendingReads()).toContain("users/other/progressCheckins");
    await act(async () => {
      expect(
        releaseRead(pendingReads().indexOf("users/other/progressPhotos"))
      ).toBe(true);
      expect(
        releaseRead(pendingReads().indexOf("users/other/progressCheckins"))
      ).toBe(true);
    });
    await screen.findByRole("button", { name: /2 May 2026/ });
    currentUid = null;
    rerender(<ProgressPhotos />);
    expect(screen.queryByRole("button", { name: /2 May 2026/ })).toBeNull();
  });

  it("cannot paint an old account's late read over the new account", async () => {
    seedTwoAccounts();
    deferReads();
    const { rerender } = render(<ProgressPhotos />);
    currentUid = "other";
    rerender(<ProgressPhotos />);
    await act(async () => {
      expect(
        releaseRead(pendingReads().indexOf("users/other/progressPhotos"))
      ).toBe(true);
      expect(
        releaseRead(pendingReads().indexOf("users/other/progressCheckins"))
      ).toBe(true);
    });
    await screen.findByRole("button", { name: /2 May 2026/ });
    await act(async () => {
      expect(
        releaseRead(pendingReads().indexOf("users/u-self/progressPhotos"))
      ).toBe(true);
      expect(
        releaseRead(pendingReads().indexOf("users/u-self/progressCheckins"))
      ).toBe(true);
    });
    expect(screen.getByRole("button", { name: /2 May 2026/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /1 May 2026/ })).toBeNull();
  });
});
