import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { User } from "firebase/auth";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import type { DistanceUnit } from "@/lib/distanceUnits";

const MAX_GPX_BYTES = 15 * 1024 * 1024;

interface DataImportSectionProps {
  user: User | null;
  distanceUnit?: DistanceUnit;
  weightKg?: number;
  maxHeartRate?: number | null;
  age?: number;
}

export default function DataImportSection({
  user,
  distanceUnit = "km",
  weightKg,
  maxHeartRate,
  age,
}: DataImportSectionProps) {
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    event.target.value = "";
    if (!file || !user) return;

    if (file.size > MAX_GPX_BYTES) {
      toast.error("This file is too large to import.");
      return;
    }

    setImporting(true);
    try {
      const xml = await file.text();
      const [{ GpxImportError, importGpxRun }, { distanceLabel2 }] =
        await Promise.all([
          import("@/lib/gpxImport"),
          import("@/lib/runLabels"),
        ]);
      try {
        const result = await importGpxRun(user.uid, xml, {
          weightKg,
          maxHr: maxHeartRate ?? undefined,
          age,
        });
        toast.success(
          `Imported ${distanceLabel2(result.distance, distanceUnit)} run`
        );
      } catch (err) {
        if (err instanceof GpxImportError) {
          toast.error(err.message);
        } else {
          toast.error("Couldn’t import this GPX file. Try again.");
          logger.error(err);
        }
      }
    } catch (err) {
      toast.error("Couldn’t read this file. Try again.");
      logger.error(err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <SettingsGroup title="Import">
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileChange}
      />
      <SettingsRow
        icon={Upload}
        label="Import GPX run"
        description="Add runs from Strava, Garmin or other apps"
        value={importing ? "Importing…" : undefined}
        chevron={false}
        disabled={importing || !user}
        onClick={() => inputRef.current?.click()}
      />
    </SettingsGroup>
  );
}
