/**
 * The agreement an account set up before setup asked meets on its next
 * open (Priv1 call 1): its own words and button, I agree writing it and
 * reading the account again, and Not now saying why with every way on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import HealthConsentGate from "@/components/healthConsent/HealthConsentGate";
import {
  DELETE_ACCOUNT_ANCHOR,
  HEALTH_CONSENT_COPY,
  HEALTH_CONSENT_DECLINED_COPY,
  HEALTH_CONSENT_SAVE_FAILED,
  SIGN_OUT_FAILED,
} from "@/lib/healthConsent";
import { agreeToHealthData } from "@/lib/healthConsentWrite";
import { toast } from "@/lib/toast";
import { noteAnalyticsNoticeShown } from "@/lib/analyticsProvider";
import {
  USAGE_ANALYTICS_NOTICE,
  USAGE_ANALYTICS_OFF_NOTICE,
  USAGE_ANALYTICS_TURN_OFF,
} from "@/lib/usageAnalytics";

vi.mock("@/lib/healthConsentWrite", () => ({
  agreeToHealthData: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/analyticsProvider", () => ({
  noteAnalyticsNoticeShown: vi.fn(),
}));

function Where() {
  const location = useLocation();
  return (
    <output aria-label="Current route">
      {location.pathname}
      {location.hash}
    </output>
  );
}

const onAgreed = vi.fn<() => Promise<boolean>>();
const onSignOut = vi.fn<() => Promise<void>>();

const onTurnOffAnalytics = vi.fn<() => Promise<boolean>>();

function show({ analyticsOff = false }: { analyticsOff?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <HealthConsentGate
                uid="u1"
                analyticsOff={analyticsOff}
                onTurnOffAnalytics={onTurnOffAnalytics}
                onAgreed={onAgreed}
                onSignOut={onSignOut}
              />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  vi.mocked(agreeToHealthData).mockReset().mockResolvedValue("saved");
  onAgreed.mockReset().mockResolvedValue(true);
  onSignOut.mockReset().mockResolvedValue(undefined);
  vi.mocked(toast.error).mockClear();
});
afterEach(cleanup);

describe("HealthConsentGate", () => {
  it("asks in the agreement's own words, with I agree and Not now", () => {
    show();
    expect(
      screen.getByRole("heading", { level: 1, name: HEALTH_CONSENT_COPY.title })
    ).toBeInTheDocument();
    for (const line of [
      HEALTH_CONSENT_COPY.stored,
      HEALTH_CONSENT_COPY.use,
      HEALTH_CONSENT_COPY.withdraw,
    ])
      expect(screen.getByText(line)).toBeInTheDocument();
    expect(button(HEALTH_CONSENT_COPY.agree)).toBeEnabled();
    expect(button(HEALTH_CONSENT_COPY.decline)).toBeEnabled();
    expect(agreeToHealthData).not.toHaveBeenCalled();
  });

  it("writes the agreement for this account, then reads the account again", async () => {
    let finish!: (seen: boolean) => void;
    onAgreed.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        })
    );
    show();
    fireEvent.click(button(HEALTH_CONSENT_COPY.agree));
    // A second tap while it saves does not write twice.
    fireEvent.click(
      screen.getByRole("button", { name: HEALTH_CONSENT_COPY.agree })
    );
    await waitFor(() => expect(onAgreed).toHaveBeenCalledTimes(1));
    expect(agreeToHealthData).toHaveBeenCalledTimes(1);
    expect(agreeToHealthData).toHaveBeenCalledWith("u1");
    expect(
      screen.getByRole("button", { name: HEALTH_CONSENT_COPY.agree })
    ).toHaveAttribute("aria-busy", "true");
    expect(button(HEALTH_CONSENT_COPY.decline)).toBeDisabled();
    finish(true);
    await waitFor(() =>
      expect(button(HEALTH_CONSENT_COPY.agree)).not.toHaveAttribute("aria-busy")
    );
    // The account showed the agreement: the app takes over, nothing to say.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says so when the account, read again, still shows no agreement", async () => {
    onAgreed.mockResolvedValueOnce(false);
    show();
    fireEvent.click(button(HEALTH_CONSENT_COPY.agree));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      HEALTH_CONSENT_SAVE_FAILED
    );
    expect(agreeToHealthData).toHaveBeenCalledTimes(1);
    expect(button(HEALTH_CONSENT_COPY.agree)).toBeEnabled();
    expect(button(HEALTH_CONSENT_COPY.decline)).toBeEnabled();
  });

  /* Google Analytics runs from this screen on, so the screen says what it
     counts and how to turn it off (owner, 23 November 2026). */
  it("carries the analytics line, and lets analytics run from its showing", () => {
    vi.mocked(noteAnalyticsNoticeShown).mockClear();
    show();
    expect(
      screen.getByText(USAGE_ANALYTICS_NOTICE, { exact: false })
    ).toBeInTheDocument();
    expect(noteAnalyticsNoticeShown).toHaveBeenCalledTimes(1);
  });

  it("Turn off writes the account's answer, and the line says it is off", async () => {
    onTurnOffAnalytics.mockReset().mockResolvedValue(true);
    show();
    fireEvent.click(button(USAGE_ANALYTICS_TURN_OFF));
    expect(onTurnOffAnalytics).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(USAGE_ANALYTICS_OFF_NOTICE)
    ).toBeInTheDocument();
    expect(agreeToHealthData).not.toHaveBeenCalled();
  });

  it("puts the line back when the account could not save the Turn off", async () => {
    onTurnOffAnalytics.mockReset().mockResolvedValue(false);
    show();
    fireEvent.click(button(USAGE_ANALYTICS_TURN_OFF));
    expect(
      await screen.findByRole("button", { name: USAGE_ANALYTICS_TURN_OFF })
    ).toBeInTheDocument();
  });

  it("says analytics is off for an account that already turned it off", () => {
    show({ analyticsOff: true });
    expect(screen.getByText(USAGE_ANALYTICS_OFF_NOTICE)).toBeInTheDocument();
  });

  it("links the Privacy Policy, by its own words", () => {
    show();
    const policy = screen.getByRole("link", {
      name: HEALTH_CONSENT_COPY.policy,
    });
    expect(policy).toHaveAttribute("href", "/privacy");
    fireEvent.click(policy);
    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      /^\/privacy$/
    );
  });

  it("says so when the agreement could not be saved, and asks again", async () => {
    vi.mocked(agreeToHealthData).mockRejectedValueOnce(
      Object.assign(new Error("offline"), { code: "unavailable" })
    );
    show();
    fireEvent.click(button(HEALTH_CONSENT_COPY.agree));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      HEALTH_CONSENT_SAVE_FAILED
    );
    expect(onAgreed).not.toHaveBeenCalled();
    expect(button(HEALTH_CONSENT_COPY.agree)).toBeEnabled();
  });

  it("says why on Not now, with going back, deleting the account and signing out", async () => {
    show();
    fireEvent.click(button(HEALTH_CONSENT_COPY.decline));
    const heading = screen.getByRole("heading", {
      level: 1,
      name: HEALTH_CONSENT_DECLINED_COPY.title,
    });
    expect(heading).toHaveFocus();
    expect(
      screen.getByText(HEALTH_CONSENT_DECLINED_COPY.body)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: HEALTH_CONSENT_COPY.agree })
    ).not.toBeInTheDocument();

    fireEvent.click(button(HEALTH_CONSENT_DECLINED_COPY.signOut));
    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));

    fireEvent.click(button(HEALTH_CONSENT_DECLINED_COPY.back));
    expect(
      screen.getByRole("heading", { level: 1, name: HEALTH_CONSENT_COPY.title })
    ).toHaveFocus();
    expect(button(HEALTH_CONSENT_COPY.agree)).toBeEnabled();

    fireEvent.click(button(HEALTH_CONSENT_COPY.decline));
    fireEvent.click(button(HEALTH_CONSENT_DECLINED_COPY.deleteAccount));
    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      `/settings/account#${DELETE_ACCOUNT_ANCHOR}`
    );
    expect(agreeToHealthData).not.toHaveBeenCalled();
  });

  it("says so when signing out did not finish", async () => {
    onSignOut.mockRejectedValueOnce(new Error("offline"));
    show();
    fireEvent.click(button(HEALTH_CONSENT_COPY.decline));
    fireEvent.click(button(HEALTH_CONSENT_DECLINED_COPY.signOut));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(SIGN_OUT_FAILED)
    );
  });
});
