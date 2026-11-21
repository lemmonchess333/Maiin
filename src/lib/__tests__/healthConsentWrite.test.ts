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
  resetFirestore,
  resumeWrites,
  seedFirestore,
  writeLog,
} from "@/test/firestoreHarness";
import { HEALTH_DATA_CONSENT_VERSION } from "@/lib/healthConsent";
import {
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
