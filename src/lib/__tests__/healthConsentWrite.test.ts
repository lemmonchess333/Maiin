/**
 * The gate's agreement (Priv1 call 1): one field, the shape the rules hold
 * it to, and an offline agreement that does not wait for the connection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deferWrites,
  pendingWrites,
  readDoc,
  rejectWrite,
  releaseWrite,
  resetFirestore,
  resumeWrites,
  seedFirestore,
  writeLog,
} from "@/test/firestoreHarness";
import { HEALTH_DATA_CONSENT_VERSION } from "@/lib/healthConsent";
import {
  AGREE_WRITE_WAIT_MS,
  agreeToHealthData,
  HEALTH_CONSENT_LATE_REFUSAL,
} from "@/lib/healthConsentWrite";
import { toast } from "@/lib/toast";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const online = Object.getOwnPropertyDescriptor(navigator, "onLine");
function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  resetFirestore();
  vi.mocked(toast.error).mockClear();
  seedFirestore({ "users/u1": { onboardingComplete: true, weightKg: 80 } });
});

afterEach(() => {
  vi.useRealTimers();
  resumeWrites();
  if (online) Object.defineProperty(navigator, "onLine", online);
  else Reflect.deleteProperty(navigator, "onLine");
});

describe("agreeToHealthData", () => {
  it("writes only the agreement, with the server's time and the current wording", async () => {
    setOnline(true);
    await expect(agreeToHealthData("u1")).resolves.toBe("saved");
    const writes = writeLog().filter((w) => w.path === "users/u1");
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe("update");
    const data = writes[0].data as Record<string, unknown>;
    expect(Object.keys(data)).toEqual(["healthDataConsent"]);
    const consent = data.healthDataConsent as Record<string, unknown>;
    expect(Object.keys(consent).sort()).toEqual(["at", "version"]);
    expect(consent.version).toBe(HEALTH_DATA_CONSENT_VERSION);
    // The time is the server's sentinel, never the device's clock.
    expect(consent.at).not.toBeInstanceOf(Date);
    expect(typeof consent.at).toBe("object");
    // The rest of the profile is left as it was.
    expect(readDoc("users/u1")).toMatchObject({
      onboardingComplete: true,
      weightKg: 80,
      healthDataConsent: { version: HEALTH_DATA_CONSENT_VERSION },
    });
  });

  it("throws a refusal online, so the gate can say so", async () => {
    setOnline(true);
    deferWrites();
    const agreeing = agreeToHealthData("u1");
    expect(pendingWrites()).toHaveLength(1);
    rejectWrite(0, "permission-denied");
    await expect(agreeing).rejects.toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("answers at once offline, and says so if the server later refuses it", async () => {
    setOnline(false);
    deferWrites();
    await expect(agreeToHealthData("u1")).resolves.toBe("queued");
    expect(toast.error).not.toHaveBeenCalled();
    rejectWrite(0, "permission-denied");
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(HEALTH_CONSENT_LATE_REFUSAL)
    );
  });
});

/* A connection that says it is online but answers nothing: the SDK holds
   the write on the device and its promise never settles. I agree must not
   spin for ever with Not now held, so after a few seconds the agreement
   counts as made on the device, as an offline one does. */
describe("agreeToHealthData on a connection that answers nothing", () => {
  it("counts the agreement as made on this device after a few seconds", async () => {
    vi.useFakeTimers();
    setOnline(true);
    deferWrites();
    let outcome: string | undefined;
    void agreeToHealthData("u1").then((value) => {
      outcome = value;
    });
    await vi.advanceTimersByTimeAsync(AGREE_WRITE_WAIT_MS - 1);
    // Anchor: the write is out and unanswered, and it has not given up yet.
    expect(pendingWrites()).toHaveLength(1);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBe("queued");
    expect(toast.error).not.toHaveBeenCalled();
    // The server answers at last: nothing more to say.
    resumeWrites();
    releaseWrite(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says so if the server refuses it once it answers", async () => {
    vi.useFakeTimers();
    setOnline(true);
    deferWrites();
    const agreeing = agreeToHealthData("u1");
    await vi.advanceTimersByTimeAsync(AGREE_WRITE_WAIT_MS);
    await expect(agreeing).resolves.toBe("queued");
    rejectWrite(0, "permission-denied");
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(HEALTH_CONSENT_LATE_REFUSAL)
    );
  });

  it("is saved as usual when the server answers in time", async () => {
    vi.useFakeTimers();
    setOnline(true);
    deferWrites();
    const agreeing = agreeToHealthData("u1");
    await vi.advanceTimersByTimeAsync(AGREE_WRITE_WAIT_MS / 2);
    resumeWrites();
    releaseWrite(0);
    await expect(agreeing).resolves.toBe("saved");
    await vi.advanceTimersByTimeAsync(AGREE_WRITE_WAIT_MS);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
