/**
 * I agree on a connection that reports online and answers nothing (Priv1
 * call 1, second review). The write's promise never settles there; the
 * gate counts the agreement as made on the device after a few seconds, as
 * it does offline, and goes on to read the account again, rather than
 * spinning with Not now held. The real write, on the one Firestore fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HealthConsentGate from "@/components/healthConsent/HealthConsentGate";
import { HEALTH_CONSENT_COPY } from "@/lib/healthConsent";
import { AGREE_WRITE_WAIT_MS } from "@/lib/healthConsentWrite";
import {
  deferWrites,
  pendingWrites,
  releaseAllWrites,
  resetFirestore,
  resumeWrites,
  seedFirestore,
} from "@/test/firestoreHarness";
import { restoreRealTimers } from "@/test/fakeTimers";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const online = Object.getOwnPropertyDescriptor(navigator, "onLine");

beforeEach(() => {
  resetFirestore();
  seedFirestore({ "users/u1": { onboardingComplete: true } });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});

afterEach(async () => {
  await restoreRealTimers();
  resumeWrites();
  releaseAllWrites();
  if (online) Object.defineProperty(navigator, "onLine", online);
  else Reflect.deleteProperty(navigator, "onLine");
});

describe("HealthConsentGate with a write that never settles", () => {
  it("stops waiting after a few seconds and reads the account again", async () => {
    vi.useFakeTimers();
    deferWrites();
    const onAgreed = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    render(
      <MemoryRouter>
        <HealthConsentGate uid="u1" onAgreed={onAgreed} onSignOut={vi.fn()} />
      </MemoryRouter>
    );
    fireEvent.click(
      screen.getByRole("button", { name: HEALTH_CONSENT_COPY.agree })
    );
    // Anchor: the write is out, unanswered, and I agree is waiting on it.
    expect(pendingWrites()).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGREE_WRITE_WAIT_MS - 100);
    });
    expect(onAgreed).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: HEALTH_CONSENT_COPY.decline })
    ).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(onAgreed).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: HEALTH_CONSENT_COPY.agree })
    ).not.toHaveAttribute("aria-busy");
    expect(
      screen.getByRole("button", { name: HEALTH_CONSENT_COPY.decline })
    ).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
