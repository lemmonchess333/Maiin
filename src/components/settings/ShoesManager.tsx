import { useMemo, useState } from "react";
import { useShoes, type Shoe } from "@/hooks/useShoes";
import { cn } from "@/lib/utils";
import { Plus, Star, Archive, Footprints, RotateCw } from "lucide-react";
import { toast } from "@/lib/toast";
import { searchShoes, type ShoeModel } from "@/lib/shoeDatabase";
import { logger } from "@/lib/logger";
import { Spinner } from "@/components/ui/Spinner";

function MileageBar({ shoe }: { shoe: Shoe }) {
  const pct = Math.min((shoe.totalKm / shoe.maxKm) * 100, 100);
  const color = pct < 60 ? "#22c55e" : pct < 85 ? "#f59e0b" : "#ef4444";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">
          {Math.round(shoe.totalKm)} km
        </span>
        <span className="text-muted-foreground">{shoe.maxKm} km</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default function ShoesManager() {
  const {
    shoes,
    activeShoes,
    addShoe,
    retireShoe,
    setDefault,
    reconcileMileageFromRuns,
    loading,
    error,
  } = useShoes();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newMax, setNewMax] = useState("600");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Only show suggestions when the user is actively typing into the name
  // field and hasn't yet picked an exact match (substring match against
  // the current query, not an identity check — once you've picked
  // "Pegasus 41" the exact string becomes your own query, so we close
  // the panel rather than keep offering the same row).
  const suggestions = useMemo<ShoeModel[]>(() => {
    if (!showSuggestions || !newName.trim()) return [];
    const matches = searchShoes(newName, 6);
    if (
      matches.length === 1 &&
      matches[0].name.toLowerCase() === newName.trim().toLowerCase()
    ) {
      return [];
    }
    return matches;
  }, [newName, showSuggestions]);

  const handleSelectSuggestion = (shoe: ShoeModel) => {
    setNewName(shoe.name);
    setNewBrand(shoe.brand);
    setNewMax(String(shoe.recommendedMaxKm));
    setShowSuggestions(false);
  };

  // One-shot reconciler for users whose mileage may have drifted while the
  // auto-assign-default-shoe bug was live. Safe to re-run: it rebuilds
  // totals from `runs` rather than incrementing, so repeated taps converge
  // on the same number.
  const handleRecalculate = async () => {
    if (recalculating) return;
    setRecalculating(true);
    try {
      const { totalRuns } = await reconcileMileageFromRuns();
      toast.success(
        totalRuns > 0
          ? `Recalculated mileage from ${totalRuns} run${totalRuns === 1 ? "" : "s"}.`
          : "No runs yet — nothing to recalculate."
      );
    } catch (err) {
      logger.error("[ShoesManager] reconcileMileageFromRuns failed", err);
      toast.error("Couldn't recalculate mileage. Please try again.");
    } finally {
      setRecalculating(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center gap-2 py-4">
        <Spinner size="sm" variant="primary" label="Loading shoes" />
        <p className="text-xs text-muted-foreground">Loading shoes...</p>
      </div>
    );

  if (error)
    return (
      <div className="text-center py-4">
        <p className="text-xs text-destructive">Failed to load shoes</p>
        <p className="text-xs text-muted-foreground mt-1">
          Please try again later
        </p>
      </div>
    );

  const retired = shoes.filter((s) => s.retired);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addShoe(newName.trim(), newBrand.trim(), Number(newMax) || 600);
    setNewName("");
    setNewBrand("");
    setNewMax("600");
    setShowAdd(false);
    setShowSuggestions(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Footprints className="size-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">My Shoes</h3>
        </div>
        <div className="flex items-center gap-3">
          {activeShoes.length > 0 && (
            <button
              type="button"
              onClick={handleRecalculate}
              disabled={recalculating}
              aria-label="Recalculate mileage from run history"
              className="flex items-center gap-1 text-xs text-muted-foreground font-medium disabled:opacity-50"
            >
              <RotateCw
                className={cn("size-3.5", recalculating && "animate-spin")}
              />
              {recalculating ? "Recalculating…" : "Recalculate"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 text-xs text-primary font-medium"
          >
            <Plus className="size-3.5" /> Add
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="p-3 rounded-xl bg-card border border-border space-y-3">
          {/* Name with typeahead — the panel sits above the brand field
              via absolute positioning so it never pushes layout. Brand
              and max-km auto-fill when the user picks a known model. */}
          <div className="relative">
            <input
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                // 150ms delay so a mousedown on the suggestion row fires
                // first (otherwise the onBlur hides the panel before the
                // click handler can run).
                window.setTimeout(() => setShowSuggestions(false), 150);
              }}
              placeholder="Shoe name (e.g., Pegasus 41)"
              aria-label="Shoe name"
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm"
            />
            {suggestions.length > 0 && (
              <div
                role="listbox"
                aria-label="Shoe suggestions"
                className="absolute left-0 right-0 top-full mt-1 z-10 rounded-xl bg-card border border-border shadow-lg overflow-hidden"
              >
                {suggestions.map((s) => (
                  <button
                    key={`${s.brand}-${s.name}`}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectSuggestion(s)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors flex items-center justify-between gap-2 border-b border-border/40 last:border-0"
                  >
                    <span className="text-sm text-foreground">{s.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {s.brand}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            type="text"
            value={newBrand}
            onChange={(e) => setNewBrand(e.target.value)}
            placeholder="Brand (e.g., Nike)"
            aria-label="Brand"
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm"
          />

          {/* Max km — previously only had "Max km" as a placeholder which
              disappeared once the user typed, leaving "600" unexplained.
              The label + helper text make it clear this is the
              replacement-alert threshold, not some mystery number. */}
          <div className="space-y-1">
            <label
              htmlFor="shoe-max-km"
              className="block text-xs font-medium text-foreground"
            >
              Replace at
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  id="shoe-max-km"
                  type="number"
                  inputMode="numeric"
                  min={50}
                  value={newMax}
                  onChange={(e) => setNewMax(e.target.value)}
                  aria-describedby="shoe-max-km-hint"
                  className="w-full px-3 py-2 pr-10 rounded-lg bg-muted border border-border text-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  km
                </span>
              </div>
              <button
                type="button"
                onClick={handleAdd}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              >
                Save
              </button>
            </div>
            <p id="shoe-max-km-hint" className="text-xs text-muted-foreground">
              We'll flag the shoe for replacement at this mileage. Most daily
              trainers last 500–800 km; racing flats closer to 250.
            </p>
          </div>
        </div>
      )}

      {activeShoes.length === 0 && !showAdd && (
        <div className="py-4 text-center space-y-1">
          <p className="text-xs font-medium text-foreground">
            No shoes added yet
          </p>
          <p className="text-xs text-muted-foreground">
            Track your mileage to know when to replace them
          </p>
        </div>
      )}

      {activeShoes.map((shoe) => (
        <div
          key={shoe.id}
          className="p-3 rounded-xl bg-card border border-border space-y-2"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{shoe.name}</p>
              {shoe.brand && (
                <p className="text-xs text-muted-foreground">{shoe.brand}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDefault(shoe.id)}
                className={cn(
                  "size-11 inline-flex items-center justify-center rounded-lg transition-colors",
                  shoe.isDefault
                    ? "text-achievement"
                    : "text-muted-foreground hover:text-achievement"
                )}
                title="Set as default"
              >
                <Star
                  className="size-4"
                  fill={shoe.isDefault ? "currentColor" : "none"}
                />
              </button>
              <button
                type="button"
                onClick={() => retireShoe(shoe.id)}
                className="size-11 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                title="Retire shoe"
              >
                <Archive className="size-4" />
              </button>
            </div>
          </div>
          <MileageBar shoe={shoe} />
        </div>
      ))}

      {retired.length > 0 && (
        <div className="pt-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mb-2">
            Retired
          </p>
          {retired.map((shoe) => (
            <div
              key={shoe.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 mb-1 opacity-60"
            >
              <div>
                <p className="text-xs text-foreground">{shoe.name}</p>
                <p className="text-xs text-muted-foreground">
                  {Math.round(shoe.totalKm)} km logged
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
