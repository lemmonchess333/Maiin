import { useAccountDeletionStatus } from "@/hooks/useAccountDeletionStatus";
/**
 * SettingsAccount — the account: its plan, its sign-in, its data, and the
 * way out (Set1.2).
 *
 * Since Trim1 call 7 (the owner, 11 November 2026: "streamline all") it
 * carries what two near-empty Settings pages held. Subscription was one
 * button and the AI usage line, both of which opened the Pro page for a
 * free account. Your data was the three exports and the way into recently
 * deleted meals. During setup, and while a deletion is pending, the page
 * is the sign-in and the way out alone.
 */
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  loadOnboardingDraft,
  ONBOARDING_STEP_IDS,
} from "@/lib/onboardingDraft";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import SettingsSection from "@/components/settings/SettingsSection";
import AccountSection from "@/components/settings/AccountSection";
import SecuritySection from "@/components/settings/SecuritySection";
import SubscriptionCard from "@/components/settings/SubscriptionCard";
import AiUsageSection from "@/components/settings/AiUsageSection";
import TrackSettingsSectionView from "@/components/settings/TrackSettingsSectionView";
import DataExportSection from "@/components/settings/DataExportSection";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";

export default function SettingsAccount({
  duringSetup = false,
}: {
  duringSetup?: boolean;
}) {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const deletion = useAccountDeletionStatus(user?.uid);
  /* The plan and the data belong to a finished account in good standing:
     setup has neither yet, and an account on its way out is offered
     nothing to buy and nothing new to open. */
  const settled =
    !duringSetup &&
    !!profile?.onboardingComplete &&
    !deletion.pending &&
    !deletion.completed;
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
      subtitle={
        settled ? "Plan, sign-in, your data" : "Email, password, sign out"
      }
      section="account"
      backTo={duringSetup ? "/" : undefined}
      backLabel={duringSetup ? "Setup" : undefined}
    >
      {settled && (
        <>
          <TrackSettingsSectionView section="subscription">
            <SubscriptionCard />
          </TrackSettingsSectionView>
          {/* Its own analytics section, as it was on the Subscription
              page: `ai_usage` is a member of the closed `SettingsSection`
              union, and a member no page reported is how the line was
              once found unreachable. */}
          <TrackSettingsSectionView section="ai_usage">
            <AiUsageSection />
          </TrackSettingsSectionView>
        </>
      )}
      {!deletion.pending && !deletion.completed && (
        <SecuritySection key={user?.uid} inline user={user} />
      )}
      {/* The exports, once each. #1923 rendered them here beside a copy
          AccountSection already carried, and the screen showed six rows;
          `SettingsAccount.test.tsx` counts them on the composed page. */}
      {settled && (
        <TrackSettingsSectionView section="data_storage">
          <div className="space-y-4">
            <DataExportSection user={user} />
            <SettingsGroup title="Recently deleted">
              <SettingsRow
                icon={Trash2}
                label="Recently deleted meals"
                description="Restore or delete permanently"
                onClick={() => navigate("/settings/recently-deleted-meals")}
              />
            </SettingsGroup>
          </div>
        </TrackSettingsSectionView>
      )}
      <AccountSection inline user={user} signOut={leave} />
    </SettingsSection>
  );
}
