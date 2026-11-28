import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  failNextFirestore,
  flushSnapshots,
  readLog,
  resetFirestore,
  seedFirestore,
  setSnapshotMetadata,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  subscribeProgramState,
  type ProgramStateSnapshot,
} from "../programStateStore";

const PROGRAM_PATH = (uid: string) => `users/${uid}/programState/current`;
const programSubscriptions = () =>
  readLog().filter(
    (entry) =>
      entry.op === "onSnapshot" && entry.path.endsWith("/programState/current")
  );

describe("programStateStore", () => {
  beforeEach(() => {
    resetFirestore();
  });

  it("shares one Firestore listener across concurrent subscribers and replays latest snapshot to late joiners", async () => {
    seedFirestore({
      [PROGRAM_PATH("u1")]: { weekNumber: 4 },
    });

    const receivedA: ProgramStateSnapshot[] = [];
    const receivedB: ProgramStateSnapshot[] = [];
    const unsubA = subscribeProgramState("u1", (snap) => receivedA.push(snap));
    const unsubB = subscribeProgramState("u1", (snap) => receivedB.push(snap));

    await flushSnapshots();
    expect(programSubscriptions()).toHaveLength(1);
    expect(receivedA.at(-1)?.data?.weekNumber).toBe(4);
    expect(receivedB.at(-1)?.data?.weekNumber).toBe(4);

    // Late joiner gets the cached snapshot immediately without opening a second listener.
    const receivedC: ProgramStateSnapshot[] = [];
    const unsubC = subscribeProgramState("u1", (snap) => receivedC.push(snap));
    expect(programSubscriptions()).toHaveLength(1);
    expect(receivedC).toHaveLength(1);
    expect(receivedC[0].data?.weekNumber).toBe(4);

    // Live updates fan out to all active subscribers.
    seedFirestore({
      [PROGRAM_PATH("u1")]: { weekNumber: 5 },
    });
    await flushSnapshots();
    expect(receivedA.at(-1)?.data?.weekNumber).toBe(5);
    expect(receivedB.at(-1)?.data?.weekNumber).toBe(5);
    expect(receivedC.at(-1)?.data?.weekNumber).toBe(5);

    unsubA();
    unsubB();
    unsubC();

    // After the last subscriber leaves, a subsequent mount opens a fresh listener.
    const receivedD: ProgramStateSnapshot[] = [];
    const unsubD = subscribeProgramState("u1", (snap) => receivedD.push(snap));
    await flushSnapshots();
    expect(programSubscriptions()).toHaveLength(2);
    expect(receivedD.at(-1)?.data?.weekNumber).toBe(5);
    unsubD();
  });

  it("propagates fromCache metadata for missing-doc cache-to-server transitions", async () => {
    setSnapshotMetadata(PROGRAM_PATH("u-cache"), { fromCache: true });
    const events: ProgramStateSnapshot[] = [];
    const unsub = subscribeProgramState("u-cache", (snap) => events.push(snap));
    await flushSnapshots();
    expect(events.at(-1)).toEqual({
      exists: false,
      data: null,
      fromCache: true,
    });

    setSnapshotMetadata(PROGRAM_PATH("u-cache"), { fromCache: false });
    await flushSnapshots();
    expect(events.at(-1)).toEqual({
      exists: false,
      data: null,
      fromCache: false,
    });
    unsub();
  });

  it("tears down errored entries so retries open a fresh subscription", async () => {
    failNextFirestore("onSnapshot", { path: PROGRAM_PATH("u-err") });
    const errors: Error[] = [];
    const unsub1 = subscribeProgramState(
      "u-err",
      () => {},
      (err) => errors.push(err)
    );
    await flushSnapshots();
    expect(errors).toHaveLength(1);
    unsub1();

    seedFirestore({ [PROGRAM_PATH("u-err")]: { weekNumber: 2 } });
    const recovered: ProgramStateSnapshot[] = [];
    const unsub2 = subscribeProgramState("u-err", (snap) =>
      recovered.push(snap)
    );
    await flushSnapshots();
    expect(programSubscriptions()).toHaveLength(2);
    expect(recovered.at(-1)?.data?.weekNumber).toBe(2);
    unsub2();
  });
});
