/** SettingsShoes — My Shoes nested page (Set1.2). */
import SettingsSection from "@/components/settings/SettingsSection";
import ShoesSection from "@/components/settings/ShoesSection";

export default function SettingsShoes() {
  return (
    <SettingsSection title="My Shoes" subtitle="Track mileage, get replacement alerts">
      <ShoesSection inline />
    </SettingsSection>
  );
}
