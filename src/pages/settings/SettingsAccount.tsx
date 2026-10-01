import { useAccountDeletionStatus } from "@/hooks/useAccountDeletionStatus";
/** SettingsAccount — Account / Data nested page (Set1.2). */
import { useAuth } from "@/lib/auth";
import {
  loadOnboardingDraft,
  ONBOARDING_STEP_IDS,
} from "@/lib/onboardingDraft";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import SettingsSection from "@/components/settings/SettingsSection";
import AccountSection from "@/components/settings/AccountSection";
import SecuritySection from "@/components/settings/SecuritySection";

export default function SettingsAccount({
  duringSetup = false,
}: {
  duringSetup?: boolean;
}) {
  const { user, profile, signOut } = useAuth();
  const deletion = useAccountDeletionStatus(user?.uid);
  /* Signing out of an unfinished setup (or out of an account deleted
     during it) is the one way to leave onboarding the app can see:
     closing the app looks the same as pausing. The step comes from the
     saved answers (A1b pin 4), read before signing out, and the event goes
     once the sign-out has worked. `duringSetup` alone does not mean setup:
     a finished account with a deletion pending gets this page too. */
  const leave = async () => {
    const leaving =
      duringSetup && user && !profile?.onboardingComplete ? user.uid : null;
    const saved = leaving ? loadOnboardingDraft(leaving, 7)?.step : undefined;
    await signOut();
    if (leaving)
      trackLifecycle(
        "onboarding_abandoned",
        saved === undefined ? {} : { step: ONBOARDING_STEP_IDS[saved] }
      );
  };

  return (
    <SettingsSection
      title="Account"
      subtitle="Email, password, sign out"
      section="account"
      backTo={duringSetup ? "/" : undefined}
      backLabel={duringSetup ? "Setup" : undefined}
    >
      {!deletion.pending && !deletion.completed && (
        <SecuritySection key={user?.uid} inline user={user} />
      )}
      {/*
        Export lives INSIDE AccountSection's "Data & account" block, not
        here. #1923 rendered DataExportSection at this level believing the
        page advertised export and shipped none — but AccountSection had
        been carrying a verbatim inline copy the whole time, so the screen
        showed six export rows. The duplication is resolved the other way
        round: AccountSection now points at the extracted component.
      */}
      <AccountSection inline user={user} signOut={leave} />
    </SettingsSection>
  );
}
