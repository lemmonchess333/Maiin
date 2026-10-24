import { useShoes } from "@/hooks/useShoes";
import { Footprints, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { storedKmLabel } from "@/lib/runLabels";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import Select from "@/components/ui/Select";

interface Props {
  selectedShoeId: string | null;
  onSelect: (shoeId: string) => void;
}

export default function ShoeSelector({ selectedShoeId, onSelect }: Props) {
  const unit = useDistanceUnit();
  const { activeShoes, defaultShoe, loading } = useShoes();
  const navigate = useNavigate();

  if (loading) return null;

  /* Phase B2: no-shoes affordance. Pre-B2 this returned null on an
   * empty shoe list, so users with no shoes couldn't discover that
   * shoe-mileage tracking exists. Now we render a single-line CTA
   * that deep-links straight to the focused Shoes page (/settings/shoes,
   * where ShoesManager lives) instead of the generic Settings list —
   * same one-tap-to-the-right-place pattern as the Food gear. Light-
   * touch — same card shape as the populated state so the layout
   * doesn't shift after adding the first pair. */
  if (activeShoes.length === 0) {
    return (
      <button
        type="button"
        onClick={() => navigate("/settings/shoes")}
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 p-3 rounded-xl border border-border/50 bg-card text-left active:scale-[0.98] transition-transform"
      >
        <Footprints className="size-4 text-muted-foreground shrink-0" />
        {/* "Add shoes" goes under the words when they cannot keep 8em
            beside it (larger text on the phone), rather than off the
            card. */}
        <span className="min-w-[min(100%,8em)] flex-1 text-sm text-muted-foreground">
          Track your shoe mileage
        </span>
        <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-lifting-strong">
          <Plus className="size-3.5" aria-hidden="true" />
          Add shoes
        </span>
      </button>
    );
  }

  const selected = selectedShoeId
    ? (activeShoes.find((s) => s.id === selectedShoeId) ?? defaultShoe)
    : defaultShoe;

  return (
    <Select
      aria-label="Shoe"
      value={selected?.id ?? ""}
      onChange={(e) => onSelect(e.target.value)}
      icon={<Footprints className="size-4" />}
    >
      {activeShoes.map((shoe) => (
        <option key={shoe.id} value={shoe.id}>
          {shoe.name} — {storedKmLabel(shoe.totalKm, unit)}
        </option>
      ))}
    </Select>
  );
}
