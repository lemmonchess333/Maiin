import { motion } from "framer-motion";
import { Save, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScheduleSectionProps {
  hasAnyUnsavedChanges: boolean;
  saving: boolean;
  saved: boolean;
  handleSave: () => Promise<void>;
}

export default function ScheduleSection({
  hasAnyUnsavedChanges,
  saving,
  saved,
  handleSave,
}: ScheduleSectionProps) {
  return (
    <>
      {/* Unsaved changes warning + save button */}
      {hasAnyUnsavedChanges && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
          <Save className="w-3.5 h-3.5 shrink-0" />
          <p className="text-xs font-medium">You have unsaved changes</p>
        </div>
      )}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={handleSave}
        disabled={saving}
        className={cn(
          "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-colors bg-purple-600 text-white font-semibold hover:bg-purple-700",
          !hasAnyUnsavedChanges && "opacity-50 cursor-not-allowed"
        )}
      >
        {saved ? (
          <>
            <Check className="w-4 h-4" />
            Saved!
          </>
        ) : saving ? (
          "Saving..."
        ) : (
          <>
            <Save className="w-4 h-4" />
            Save Changes
          </>
        )}
      </motion.button>
    </>
  );
}
