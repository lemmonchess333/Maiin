import { useShoes } from "@/hooks/useShoes";
import { Footprints, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  selectedShoeId: string | null;
  onSelect: (shoeId: string) => void;
}

export default function ShoeSelector({ selectedShoeId, onSelect }: Props) {
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
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card text-left active:scale-[0.98] transition-transform"
      >
        <Footprints className="size-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm text-muted-foreground">
          Track your shoe mileage
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-primary">
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
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card">
      <Footprints className="size-4 text-muted-foreground shrink-0" />
      <select
        value={selected?.id ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="flex-1 bg-transparent text-sm text-foreground appearance-none cursor-pointer focus:outline-none"
      >
        {activeShoes.map((shoe) => (
          <option key={shoe.id} value={shoe.id}>
            {shoe.name} — {Math.round(shoe.totalKm)}km
          </option>
        ))}
      </select>
    </div>
  );
}
