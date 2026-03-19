import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { exportWorkoutsCSV, exportMealsCSV, exportBodyweightCSV, downloadCSV } from "@/lib/export";
import type { User } from "firebase/auth";

interface DataExportSectionProps {
  user: User | null;
}

export default function DataExportSection({ user }: DataExportSectionProps) {
  const [exporting, setExporting] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {[
        { label: "Export Workouts (CSV)", key: "workouts" },
        { label: "Export Meals (CSV)", key: "meals" },
        { label: "Export Bodyweight (CSV)", key: "bodyweight" },
      ].map(({ label, key }) => (
        <button
          key={key}
          disabled={exporting !== null}
          onClick={async () => {
            if (!user) return;
            setExporting(key);
            try {
              let csv: string;
              if (key === "workouts") csv = await exportWorkoutsCSV(user.uid);
              else if (key === "meals") csv = await exportMealsCSV(user.uid);
              else csv = await exportBodyweightCSV(user.uid);
              downloadCSV(csv, `tropos-${key}-${new Date().toISOString().split("T")[0]}.csv`);
              toast.success(`${key.charAt(0).toUpperCase() + key.slice(1)} exported!`);
            } catch (err) {
              toast.error("Export failed");
              console.error(err);
            }
            setExporting(null);
          }}
          className="w-full p-3 rounded-xl bg-card border border-border text-sm text-left hover:bg-muted transition-colors disabled:opacity-50"
        >
          {exporting === key ? "Exporting..." : label}
        </button>
      ))}
    </div>
  );
}
