import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ProgramState } from "@/features/program/programTypes";

export interface ProgramStateSnapshot {
  exists: boolean;
  data: ProgramState | null;
  fromCache: boolean;
}

interface Subscriber {
  onNext: (snapshot: ProgramStateSnapshot) => void;
  onError?: (error: Error) => void;
}

interface Entry {
  latest: ProgramStateSnapshot | null;
  subscribers: Set<Subscriber>;
  stop: () => void;
}

// Single ref-counted Firestore subscription to users/{uid}/programState/current
// shared across root-level readers (useStreaks, useNextLiftName,
// useTrainingFuelData, useHomeProgram). Entries tear down immediately when
// their last subscriber unsubscribes or on stream error so retries open fresh.
const entries = new Map<string, Entry>();

/**
 * Subscribe to `users/{uid}/programState/current` through a shared live
 * listener. Late subscribers receive the latest cached snapshot immediately.
 */
export function subscribeProgramState(
  uid: string,
  onNext: (snapshot: ProgramStateSnapshot) => void,
  onError?: (error: Error) => void
): () => void {
  const subscriber: Subscriber = { onNext, onError };
  let entry = entries.get(uid);
  if (!entry) {
    entry = {
      latest: null,
      subscribers: new Set([subscriber]),
      stop: () => {},
    };
    entries.set(uid, entry);
    const owner = entry;
    let active = true;
    let unsub: (() => void) | null = null;
    owner.stop = () => {
      active = false;
      unsub?.();
      unsub = null;
    };
    const unsubscribe = onSnapshot(
      doc(db, "users", uid, "programState", "current"),
      { includeMetadataChanges: true },
      (snap) => {
        if (!active) return;
        const snapshot: ProgramStateSnapshot = {
          exists: snap.exists(),
          data: snap.exists() ? (snap.data() as ProgramState) : null,
          fromCache: snap.metadata.fromCache,
        };
        owner.latest = snapshot;
        for (const sub of [...owner.subscribers]) {
          sub.onNext(snapshot);
        }
      },
      (err) => {
        if (!active) return;
        active = false;
        if (entries.get(uid) === owner) {
          entries.delete(uid);
        }
        unsub?.();
        unsub = null;
        const error = err instanceof Error ? err : new Error(String(err));
        for (const sub of [...owner.subscribers]) {
          sub.onError?.(error);
        }
      }
    );
    if (active) {
      unsub = unsubscribe;
    } else {
      unsubscribe();
    }
  } else {
    entry.subscribers.add(subscriber);
    if (entry.latest !== null) {
      onNext(entry.latest);
    }
  }

  const owner = entry;
  return () => {
    owner.subscribers.delete(subscriber);
    if (owner.subscribers.size === 0 && entries.get(uid) === owner) {
      owner.stop();
      entries.delete(uid);
    }
  };
}
