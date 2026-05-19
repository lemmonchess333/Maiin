/** SettingsSupportLegal — Support & Legal nested page (Set1.2). */
import SettingsSection from "@/components/settings/SettingsSection";
import SupportLegalSection from "@/components/settings/SupportLegalSection";

export default function SettingsSupportLegal() {
  return (
    <SettingsSection title="Support & Legal" subtitle="Help, privacy policy, terms">
      <SupportLegalSection inline />
    </SettingsSection>
  );
}
