/** SettingsAccount — Account / Data nested page (Set1.2). */
import { useAuth } from "@/lib/auth";
import SettingsSection from "@/components/settings/SettingsSection";
import AccountSection from "@/components/settings/AccountSection";

export default function SettingsAccount() {
  const { user, signOut } = useAuth();

  return (
    <SettingsSection title="Account" subtitle="Data export, sign out, delete account">
      <AccountSection inline user={user} signOut={signOut} />
    </SettingsSection>
  );
}
