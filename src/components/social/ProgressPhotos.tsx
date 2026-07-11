import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  collection,
  getDocs,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { addDocGuarded } from "@/lib/firestoreWrite";
import { db, storage } from "../../lib/firebase";
import { useAuth } from "../../lib/auth";
import { Camera, Lock, Plus, RotateCcw, X } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { toast } from "@/lib/toast";
import { THEME } from "../../lib/theme";
import { logger } from "../../lib/logger";
import { EmptyState } from "../ui/EmptyState";
import {
  CHECKIN_NOTE_MAX,
  CHECKIN_SLOTS,
  SLOT_LABELS,
  groupVaultEntries,
  loadProgressCheckIns,
  createProgressCheckIn,
  updateProgressCheckIn,
  type CheckInSlot,
  type ProgressCheckIn,
  type VaultEntry,
  type VaultPhoto,
} from "@/lib/progressVault";

async function getEncryptionKey(uid: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(uid + "_tropos_photos_v1"),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("tropos-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptBlob(data: ArrayBuffer, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as Uint8Array<ArrayBuffer> },
    key,
    data
  );
  return { encrypted, iv };
}

async function decryptBlob(
  encrypted: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array
) {
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as Uint8Array<ArrayBuffer> },
    key,
    encrypted
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Upload timed out")), ms)
    ),
  ]);
}

/** Composer draft — a check-in being created or edited. */
interface ComposerState {
  checkInId?: string;
  date: string;
  note: string;
  photoIds: Partial<Record<CheckInSlot, string>>;
}

/**
 * Private Progress Vault (BODY-VAULT-01, extends the BODY-VAULT-00
 * private-only contract). Photos group into dated CHECK-INS — an optional
 * front/side/back set plus a neutral note — and comparison is between two
 * dated check-ins rather than two arbitrary photos. Photos logged before
 * check-ins existed render as single-photo legacy entries (read adapter in
 * lib/progressVault — no migration of sensitive data).
 *
 * Everything stays owner-only and device-encrypted; nothing here posts to
 * any social surface.
 */
