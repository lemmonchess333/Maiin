import { useState } from "react";
import { Download } from "lucide-react";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import { toast } from "@/lib/toast";
import {
  exportWorkoutsCSV,
  exportMealsCSV,
  exportBodyweightCSV,
  downloadCSV,
} from "@/lib/export";
import type { User } from "firebase/auth";
import { logger } from "@/lib/logger";
import { localDateString } from "@/lib/dateHelpers";

interface DataExportSectionProps {
  user: User | null;
}

export default function DataExportSection({ user }: DataExportSectionProps) {
  const [exporting, setExporting] = useState<string | null>(null);

  return (
    <SettingsGroup
      title="Export"
      footer="Each export saves a CSV file you can open in a spreadsheet."
    >
      {[
        { label: "Export workouts", key: "workouts" },
        { label: "Export meals", key: "meals" },
        { label: "Export bodyweight", key: "bodyweight" },
      ].map(({ label, key }) => (
        <SettingsRow
          key={key}
          icon={Download}
          label={label}
          value={exporting === key ? "Exporting…" : undefined}
          chevron={false}
          disabled={exporting !== null}
          onClick={async () => {
            if (!user) return;
            setExporting(key);
            try {
              let csv: string;
              if (key === "workouts") csv = await exportWorkoutsCSV(user.uid);
              else if (key === "meals") csv = await exportMealsCSV(user.uid);
              else csv = await exportBodyweightCSV(user.uid);
              downloadCSV(csv, `tropos-${key}-${localDateString()}.csv`);
              toast.success(
                `${key.charAt(0).toUpperCase() + key.slice(1)} exported`
              );
            } catch (err) {
              toast.error("Couldn't export your data. Try again.");
              logger.error(err);
            }
            setExporting(null);
          }}
        />
      ))}
    </SettingsGroup>
  );
}
