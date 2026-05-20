import { useState } from "react";
import { ChefHat, Trash2, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";
import AccordionSection from "@/components/AccordionSection";
import { useFoodFavourites } from "@/hooks/useFoodFavourites";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface SettingsPantrySectionProps {
  /** Render inline body without the accordion shell, for the nested
   *  /settings/pantry deep-link page where the parent already
   *  provides title chrome. The legacy stacked Settings page uses
   *  accordion mode (default). */
  inline?: boolean;
}

/**
 * F2d "My pantry" — Settings management surface for the user's
 * food-favourites collection. The Food page already auto-populates
 * favourites every time the user logs a meal (Food.tsx line 617
 * `addFavourite(..., source: "search")`); this surface gives the
 * user somewhere to PRUNE accumulated items, search, and see
 * usage stats.
 *
 * Backed by `useFoodFavourites` — the SAME collection driving the
 * Food page's "Quick Add" chips. The Food page label stays as
 * "Quick Add"; this is the back-stage view of the same data set.
 *
 * Edit (rename, fix macros) is deferred to a follow-up — delete is
 * the highest-value action because the auto-add behaviour can
 * accumulate typos / one-off entries the user wants gone.
 */
export default function SettingsPantrySection({
  inline = false,
}: SettingsPantrySectionProps) {
  const { favourites, loading, removeFavourite } = useFoodFavourites();
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  // Case-insensitive name + brand-free search across the favourites
  // list. Most users will have <30 entries — no need for indexing or
  // virtualisation at this scale.
  const filtered = search.trim()
    ? favourites.filter((f) =>
        f.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : favourites;

  return (
    <>
      <AccordionSection
        inline={inline}
        icon={<ChefHat className="w-5 h-5 text-primary" />}
        title="My pantry"
        subtitle={
          favourites.length > 0
            ? `${favourites.length} saved food${favourites.length === 1 ? "" : "s"}`
            : "Saved foods will appear here"
        }
      >
        {/* Search input — only renders when there are enough items
            to warrant filtering (below ~10 it's just noise). */}
        {favourites.length >= 10 && (
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your pantry"
              aria-label="Search pantry"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        )}

        {loading && favourites.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Loading…</p>
        ) : favourites.length === 0 ? (
          <p className="text-xs text-muted-foreground leading-snug">
            Log a meal on the Food page and it&rsquo;ll appear here. Saved foods
            surface as Quick Add chips so you can re-log them in one tap.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No matches for &ldquo;{search.trim()}&rdquo;.
          </p>
        ) : (
          <div className="space-y-1.5">
            <AnimatePresence initial={false}>
              {filtered.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-card border border-border/40"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(item.calories)} cal · {Math.round(item.protein)}p ·{" "}
                      {Math.round(item.carbs)}c · {Math.round(item.fat)}f
                      {item.useCount > 1 ? ` · used ${item.useCount}×` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      haptic("light");
                      setConfirmDelete({ id: item.id, name: item.name });
                    }}
                    aria-label={`Remove ${item.name} from pantry`}
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      "text-muted-foreground/70 hover:text-red-400 hover:bg-red-500/10",
                      "active:scale-90 transition-all",
                    )}
                  >
                    <Trash2 aria-hidden="true" className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </AccordionSection>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remove from pantry?"
        description={
          confirmDelete
            ? `“${confirmDelete.name}” will be removed from your saved foods. You can re-add it later by logging the meal again.`
            : ""
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        onConfirm={async () => {
          if (!confirmDelete) return;
          const { id, name } = confirmDelete;
          setConfirmDelete(null);
          await removeFavourite(id);
          toast.success(`Removed ${name}`);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}
