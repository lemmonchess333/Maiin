import { describe, expect, it } from "vitest";
import {
  decryptProgressPhoto,
  encryptProgressPhoto,
} from "../progressPhotoCrypto";

const uid = "u-self";
const path = "progress-photos/u-self/photo.enc";
const plain = new TextEncoder().encode("private photo bytes").buffer;

describe("account-recoverable progress-photo encryption", () => {
  it("uses an independent random key and IV per photo and round-trips from stored metadata", async () => {
    const a = await encryptProgressPhoto(plain, uid, path);
    const b = await encryptProgressPhoto(plain, uid, path);
    expect(a.metadata.encryptionVersion).toBe(2);
    expect(a.metadata.encryptionKey).toHaveLength(32);
    expect(a.metadata.iv).toHaveLength(12);
    expect(a.metadata.encryptionKey).not.toEqual(b.metadata.encryptionKey);
    expect(a.metadata.iv).not.toEqual(b.metadata.iv);
    expect(Array.from(new Uint8Array(a.encrypted))).not.toEqual(
      Array.from(new Uint8Array(plain))
    );
    const restored = JSON.parse(JSON.stringify(a.metadata));
    expect(await decryptProgressPhoto(a.encrypted, uid, restored)).toEqual(
      plain
    );
  });

  it("binds ciphertext to the owner and exact storage object", async () => {
    const a = await encryptProgressPhoto(plain, uid, path);
    await expect(
      decryptProgressPhoto(a.encrypted, "other", a.metadata)
    ).rejects.toThrow("belong");
    await expect(
      decryptProgressPhoto(a.encrypted, uid, {
        ...a.metadata,
        storagePath: "progress-photos/u-self/swapped.enc",
      })
    ).rejects.toThrow();
  });

  it("rejects tampered ciphertext and another photo's key", async () => {
    const a = await encryptProgressPhoto(plain, uid, path);
    const b = await encryptProgressPhoto(plain, uid, path);
    const corrupt = new Uint8Array(a.encrypted.slice(0));
    corrupt[0] ^= 1;
    await expect(
      decryptProgressPhoto(corrupt.buffer, uid, a.metadata)
    ).rejects.toThrow();
    await expect(
      decryptProgressPhoto(a.encrypted, uid, {
        ...a.metadata,
        encryptionKey: b.metadata.encryptionKey,
      })
    ).rejects.toThrow();
  });

  it("does not fall back to a UID key or plaintext when versioned metadata is missing or malformed", async () => {
    const a = await encryptProgressPhoto(plain, uid, path);
    for (const encryptionKey of [
      undefined,
      [],
      [256],
      new Array(32).fill(-1),
    ]) {
      await expect(
        decryptProgressPhoto(a.encrypted, uid, { ...a.metadata, encryptionKey })
      ).rejects.toThrow();
    }
    await expect(
      decryptProgressPhoto(a.encrypted, uid, {
        ...a.metadata,
        encryptionVersion: 3,
      })
    ).rejects.toThrow("Unsupported");
    await expect(
      decryptProgressPhoto(a.encrypted, uid, {
        ...a.metadata,
        encryptionVersion: undefined,
      })
    ).rejects.toThrow("Unsupported");
    await expect(
      decryptProgressPhoto(a.encrypted, uid, {
        ...a.metadata,
        iv: new Array(12).fill(0),
      })
    ).rejects.toThrow();
  });

  it("reads a fixed ciphertext produced by the previous UID-derived format", async () => {
    const legacy = new Uint8Array([
      169, 199, 71, 160, 39, 234, 48, 240, 222, 150, 81, 13, 109, 82, 230, 15,
      24, 62, 154, 54, 47, 227, 208, 59, 126, 34, 208, 28, 80, 127, 180, 121,
      117, 3,
    ]);
    const restored = await decryptProgressPhoto(legacy.buffer, uid, {
      storagePath: path,
      iv: new Array(12).fill(7),
    });
    expect(new TextDecoder().decode(restored)).toBe("legacy photo bytes");
  });

  it("reads historical zero-IV plain uploads only when unversioned", async () => {
    expect(
      await decryptProgressPhoto(plain, uid, {
        storagePath: path,
        iv: new Array(12).fill(0),
      })
    ).toEqual(plain);
    await expect(
      decryptProgressPhoto(plain, uid, { storagePath: path, iv: [0] })
    ).rejects.toThrow();
  });
});
