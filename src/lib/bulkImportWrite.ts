/**
 * Batched Firestore persistence for bulk data imports (CSV & JSON backups).
 *
 * Uses Firestore `writeBatch` in chunks of 450 documents (below Firestore's
 * 500-operation ceiling) instead of sequential per-document transactions +
 * O(N²) `localStorage` queue rewrites. When offline or on a transient network
 * failure, falls back cleanly to a single-pass `queueDurableWritesBatch` call
 * so no imported records are lost.
 */
import { doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { stripUndefined } from "@/lib/firestoreGuards";
import { queueDurableWritesBatch } from "@/lib/offlineQueue";

export const BULK_IMPORT_BATCH_SIZE = 450;

export interface BulkImportEntry {
  collectionPath: string;
  docId: string;
  data: Record<string, unknown>;
  /** When true, merges into existing docs (e.g. updating a date-keyed weigh-in). */
  merge?: boolean;
}

export interface BulkImportProgress {
  written: number;
  total: number;
}

const PERMANENT_ERROR_CODES = new Set([
  "permission-denied",
  "invalid-argument",
  "failed-precondition",
  "unauthenticated",
  "out-of-range",
]);

function isPermanentFirestoreError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code !== "string") return false;
  const normalized = code.replace(/^firestore\//, "");
  return PERMANENT_ERROR_CODES.has(normalized);
}

/**
 * Commits bulk import documents via Firestore `writeBatch` (450 docs per
 * batch) with optional progress reporting, falling back to a single batched
 * durable offline enqueue when offline or on transient network errors.
 */
export async function commitBulkImportWrites(
  uid: string,
  entries: readonly BulkImportEntry[],
  onProgress?: (progress: BulkImportProgress) => void
): Promise<number> {
  const total = entries.length;
  if (total === 0) return 0;

  const isOffline =
    typeof navigator !== "undefined" && navigator.onLine === false;
  if (isOffline) {
    queueDurableWritesBatch(uid, entries);
    onProgress?.({ written: total, total });
    return total;
  }

  let written = 0;
  for (let offset = 0; offset < total; offset += BULK_IMPORT_BATCH_SIZE) {
    const slice = entries.slice(offset, offset + BULK_IMPORT_BATCH_SIZE);
    try {
      const batch = writeBatch(db);
      for (const entry of slice) {
        const ref = doc(db, entry.collectionPath, entry.docId);
        const clean = stripUndefined(entry.data);
        if (entry.merge) {
          batch.set(ref, clean, { merge: true });
        } else {
          batch.set(ref, clean);
        }
      }
      await batch.commit();
      written += slice.length;
      onProgress?.({ written, total });
    } catch (err) {
      if (isPermanentFirestoreError(err)) {
        throw err;
      }
      // Transient connectivity loss mid-import: hand the remaining uncommitted
      // entries to the durable offline queue in one single storage write.
      queueDurableWritesBatch(uid, entries.slice(offset));
      onProgress?.({ written: total, total });
      return total;
    }
  }

  return written;
}
