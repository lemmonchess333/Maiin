/**
 * EmailUpdatesGroup — a switch for each email a person can choose (App1
 * Q55): the weekly review, and the emails after a break (Q54's later
 * steps). Settings → Notifications.
 *
 * The answer is recorded by the server with its own time
 * (`setEmailConsent`), never written here, so a switch waits on the call:
 * it shows its new place at once, and goes back with a toast if the call
 * fails. Turning one on here is the same yes setup asks for, given to the
 * words on the row (`EMAIL_CONSENT_COPY`, whose version goes with it).
 *
 * The footer says where the email goes. An address not verified yet gets
 * nothing until it is (the server checks), and the footer says so rather
 * than leave someone waiting for a Monday email that will not come.
 */
import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Toggle } from "@/components/ui/Toggle";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";
import {
  EMAIL_CONSENT_COPY,
  EMAIL_KINDS,
  EMAIL_UPDATES_LIVE,
  emailConsentOn,
  emailFooter,
  setEmailConsent,
  type EmailKind,
} from "@/lib/emailConsent";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import { haptic } from "@/lib/haptic";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";

const ROWS: Record<EmailKind, { label: string; description: string }> = {
  weeklyReview: {
    label: EMAIL_CONSENT_COPY.weeklyReviewLabel,
    description: EMAIL_CONSENT_COPY.weeklyReviewDescription,
  },
  winBack: {
    label: EMAIL_CONSENT_COPY.winBackLabel,
    description: EMAIL_CONSENT_COPY.winBackDescription,
  },
};

export default function EmailUpdatesGroup({
  live = EMAIL_UPDATES_LIVE,
}: {
  /** Whether the emails are sent yet; tests set it. */
  live?: boolean;
}) {
  const { user, profile, refreshProfile } = useAuth();
  /* What the switches show while a change is in flight, and after it, until
     the profile is read again: `values` stand while the profile still
     holds what it held when they were set (`base`). */
  const [shown, setShown] = useState<{
    values: Record<EmailKind, boolean>;
    base: Record<EmailKind, boolean>;
  } | null>(null);
  const latest = useRef(0);

  if (!live || !profile) return null;
  const stored = {
    weeklyReview: emailConsentOn(profile.emailConsent, "weeklyReview"),
    winBack: emailConsentOn(profile.emailConsent, "winBack"),
  };
  const current =
    shown &&
    shown.base.weeklyReview === stored.weeklyReview &&
    shown.base.winBack === stored.winBack
      ? shown.values
      : stored;

  async function flip(kind: EmailKind) {
    const on = !current[kind];
    const mine = ++latest.current;
    setShown({ values: { ...current, [kind]: on }, base: stored });
    haptic("light");
    trackSettingsEvent("settings_toggle_changed", {
      toggle: "email",
      value: `${kind}:${on ? "on" : "off"}`,
    });
    try {
      const saved = await setEmailConsent({ [kind]: on });
      if (latest.current !== mine) return;
      // The server's answer is what is stored: shown until the profile
      // has been read again with it (the effect above).
      setShown({ values: saved, base: stored });
      void refreshProfile({
        until: (data) =>
          EMAIL_KINDS.every(
            (k) =>
              emailConsentOn(
                data.emailConsent as Parameters<typeof emailConsentOn>[0],
                k
              ) === saved[k]
          ),
      }).catch((err) => logger.warn("EmailUpdatesGroup: refresh failed", err));
    } catch (err) {
      logger.warn("EmailUpdatesGroup: change failed", err);
      if (latest.current !== mine) return;
      setShown(null);
      toast.error("Couldn’t save that. Try again.");
    }
  }

  return (
    <SettingsGroup
      title="Email"
      footer={
        /* An address is one long word: it wraps anywhere rather than run
           past the screen at a large text size. */
        <span className="[overflow-wrap:anywhere]">
          {emailFooter(user?.email, !!user?.emailVerified)}
        </span>
      }
    >
      {EMAIL_KINDS.map((kind) => (
        <SettingsRow
          key={kind}
          label={ROWS[kind].label}
          description={ROWS[kind].description}
          trailing={
            <Toggle
              label={ROWS[kind].label}
              checked={current[kind]}
              onChange={() => void flip(kind)}
            />
          }
        />
      ))}
    </SettingsGroup>
  );
}
