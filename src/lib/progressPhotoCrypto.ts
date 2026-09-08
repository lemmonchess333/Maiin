/** Account-recoverable photo encryption. Keys live only in owner-only Firestore
 * metadata, never in Storage paths/custom metadata or the public client bundle.
 * Tropos can access both stores: this is deliberately not end-to-end encryption.
 * Existing UID-derived and zero-IV legacy files remain read-only compatible. */
export interface ProgressPhotoEncryption {
  iv: number[];
  encryptionVersion?: number;
  encryptionKey?: number[];
  storagePath: string;
}

function bytes(value: unknown, length: number): Uint8Array<ArrayBuffer> {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    throw new Error("Invalid photo encryption metadata");
  }
  return new Uint8Array(value);
}

function binding(uid: string, path: string): Uint8Array<ArrayBuffer> {
  if (!uid || !path.startsWith(`progress-photos/${uid}/`)) {
    throw new Error("Photo does not belong to this account");
  }
  return new TextEncoder().encode(`tropos-progress-photo:v2:${uid}:${path}`);
}

export async function encryptProgressPhoto(
  data: ArrayBuffer,
  uid: string,
  storagePath: string
): Promise<{ encrypted: ArrayBuffer; metadata: ProgressPhotoEncryption }> {
  const additionalData = binding(uid, storagePath);
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    data
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  return {
    encrypted,
    metadata: {
      storagePath,
      encryptionVersion: 2,
      iv: Array.from(iv),
      encryptionKey: Array.from(new Uint8Array(raw)),
    },
  };
}

export async function decryptProgressPhoto(
  data: ArrayBuffer,
  uid: string,
  photo: ProgressPhotoEncryption
): Promise<ArrayBuffer> {
  const additionalData = binding(uid, photo.storagePath);
  const iv = bytes(photo.iv, 12);
  if (photo.encryptionVersion === 2) {
    const key = await crypto.subtle.importKey(
      "raw",
      bytes(photo.encryptionKey, 32),
      "AES-GCM",
      false,
      ["decrypt"]
    );
    return crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData },
      key,
      data
    );
  }
  // A malformed/new version must never fall back to a public UID key or plaintext.
  if (
    photo.encryptionVersion !== undefined ||
    photo.encryptionKey !== undefined
  ) {
    throw new Error("Unsupported photo encryption version");
  }
  if (iv.every((n) => n === 0)) return data;
  // Historical reader only. All inputs to this derivation are public, so old
  // photos do not gain bucket-leak confidentiality merely by updating the app.
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(uid + "_tropos_photos_v1"),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("tropos-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
}