export default function ProgressPhotos() {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<VaultPhoto[]>([]);
  const [checkIns, setCheckIns] = useState<ProgressCheckIn[]>([]);
  const [decryptedUrls, setDecryptedUrls] = useState<Record<string, string>>(
    {}
  );
  const [loading, setLoading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [decrypting, setDecrypting] = useState<Set<string>>(new Set());
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [savingCheckIn, setSavingCheckIn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<CryptoKey | null>(null);
  const pendingFileRef = useRef<File | null>(null);
  const pendingSlotRef = useRef<CheckInSlot | null>(null);

  const entries = useMemo(
    () => groupVaultEntries(checkIns, photos),
    [checkIns, photos]
  );
  const photoById = useMemo(
    () => new Map(photos.map((p) => [p.id, p])),
    [photos]
  );

  // Helper to cache encryption key (#14)
  const getOrDeriveKey = useCallback(
    async (uid: string): Promise<CryptoKey> => {
      if (keyRef.current) return keyRef.current;
      const key = await getEncryptionKey(uid);
      keyRef.current = key;
      return key;
    },
    []
  );

  // Revoke object URLs on unmount to prevent memory leaks (#13)
  useEffect(() => {
    return () => {
      Object.values(decryptedUrls).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPhotos = useCallback(async () => {
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "progressPhotos"),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    setPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as VaultPhoto));
  }, [user]);

  const loadCheckIns = useCallback(async () => {
    if (!user) return;
    try {
      setCheckIns(await loadProgressCheckIns(user.uid));
    } catch (err) {
      logger.error("[Vault] check-in load failed:", err);
    }
  }, [user]);

  useEffect(() => {
    loadPhotos();
    loadCheckIns();
  }, [loadPhotos, loadCheckIns]);

  // Auto-decrypt the 6 most recent photos on mount
  useEffect(() => {
    if (photos.length === 0 || !user) return;

    const autoDecrypt = async () => {
      const key = await getOrDeriveKey(user.uid);

      for (const photo of photos.slice(0, 6)) {
        if (decryptedUrls[photo.id]) continue;

        setDecrypting((prev) => new Set(prev).add(photo.id));
        try {
          const storageRef = ref(storage, photo.storagePath);
          const url = await getDownloadURL(storageRef);
          const response = await fetch(url);
          const encryptedBuffer = await response.arrayBuffer();
          const iv = new Uint8Array(photo.iv);
          const decrypted = await decryptBlob(encryptedBuffer, key, iv);
          const blob = new Blob([decrypted], { type: "image/webp" });
          const objectUrl = URL.createObjectURL(blob);
          setDecryptedUrls((prev) => ({ ...prev, [photo.id]: objectUrl }));
        } catch (err) {
          logger.error(`Auto-decrypt failed for photo ${photo.id}:`, err);
        } finally {
          setDecrypting((prev) => {
            const next = new Set(prev);
            next.delete(photo.id);
            return next;
          });
        }
      }
    };

    autoDecrypt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, user]);

  const decryptPhoto = useCallback(
    async (photo: VaultPhoto) => {
      if (!user || decryptedUrls[photo.id]) return;
      const key = await getOrDeriveKey(user.uid);
      const storageRef = ref(storage, photo.storagePath);
      const url = await getDownloadURL(storageRef);
      const response = await fetch(url);
      const encryptedBuffer = await response.arrayBuffer();
      const iv = new Uint8Array(photo.iv);
      const decrypted = await decryptBlob(encryptedBuffer, key, iv);
      const blob = new Blob([decrypted], { type: "image/webp" });
      const objectUrl = URL.createObjectURL(blob);
      setDecryptedUrls((prev) => ({ ...prev, [photo.id]: objectUrl }));
    },
    [user, decryptedUrls, getOrDeriveKey]
  );

  /** Compress → encrypt (fail-closed) → upload → write metadata doc.
   *  Returns the new photo doc id, or null on failure (error surfaced). */
  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      if (!user) return null;
      setLoading(true);
      setUploadError(null);
      try {
        logger.log("[UPLOAD] Current user:", user.uid);
        logger.log("[UPLOAD] 1. Image picked:", {
          name: file.name,
          size: file.size,
          type: file.type,
        });

        // Step 1: Compress image
        let blob: Blob;
        try {
          const bitmap = await createImageBitmap(file);
          const canvas = document.createElement("canvas");
          const scale = Math.min(1920 / bitmap.width, 1920 / bitmap.height, 1);
          canvas.width = bitmap.width * scale;
          canvas.height = bitmap.height * scale;
          canvas
            .getContext("2d")!
            .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          blob = await new Promise<Blob>((r) =>
            canvas.toBlob((b) => r(b!), "image/webp", 0.8)
          );
          logger.log("[UPLOAD] 2. Compressed image:", {
            width: canvas.width,
            height: canvas.height,
            blobSize: blob.size,
          });
        } catch (e) {
          logger.error("[UPLOAD] Image compression failed:", e);
          throw new Error("Failed to compress image");
        }

        // Step 2: Encrypt — fail-closed. The privacy policy promises
        // photos are stored only in encrypted form, so an encryption
        // failure must fail the upload loudly (retry available) rather
        // than silently uploading the raw image. The zero-IV READ path
        // below is kept so legacy unencrypted photos (pre-fix fallback
        // uploads) still render for their owner.
        let encrypted: ArrayBuffer;
        let iv: Uint8Array;
        let key: CryptoKey;
        logger.log("[UPLOAD] 3. Starting encryption...");
        try {
          key = await getOrDeriveKey(user.uid);
          const result = await encryptBlob(await blob.arrayBuffer(), key);
          encrypted = result.encrypted;
          iv = result.iv;
          logger.log(
            "[UPLOAD] 4. Encryption complete, encrypted size:",
            encrypted.byteLength
          );
        } catch (e) {
          logger.error("[UPLOAD] Encryption failed:", e);
          throw new Error(
            "Couldn't encrypt the photo on this device — upload cancelled to keep it private. Please try again."
          );
        }

        // Step 3: Upload to Firebase Storage
        // NOTE: Requires VITE_FIREBASE_STORAGE_BUCKET env var to be set (see firebase.ts)
        // Always .enc — the write path is fail-closed on encryption
        // (unencrypted .webp blobs only exist from the legacy fallback).
        const path = `progress-photos/${user.uid}/${Date.now()}.enc`;
        logger.log("[UPLOAD] 5. Creating Firebase Storage reference:", path);
        try {
          await withTimeout(
            uploadBytes(ref(storage, path), new Uint8Array(encrypted), {
              contentType: "image/webp",
            }),
            25000
          );
          logger.log("[UPLOAD] 6. Upload complete");
        } catch (e) {
          logger.error("[UPLOAD] Firebase Storage upload failed:", e);
          throw e;
        }

        // Step 4: Write Firestore document
        logger.log("[UPLOAD] 7. Writing Firestore document...");
        let docRef;
        try {
          docRef = await addDocGuarded(
            collection(db, "users", user.uid, "progressPhotos"),
            {
              storagePath: path,
              iv: Array.from(iv),
              date: new Date().toISOString().split("T")[0],
              // Progress photos are owner-only by contract: both
              // firestore.rules (users/{uid}/progressPhotos) and
              // storage.rules (progress-photos/{uid}/) restrict reads
              // to the owner, so "public" was never honoured anywhere.
              // Every photo is recorded private — a real sharing
              // system would be its own consent + rules + moderation
              // project.
              visibility: "private",
              createdAt: Timestamp.now(),
            }
          );
          logger.log("[UPLOAD] 8. Firestore write complete, docId:", docRef.id);
        } catch (e) {
          logger.error("[UPLOAD] Firestore write failed:", e);
          throw new Error("Failed to save photo metadata");
        }

        await loadPhotos();

        // Auto-decrypt/display newly uploaded photo
        try {
          if (iv.some((b) => b !== 0) && key) {
            const newUrl = await getDownloadURL(ref(storage, path));
            const encResponse = await fetch(newUrl);
            const encBuffer = await encResponse.arrayBuffer();
            const decryptedData = await decryptBlob(encBuffer, key, iv);
            const decBlob = new Blob([decryptedData], { type: "image/webp" });
            const objectUrl = URL.createObjectURL(decBlob);
            setDecryptedUrls((prev) => ({ ...prev, [docRef.id]: objectUrl }));
          } else {
            // Unencrypted — create URL from the original blob
            const objectUrl = URL.createObjectURL(blob);
            setDecryptedUrls((prev) => ({ ...prev, [docRef.id]: objectUrl }));
          }
        } catch (e) {
          logger.error(
            "[UPLOAD] Auto-decrypt after upload failed (non-critical):",
            e
          );
        }

        return docRef.id;
      } catch (err) {
        logger.error("[UPLOAD] Upload failed:", err);
        // Surface the actual error so the user can tell what went
        // wrong (storage bucket misconfigured, offline, size limit,
        // permission denied). Fallback to the generic message if the
        // error object doesn't carry a useful message.
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Upload failed. Please try again.";
        setUploadError(message);
        return null;
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [user, loadPhotos, getOrDeriveKey]
  );

  /** File picked for a composer slot → upload → attach to the draft. */
  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!user || !e.target.files?.[0]) return;
      const file = e.target.files[0];
      const slot = pendingSlotRef.current;
      pendingFileRef.current = file;
      const photoId = await uploadFile(file);
      if (photoId && slot) {
        setComposer((prev) =>
          prev
            ? { ...prev, photoIds: { ...prev.photoIds, [slot]: photoId } }
            : prev
        );
      }
    },
    [user, uploadFile]
  );

  const retryUpload = useCallback(async () => {
    if (!pendingFileRef.current) return;
    setUploadError(null);
    const slot = pendingSlotRef.current;
    const photoId = await uploadFile(pendingFileRef.current);
    if (photoId && slot) {
      setComposer((prev) =>
        prev
          ? { ...prev, photoIds: { ...prev.photoIds, [slot]: photoId } }
          : prev
      );
    }
  }, [uploadFile]);

  const dismissError = useCallback(() => {
    setUploadError(null);
    pendingFileRef.current = null;
  }, []);

  const openNewCheckIn = useCallback(() => {
    setComposer({
      date: new Date().toISOString().split("T")[0],
      note: "",
      photoIds: {},
    });
  }, []);

  const openEditCheckIn = useCallback(
    (entry: VaultEntry) => {
      if (!entry.checkInId) return;
      const stored = checkIns.find((c) => c.id === entry.checkInId);
      if (!stored) return;
      setComposer({
        checkInId: stored.id,
        date: stored.date,
        note: stored.note || "",
        photoIds: { ...stored.photoIds },
      });
    },
    [checkIns]
  );

  const saveCheckIn = useCallback(async () => {
    if (!user || !composer || savingCheckIn) return;
    setSavingCheckIn(true);
    try {
      const input = {
        date: composer.date,
        note: composer.note,
        photoIds: composer.photoIds,
      };
      const ok = composer.checkInId
        ? await updateProgressCheckIn(user.uid, composer.checkInId, input)
        : (await createProgressCheckIn(user.uid, input)) !== null;
      if (!ok) {
        toast.error("Add at least one photo first");
        return;
      }
      await loadCheckIns();
      setComposer(null);
      toast.success(composer.checkInId ? "Check-in updated" : "Check-in saved");
    } catch (err) {
      logger.error("[Vault] check-in save failed:", err);
      toast.error("Couldn't save. Try again.");
    } finally {
      setSavingCheckIn(false);
    }
  }, [user, composer, savingCheckIn, loadCheckIns]);

  const toggleCompareSelect = useCallback((entryKey: string) => {
    setSelected((prev) =>
      prev.includes(entryKey)
        ? prev.filter((k) => k !== entryKey)
        : prev.length < 2
          ? [...prev, entryKey]
          : prev
    );
  }, []);

  const renderThumb = (photoId: string, label: string, sizeClass: string) => {
    const photo = photoById.get(photoId);
    return (
      <div className={`${sizeClass} relative rounded-lg overflow-hidden`}>
        {photo && decrypting.has(photoId) ? (
          <div className="size-full bg-muted flex items-center justify-center">
            <Spinner size="sm" variant="muted" label="Decrypting photo" />
          </div>
        ) : decryptedUrls[photoId] ? (
          <img
            src={decryptedUrls[photoId]}
            className="size-full object-cover"
            alt={`${label} progress photo`}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "";
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="size-full bg-muted flex items-center justify-center">
            <Lock className="size-4 text-muted-foreground" />
          </div>
        )}
        <span className="absolute bottom-0 inset-x-0 bg-black/45 text-[10px] text-white text-center py-0.5 uppercase tracking-wide">
          {label}
        </span>
      </div>
    );
  };

  const selectedEntries = selected
    .map((k) => entries.find((e) => e.key === k))
    .filter((e): e is VaultEntry => !!e);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Progress Vault</h3>
        <div className="flex gap-2">
          {entries.length >= 2 && (
            <button
              type="button"
              onClick={() => {
                setCompareMode(!compareMode);
                setSelected([]);
              }}
              aria-label={
                compareMode ? "Exit compare mode" : "Compare check-ins"
              }
              className={`text-xs px-3 py-2 rounded-lg font-medium min-h-[44px] ${compareMode ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              Compare
            </button>
          )}
          <Button onClick={openNewCheckIn} aria-label="New progress check-in">
            + Check-in
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          aria-label="Upload progress photo"
          accept="image/*"
          capture="environment"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {/* BODY-VAULT-00: photos are owner-only by rules (firestore +
          storage), so the old public/private toggle was a false
          affordance — "public" changed a metadata field nothing reads.
          State the real contract instead of offering a dead control. */}
      <div className="flex items-center gap-2">
        <Lock className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">
          Private to your account — encrypted on this device before upload; only
          you can view these photos.
        </span>
      </div>

      {uploadError && !loading && !composer && (
        <div
          className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20"
          role="alert"
        >
          <p className="text-xs text-destructive flex-1 leading-relaxed break-words">
            {uploadError}
          </p>
          {pendingFileRef.current && (
            <button
              type="button"
              onClick={retryUpload}
              aria-label="Retry photo upload"
              className="flex items-center gap-1 text-xs font-medium text-destructive shrink-0"
            >
              <RotateCcw size={12} />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={dismissError}
            aria-label="Dismiss error"
            className="p-0.5 text-destructive/70 hover:text-destructive shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {entries.length === 0 && (
        <EmptyState
          icon={Camera}
          headline="Track your transformation"
          sub="A weekly check-in — front, side and back — shows change no mirror can. Only you can ever see these."
          accent={THEME.brand}
          action={{ label: "+ First check-in", onClick: openNewCheckIn }}
        />
      )}

      {/* Check-in list */}
      <div className="space-y-2">
        {entries.map((entry) => (
          <button
            type="button"
            key={entry.key}
            aria-label={`Check-in from ${entry.date}${compareMode ? ", tap to select for comparison" : entry.checkInId ? ", tap to edit" : ""}`}
            onClick={() => {
              entry.slots.forEach(({ photoId }) => {
                const p = photoById.get(photoId);
                if (p) void decryptPhoto(p);
              });
              if (compareMode) {
                toggleCompareSelect(entry.key);
              } else if (entry.checkInId) {
                openEditCheckIn(entry);
              }
            }}
            className={`w-full p-3 rounded-xl bg-card text-left border-2 transition-colors ${
              selected.includes(entry.key)
                ? "border-primary"
                : "border-transparent"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono tabular-nums text-foreground">
                {entry.date}
              </span>
              {entry.legacy && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Photo
                </span>
              )}
            </div>
            {entry.note && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {entry.note}
              </p>
            )}
            <div className="flex gap-2 mt-2">
              {entry.slots.map(({ slot, photoId }) =>
                renderThumb(
                  photoId,
                  entry.legacy ? "Photo" : SLOT_LABELS[slot],
                  "w-20 aspect-[3/4]"
                )
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Date-based comparison — two check-ins side by side, slot rows
          aligned so front compares against front, side against side. */}
      {compareMode && selectedEntries.length === 2 && (
        <div className="flex gap-2 mt-4">
          {selectedEntries.map((entry) => (
            <div key={entry.key} className="flex-1 space-y-2">
              <p className="text-xs font-mono tabular-nums text-center text-muted-foreground">
                {entry.date}
              </p>
              {entry.slots.map(({ slot, photoId }) =>
                renderThumb(
                  photoId,
                  entry.legacy ? "Photo" : SLOT_LABELS[slot],
                  "w-full aspect-[3/4]"
                )
              )}
            </div>
          ))}
        </div>
      )}

      {/* Check-in composer */}
      <BottomSheet
        open={composer !== null}
        onOpenChange={(v) => {
          if (!v && !savingCheckIn) setComposer(null);
        }}
        title={composer?.checkInId ? "Edit check-in" : "New check-in"}
        description="Front, side and back are optional — one photo still counts. Private to your account."
      >
        {composer && (
          <div className="px-5 pb-5 pt-3 space-y-4">
            <p className="text-xs font-mono tabular-nums text-muted-foreground">
              {composer.date}
            </p>

            <div className="grid grid-cols-3 gap-2">
              {CHECKIN_SLOTS.map((slot) => {
                const photoId = composer.photoIds[slot];
                return (
                  <button
                    type="button"
                    key={slot}
                    aria-label={
                      photoId
                        ? `Replace ${SLOT_LABELS[slot]} photo`
                        : `Add ${SLOT_LABELS[slot]} photo`
                    }
                    disabled={loading}
                    onClick={() => {
                      pendingSlotRef.current = slot;
                      fileInputRef.current?.click();
                    }}
                    className="aspect-[3/4] rounded-xl overflow-hidden border border-dashed border-border bg-muted/40 relative disabled:opacity-60"
                  >
                    {photoId ? (
                      renderThumb(photoId, SLOT_LABELS[slot], "size-full")
                    ) : (
                      <span className="size-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
                        <Plus className="size-4" />
                        <span className="text-[10px] uppercase tracking-wide">
                          {SLOT_LABELS[slot]}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {loading && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
                <Spinner
                  size="sm"
                  variant="primary"
                  label="Encrypting and uploading photo"
                />
                <p className="text-xs text-foreground font-medium">
                  Encrypting &amp; uploading your photo...
                </p>
              </div>
            )}

            {uploadError && !loading && (
              <div
                className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20"
                role="alert"
              >
                <p className="text-xs text-destructive flex-1 leading-relaxed break-words">
                  {uploadError}
                </p>
                {pendingFileRef.current && (
                  <button
                    type="button"
                    onClick={retryUpload}
                    aria-label="Retry photo upload"
                    className="flex items-center gap-1 text-xs font-medium text-destructive shrink-0"
                  >
                    <RotateCcw size={12} />
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  onClick={dismissError}
                  aria-label="Dismiss error"
                  className="p-0.5 text-destructive/70 hover:text-destructive shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="checkin-note"
                className="text-xs font-medium text-muted-foreground"
              >
                Note (optional)
              </label>
              <textarea
                id="checkin-note"
                value={composer.note}
                onChange={(e) =>
                  setComposer((prev) =>
                    prev
                      ? {
                          ...prev,
                          note: e.target.value.slice(0, CHECKIN_NOTE_MAX),
                        }
                      : prev
                  )
                }
                rows={2}
                placeholder="e.g. Morning, same lighting as last week"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>

            <Button
              fullWidth
              loading={savingCheckIn}
              disabled={Object.keys(composer.photoIds).length === 0 || loading}
              onClick={() => void saveCheckIn()}
            >
              {composer.checkInId ? "Save changes" : "Save check-in"}
            </Button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
