import { useRef, useState } from "react";
import { Dumbbell, FileJson, Scale, Upload, Utensils } from "lucide-react";
import type { User } from "firebase/auth";
import { SettingsGroup, SettingsRow } from "./SettingsList";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import type { DistanceUnit } from "@/lib/distanceUnits";

const MAX_GPX_BYTES = 15 * 1024 * 1024;
const MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_WEIGHT_CSV_BYTES = 5 * 1024 * 1024;
const MAX_NUTRITION_CSV_BYTES = 10 * 1024 * 1024;
const MAX_ARCHIVE_JSON_BYTES = 25 * 1024 * 1024;

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
  const [importingNutrition, setImportingNutrition] = useState(false);
  const [importingArchive, setImportingArchive] = useState(false);
  const gpxInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const weightInputRef = useRef<HTMLInputElement>(null);
  const nutritionInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);

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
      const [{ GpxImportError, importRunFile }, { distanceLabel2 }] =
        await Promise.all([
          import("@/lib/gpxImport"),
          import("@/lib/runLabels"),
        ]);
      try {
        const result = await importRunFile(user.uid, xml, {
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
          toast.error("Couldn’t import this run file. Try again.");
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

  const handleNutritionCsvChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;

    if (file.size > MAX_NUTRITION_CSV_BYTES) {
      toast.error("This file is too large to import.");
      return;
    }

    setImportingNutrition(true);
    try {
      const csvText = await file.text();
      const { NutritionCsvImportError, importNutritionCsv } =
        await import("@/lib/nutritionCsvImport");
      try {
        const result = await importNutritionCsv(user.uid, csvText);
        const unit = result.importedCount === 1 ? "meal" : "meals";
        toast.success(`Imported ${result.importedCount} ${unit}`);
      } catch (err) {
        if (err instanceof NutritionCsvImportError) {
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
      setImportingNutrition(false);
    }
  };

  const handleArchiveJsonChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;

    if (file.size > MAX_ARCHIVE_JSON_BYTES) {
      toast.error("This backup file is too large to import.");
      return;
    }

    setImportingArchive(true);
    try {
      const jsonText = await file.text();
      const { JsonArchiveImportError, importFullBackupJson } =
        await import("@/lib/jsonArchiveImport");
      try {
        const result = await importFullBackupJson(user.uid, jsonText, {
          weightKg,
        });
        const unit = result.totalItems === 1 ? "record" : "records";
        toast.success(`Restored ${result.totalItems} ${unit} from backup`);
      } catch (err) {
        if (err instanceof JsonArchiveImportError) {
          toast.error(err.message);
        } else {
          toast.error("Couldn’t restore this backup file. Try again.");
          logger.error(err);
        }
      }
    } catch (err) {
      toast.error("Couldn’t read this file. Try again.");
      logger.error(err);
    } finally {
      setImportingArchive(false);
    }
  };

  return (
    <SettingsGroup title="Import">
      <input
        ref={gpxInputRef}
        type="file"
        data-import-kind="gpx"
        accept=".gpx,.tcx,application/gpx+xml,application/vnd.garmin.tcx+xml,application/xml,text/xml"
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
      <input
        ref={nutritionInputRef}
        type="file"
        data-import-kind="nutrition-csv"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleNutritionCsvChange}
      />
      <input
        ref={archiveInputRef}
        type="file"
        data-import-kind="archive-json"
        accept=".json,application/json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleArchiveJsonChange}
      />
      <SettingsRow
        icon={Upload}
        label="Import GPX or TCX run"
        description="Add runs from Strava, Garmin, Coros or other apps"
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
      <SettingsRow
        icon={Utensils}
        label="Import nutrition CSV"
        description="Add meals from MyFitnessPal, Cronometer, Lose It! or Tropos"
        value={importingNutrition ? "Importing…" : undefined}
        chevron={false}
        disabled={importingNutrition || !user}
        onClick={() => nutritionInputRef.current?.click()}
      />
      <SettingsRow
        icon={FileJson}
        label="Import backup JSON"
        description="Restore workouts, runs, meals and weight from a Tropos backup"
        value={importingArchive ? "Restoring…" : undefined}
        chevron={false}
        disabled={importingArchive || !user}
        onClick={() => archiveInputRef.current?.click()}
      />
    </SettingsGroup>
  );
}
