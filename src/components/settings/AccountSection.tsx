import { useState } from "react";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import {
  Download,
  LogOut,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { exportWorkoutsCSV, exportMealsCSV, exportBodyweightCSV, downloadCSV } from "@/lib/export";
import { deleteAccount } from "@/lib/socialApi";
import AccordionSection from "@/components/AccordionSection";
import type { User } from "firebase/auth";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface AccountSectionProps {
  user: User | null;
  signOut: () => Promise<void>;
}

export default function AccountSection({
  user,
  signOut,
}: AccountSectionProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const deleteModalRef = useFocusTrap<HTMLDivElement>(showDeleteModal);

  return (
    <>
      <AccordionSection icon={<Download className="w-5 h-5 text-primary" />} title="Data & Account" subtitle="Export, sign out">
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

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={signOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </motion.button>

        {/* Account Deletion (App Store Guideline 5.1.1(v)) */}
        <button
          onClick={() => { haptic("error"); setShowDeleteModal(true); }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" /> Delete Account
        </button>
      </AccordionSection>

      {/* Delete Account Modal (App Store Guideline 5.1.1(v)) */}
      {showDeleteModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[1000]"
            role="button" tabIndex={0} aria-label="Close dialog"
            onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setShowDeleteModal(false); setDeleteConfirmText(""); } }}
          />
          <div ref={deleteModalRef} role="dialog" aria-modal="true" className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[1001] bg-card rounded-2xl p-5 space-y-4 max-w-sm mx-auto shadow-xl">
            <h3 className="text-base font-semibold text-destructive">Delete Account</h3>
            <p className="text-sm text-muted-foreground">
              This will permanently delete your account and all associated data including workouts, meals, runs, and social activity. This action cannot be undone.
            </p>
            <p className="text-sm text-foreground font-medium">
              Type <span className="text-destructive font-bold">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}
                className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!user || deleteConfirmText !== "DELETE") return;
                  setDeleting(true);
                  try {
                    await deleteAccount(user.uid);
                    toast.success("Account deleted successfully.");
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "Failed to delete account";
                    if (msg.includes("requires-recent-login")) {
                      toast.error("Please sign out and sign back in, then try again.");
                    } else {
                      toast.error(msg);
                    }
                  } finally {
                    setDeleting(false);
                    setShowDeleteModal(false);
                    setDeleteConfirmText("");
                  }
                }}
                disabled={deleteConfirmText !== "DELETE" || deleting}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Account"
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
