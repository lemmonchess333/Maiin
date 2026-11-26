import { useRef, useState } from "react";
import { Dumbbell, Scale, Upload } from "lucide-react";
import type { User } from "firebase/auth";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import type { DistanceUnit } from "@/lib/distanceUnits";

const MAX_GPX_BYTES = 15 * 1024 * 1024;
const MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_WEIGHT_CSV_BYTES = 5 * 1024 * 1024;

interface DataImportSectionProps {
  user: User | null;
  distanceUnit?: DistanceUnit;
  liftWeightUnit?: "kg" | "lbs";
  bodyWeightUnit?: "kg" | "lbs";
  weightKg?: number;
  maxHeartRate?: number | null;
  age?: number;
}

export default function DataImportSection({
  user,
  distanceUnit = "km",
  liftWeightUnit = "kg",
  bodyWeightUnit = "kg",
  weightKg,
  maxHeartRate,
  age,
}: DataImportSectionProps) {
  const [importingGpx, setImportingGpx] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [importingWeight, setImportingWeight] = useState(false);
  const gpxInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const weightInputRef = useRef<HTMLInputElement>(null);

  const handleGpxChange = async (
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

    setImportingGpx(true);
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
      setImportingGpx(false);
    }
  };

  const handleCsvChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;

    if (file.size > MAX_CSV_BYTES) {
      toast.error("This file is too large to import.");
      return;
    }

    setImportingCsv(true);
    try {
      const csvText = await file.text();
      const { WorkoutCsvImportError, importWorkoutsCsv } =
        await import("@/lib/workoutCsvImport");
      try {
        const result = await importWorkoutsCsv(user.uid, csvText, {
          weightKg,
          defaultWeightUnit: liftWeightUnit,
        });
        const unit = result.importedCount === 1 ? "workout" : "workouts";
        toast.success(`Imported ${result.importedCount} ${unit}`);
      } catch (err) {
        if (err instanceof WorkoutCsvImportError) {
          toast.error(err.message);
        } else {
          toast.error("Couldn’t import this CSV file. Try again.");
          logger.error(err);
        }
      }
    } catch (err) {
      toast.error("Couldn’t read this file. Try again.");
      logger.error(err);
    } finally {
      setImportingCsv(false);
    }
  };

  const handleWeightCsvChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;

    if (file.size > MAX_WEIGHT_CSV_BYTES) {
      toast.error("This file is too large to import.");
      return;
    }

    setImportingWeight(true);
    try {
      const csvText = await file.text();
      const { BodyweightCsvImportError, importBodyweightCsv } =
        await import("@/lib/bodyweightCsvImport");
      try {
        const result = await importBodyweightCsv(user.uid, csvText, {
          defaultWeightUnit: bodyWeightUnit,
        });
        const unit = result.importedCount === 1 ? "weigh-in" : "weigh-ins";
        toast.success(`Imported ${result.importedCount} ${unit}`);
      } catch (err) {
        if (err instanceof BodyweightCsvImportError) {
          toast.error(err.message);
        } else {
          toast.error("Couldn’t import this CSV file. Try again.");
          logger.error(err);
        }
      }
    } catch (err) {
      toast.error("Couldn’t read this file. Try again.");
      logger.error(err);
    } finally {
      setImportingWeight(false);
    }
  };

  return (
    <SettingsGroup title="Import">
      <input
        ref={gpxInputRef}
        type="file"
        data-import-kind="gpx"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleGpxChange}
      />
      <input
        ref={csvInputRef}
        type="file"
        data-import-kind="workout-csv"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleCsvChange}
      />
      <input
        ref={weightInputRef}
        type="file"
        data-import-kind="weight-csv"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleWeightCsvChange}
      />
      <SettingsRow
        icon={Upload}
        label="Import GPX run"
        description="Add runs from Strava, Garmin or other apps"
        value={importingGpx ? "Importing…" : undefined}
        chevron={false}
        disabled={importingGpx || !user}
        onClick={() => gpxInputRef.current?.click()}
      />
      <SettingsRow
        icon={Dumbbell}
        label="Import lifting CSV"
        description="Add workouts from Hevy, Strong or Tropos"
        value={importingCsv ? "Importing…" : undefined}
        chevron={false}
        disabled={importingCsv || !user}
        onClick={() => csvInputRef.current?.click()}
      />
      <SettingsRow
        icon={Scale}
        label="Import weight CSV"
        description="Add weigh-ins from Happy Scale, Withings, Renpho or Tropos"
        value={importingWeight ? "Importing…" : undefined}
        chevron={false}
        disabled={importingWeight || !user}
        onClick={() => weightInputRef.current?.click()}
      />
    </SettingsGroup>
  );
}
