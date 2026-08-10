/** SettingsAccount — Account / Data nested page (Set1.2). */
import { useAuth } from "@/lib/auth";
import SettingsSection from "@/components/settings/SettingsSection";
import AccountSection from "@/components/settings/AccountSection";
import SecuritySection from "@/components/settings/SecuritySection";
import DataExportSection from "@/components/settings/DataExportSection";

export default function SettingsAccount() {
  const { user, signOut } = useAuth();

  return (
    <SettingsSection
      title="Account"
      subtitle="Sign-in, data export, delete account"
    >
      <SecuritySection inline user={user} />
      {/*
        This page's subtitle has promised "data export" since Set1.2 while
        rendering nothing that exports anything — `DataExportSection` was
        built over `src/lib/export.ts` and reached by nothing (#1921). The
        page advertised the feature, so it is also where it belongs.

        Above the destructive block deliberately: taking your data with
        you is the thing you may want to do BEFORE deleting the account,
        and putting it after would make the export easy to miss for the
        one user who most needs it.
      */}
      <DataExportSection user={user} />
      <AccountSection inline user={user} signOut={signOut} />
    </SettingsSection>
  );
}
