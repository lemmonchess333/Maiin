/** SettingsHealth — Apple Health nested page (Set1.2 IA).
 *
 * Surface C of the HealthKit steps work: the recoverable discovery
 * surface. The original draft mounted HealthSection inside the old
 * single-page Settings accordion; the nested-settings migration made
 * every section its own route, so it lands here instead. On web the
 * section renders its "available in the Tropos iOS app" state — the
 * web-visible path CLAUDE.md's parity rule requires, not a dead end.
 */
import SettingsSection from "@/components/settings/SettingsSection";
import HealthSection from "@/components/settings/HealthSection";

export default function SettingsHealth() {
  return (
    <SettingsSection
      title="Apple Health"
      subtitle="Daily step count on Home"
      section="health"
    >
      <HealthSection inline />
    </SettingsSection>
  );
}
