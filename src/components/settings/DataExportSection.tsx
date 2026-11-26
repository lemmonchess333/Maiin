import { useState } from "react";
import { Download } from "lucide-react";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import { toast } from "@/lib/toast";
import {
  exportWorkoutsCSV,
  exportRunsCSV,
  exportMealsCSV,
  exportBodyweightCSV,
  csvFile,
} from "@/lib/export";
import { shareFile } from "@/lib/shareFile";
import type { User } from "firebase/auth";
import { logger } from "@/lib/logger";
import { localDateString } from "@/lib/dateHelpers";
import {
  EMAIL_UPDATES_LIVE,
  emailConsentCsv,
  type EmailConsentRecord,
} from "@/lib/emailConsent";

interface DataExportSectionProps {
  user: User | null;
  /** The email consent record (App1 Q55), from the profile. */
  emailConsent?: EmailConsentRecord | null;
  /** Whether the emails are sent yet; tests set it. */
  emailsLive?: boolean;
}

const EXPORTS = [
  { label: "Export workouts", key: "workouts", name: "Workouts" },
  { label: "Export runs", key: "runs", name: "Runs" },
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
    toast.error("Couldn’t export your data. Try again.");
  }
}

export default function DataExportSection({
  user,
  emailConsent,
  emailsLive = EMAIL_UPDATES_LIVE,
}: DataExportSectionProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  /* The email answers are part of the person's data (App1 Q55): when, how
     and to which words they said yes or no. Offered once the emails can be
     chosen, or whenever a record exists. Built from the profile already
     loaded, so it reads nothing. */
  const emailChoices = emailsLive || !!emailConsent;

  return (
    <SettingsGroup title="Export">
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
              else if (key === "runs") csv = await exportRunsCSV(user.uid);
              else if (key === "meals") csv = await exportMealsCSV(user.uid);
              else csv = await exportBodyweightCSV(user.uid);
              await deliver(
                csvFile(csv, `tropos-${key}-${localDateString()}.csv`),
                name
              );
            } catch (err) {
              toast.error("Couldn’t export your data. Try again.");
              logger.error(err);
            }
            setExporting(null);
          }}
        />
      ))}
      {emailChoices && (
        <SettingsRow
          icon={Download}
          label="Export email choices"
          chevron={false}
          disabled={exporting !== null || !user}
          onClick={async () => {
            if (!user) return;
            await deliver(
              csvFile(
                emailConsentCsv(emailConsent),
                `tropos-email-choices-${localDateString()}.csv`
              ),
              "Email choices"
            );
          }}
        />
      )}
    </SettingsGroup>
  );
}
