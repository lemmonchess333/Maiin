/** SettingsAccount — Account / Data nested page (Set1.2). */
import { useAuth } from "@/lib/auth";
import SettingsSection from "@/components/settings/SettingsSection";
import AccountSection from "@/components/settings/AccountSection";
import SecuritySection from "@/components/settings/SecuritySection";

export default function SettingsAccount() {
  const { user, signOut } = useAuth();

  return (
    <SettingsSection
      title="Account"
      subtitle="Sign-in, data export, delete account"
    >
      <SecuritySection inline user={user} />
      <AccountSection inline user={user} signOut={signOut} />
    </SettingsSection>
  );
}
