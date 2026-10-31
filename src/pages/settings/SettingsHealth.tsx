/** Apple Health nested settings page: steps, Watch runs, and export. */
import SettingsSection from "@/components/settings/SettingsSection";
import HealthSection from "@/components/settings/HealthSection";

export default function SettingsHealth() {
  return (
    <SettingsSection
      title="Apple Health"
      subtitle="Steps, Watch runs, workout export"
      section="health"
    >
      <HealthSection inline />
    </SettingsSection>
  );
}
