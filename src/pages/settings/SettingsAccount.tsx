import { useAccountDeletionStatus } from "@/hooks/useAccountDeletionStatus";
/** SettingsAccount — Account / Data nested page (Set1.2). */
import { useAuth } from "@/lib/auth";
import SettingsSection from "@/components/settings/SettingsSection";
import AccountSection from "@/components/settings/AccountSection";
import SecuritySection from "@/components/settings/SecuritySection";

export default function SettingsAccount({
  duringSetup = false,
}: {
  duringSetup?: boolean;
}) {
  const { user, signOut } = useAuth();
  const deletion = useAccountDeletionStatus(user?.uid);

  return (
    <SettingsSection
      title="Account"
      subtitle="Sign-in, data export, delete account"
      section="account"
      backTo={duringSetup ? "/" : undefined}
      backLabel={duringSetup ? "Setup" : undefined}
    >
      {!deletion.pending && !deletion.completed && (
        <SecuritySection
          key={user?.uid}
          inline
          user={user}
          duringSetup={duringSetup}
        />
      )}
      {/*
        Export lives INSIDE AccountSection's "Data & account" block, not
        here. #1923 rendered DataExportSection at this level believing the
        page advertised export and shipped none — but AccountSection had
        been carrying a verbatim inline copy the whole time, so the screen
        showed six export rows. The duplication is resolved the other way
        round: AccountSection now points at the extracted component.
      */}
      <AccountSection inline user={user} signOut={signOut} />
    </SettingsSection>
  );
}
