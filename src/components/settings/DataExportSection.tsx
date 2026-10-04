import { useState } from "react";
import { Download } from "lucide-react";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import { toast } from "@/lib/toast";
import {
  exportWorkoutsCSV,
  exportMealsCSV,
  exportBodyweightCSV,
  csvFile,
} from "@/lib/export";
import { shareFile } from "@/lib/shareFile";
import type { User } from "firebase/auth";
import { logger } from "@/lib/logger";
import { localDateString } from "@/lib/dateHelpers";

interface DataExportSectionProps {
  user: User | null;
}

const EXPORTS = [
  { label: "Export workouts", key: "workouts", name: "Workouts" },
  { label: "Export meals", key: "meals", name: "Meals" },
  { label: "Export bodyweight", key: "bodyweight", name: "Bodyweight" },
] as const;

/**
 * Hand an export to the person and say how it went. On the iPhone that is
 * the share sheet (Save to Files, Mail…); on the web, the share sheet where
 * there is one, else a download. "Exported" is said only when the file was
 * shared or downloaded; a dismissed sheet says nothing.
 *
 * The export reads Firestore before it can share, and a share sheet opens
 * only close behind the tap that asked for it. When the read took that
 * time up ("blocked"), the file is ready and a Share button on the toast
 * is the fresh tap that opens the sheet.
 */
async function deliver(file: File, name: string): Promise<void> {
  const outcome = await shareFile(file);
  if (outcome === "shared" || outcome === "downloaded") {
    toast.success(`${name} exported`);
  } else if (outcome === "blocked") {
    toast(`${name} export ready`, {
      duration: 10_000,
      action: { label: "Share", onClick: () => void deliver(file, name) },
    });
  } else if (outcome === "failed") {
    toast.error("Couldn't export your data. Try again.");
  }
}

export default function DataExportSection({ user }: DataExportSectionProps) {
  const [exporting, setExporting] = useState<string | null>(null);

  return (
    <SettingsGroup
      title="Export"
      footer="Each export saves a CSV file you can open in a spreadsheet."
    >
      {EXPORTS.map(({ label, key, name }) => (
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
              await deliver(
                csvFile(csv, `tropos-${key}-${localDateString()}.csv`),
                name
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
