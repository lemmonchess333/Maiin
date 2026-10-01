/**
 * SettingsData — "Your data" (Set1's Data & Storage section).
 *
 * The exports sat on the Account page between "Change email" and
 * "Sign out", and Recently deleted meals had its own row at the foot of the
 * Settings list. Set1 placed both in Data & Storage, and Home2/Food6 put
 * the deleted-meals archive there too, so this page is where they meet.
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
