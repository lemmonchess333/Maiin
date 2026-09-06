/**
 * ProgressPhotos — BODY-VAULT-00 private-only contract pins.
 *
 * Progress photos are owner-only in BOTH firestore.rules
 * (users/{uid}/progressPhotos) and storage.rules (progress-photos/{uid}/).
 * The pre-fix UI offered a "Make photos public" toggle that wrote a
 * `visibility` field nothing reads — a false affordance over an
 * owner-only store. These pins guarantee:
 *   1. No public/private toggle renders — the control is gone, not
 *      relabelled.
 *   2. The factual private-only copy renders instead.
 *   3. (write contract) The upload payload literal records
 *      visibility: "private" — pinned at source level below since the
 *      upload path needs createImageBitmap/canvas/crypto.subtle, which
 *      jsdom doesn't provide.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../../../lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u-self" } }),
  useUid: () => ({ user: { uid: "u-self" } }).user?.uid ?? null,
}));

vi.mock("../../../lib/firebase", () => ({
  db: {},
  storage: {},
}));

vi.mock("firebase/firestore");

vi.mock("firebase/storage", () => ({
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn(async () => undefined),
  getDownloadURL: vi.fn(async () => "https://example.invalid/blob"),
}));

vi.mock("@/lib/firestoreWrite", () => ({
  addDocGuarded: vi.fn(async () => ({ id: "doc-1" })),
}));

import ProgressPhotos from "../ProgressPhotos";
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";

const VAULT = "users/u-self/progressPhotos";

beforeEach(() => {
  resetFirestore();
});
afterEach(() => {
  resetFirestore();
});

describe("ProgressPhotos — private-only contract (BODY-VAULT-00)", () => {
  it("renders no public/private toggle in any labelling", () => {
    render(<ProgressPhotos />);
    expect(screen.queryByText(/make photos public/i)).toBeNull();
    expect(screen.queryByText(/make photos private/i)).toBeNull();
    expect(screen.queryByText(/keep photos private/i)).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("states the real owner-only contract instead", () => {
    render(<ProgressPhotos />);
    expect(screen.getByText(/private to your account/i)).toBeInTheDocument();
    // Soc9: the key derives from the uid, so the honest claim is "never
    // shown to other users", not "only you can view" — the operator can.
    // Both the lock line and the empty-vault card say it.
    expect(
      screen.getAllByText(/never shown to other users/i).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/only you can/i)).toBeNull();
  });

  it("still offers no toggle once the vault HAS photos", async () => {
    // The pre-migration stub hard-coded `getDocs` to an empty result, so
    // every assertion above only ever described the EMPTY vault. A
    // per-photo visibility control — the most natural place to
    // reintroduce the affordance BODY-VAULT-00 removed — would have been
    // invisible to this suite. Seeding real rows is what the shared fake
    // buys here; it is not a mechanical swap.
    seedFirestore({
      [`${VAULT}/p1`]: {
        storagePath: "progress-photos/u-self/1.enc",
        iv: [1, 2, 3],
        date: "2026-07-01",
        visibility: "private",
        createdAt: 1,
      },
      [`${VAULT}/p2`]: {
        storagePath: "progress-photos/u-self/2.enc",
        iv: [4, 5, 6],
        date: "2026-07-08",
        visibility: "private",
        createdAt: 2,
      },
    });
    render(<ProgressPhotos />);

    // Positive anchor: the seeded photos must actually REACH the
    // component before the negatives below mean anything. The privacy
    // copy is the wrong anchor — it renders in the empty vault too, so
    // waiting on it would prove nothing. `groupVaultEntries` turns
    // photos into entries, which is what dismisses the empty state, so
    // its disappearance is the signal that the rows loaded.
    expect(screen.getByText(/track your transformation/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/track your transformation/i)).toBeNull()
    );

    expect(screen.queryByText(/make photos public/i)).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("records every upload as private and never writes 'public' (source pin)", () => {
    // The upload path needs createImageBitmap + canvas + crypto.subtle,
    // none of which jsdom provides — so the write contract is pinned at
    // source level: the payload hardcodes visibility: "private" and no
    // "public" visibility value exists anywhere in the module.
    const source = readFileSync(
      resolve(__dirname, "../ProgressPhotos.tsx"),
      "utf8"
    );
    expect(source).toMatch(/visibility:\s*"private"/);
    expect(source).not.toMatch(/visibility:\s*isPrivate/);
    // No code path may assign a public visibility (comments explaining
    // the old bug are fine — match assignment shapes only).
    expect(source).not.toMatch(/visibility:\s*"public"/);
    expect(source).not.toMatch(/\?\s*"private"\s*:\s*"public"/);
    expect(source).not.toMatch(/\?\s*"public"\s*:\s*"private"/);
  });

  it("has no unencrypted upload fallback (fail-closed write path)", () => {
    // The privacy policy promises photos are stored only in encrypted
    // form; the pre-fix path silently uploaded the raw image when
    // encryption failed. Pin that the fallback is gone (the zero-IV
    // READ path for legacy blobs is allowed to remain).
    const source = readFileSync(
      resolve(__dirname, "../ProgressPhotos.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/Falling back to unencrypted/i);
    expect(source).not.toMatch(/zero IV indicates unencrypted/i);
  });
});
