/**
 * SettingsData — "Your data", Set1's Data & Storage section: the exports
 * and the recently deleted meals, which Set1 and Home2/Food6 both place
 * here.
 */
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import SettingsSection from "@/components/settings/SettingsSection";
import DataExportSection from "@/components/settings/DataExportSection";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";

export default function SettingsData() {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <SettingsSection
      title="Your data"
      subtitle="Export what you've logged, restore deleted meals"
      section="data_storage"
    >
      <DataExportSection user={user} />
      <SettingsGroup title="Recently deleted">
        <SettingsRow
          icon={Trash2}
          label="Recently deleted meals"
          description="Restore within 24 hours"
          onClick={() => navigate("/settings/recently-deleted-meals")}
        />
      </SettingsGroup>
    </SettingsSection>
  );
}
