/** SettingsShoes — My shoes nested page (Set1.2). */
import SettingsSection from "@/components/settings/SettingsSection";
import ShoesSection from "@/components/settings/ShoesSection";

export default function SettingsShoes() {
  return (
    <SettingsSection
      title="My shoes"
      subtitle="Track mileage, get replacement alerts"
      section="shoes"
    >
      <ShoesSection inline />
    </SettingsSection>
  );
}
