/** Apple Health nested settings page: steps, and Watch runs and export in a
 *  build with connected training. */
import SettingsSection from "@/components/settings/SettingsSection";
import HealthSection from "@/components/settings/HealthSection";
import { CONNECTED_TRAINING_RELEASED } from "@/lib/connectedTrainingRelease";

export default function SettingsHealth() {
  return (
    <SettingsSection
      title="Apple Health"
      subtitle={
        CONNECTED_TRAINING_RELEASED
          ? "Steps, Watch runs, workout export"
          : "Daily step count on Home"
      }
      section="health"
    >
      <HealthSection inline />
    </SettingsSection>
  );
}
