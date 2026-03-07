import { useShoes } from "@/hooks/useShoes";
import { Footprints } from "lucide-react";

interface Props {
  selectedShoeId: string | null;
  onSelect: (shoeId: string) => void;
}

export default function ShoeSelector({ selectedShoeId, onSelect }: Props) {
  const { activeShoes, defaultShoe, loading } = useShoes();

  if (loading || activeShoes.length === 0) return null;

  const selected = selectedShoeId
    ? activeShoes.find((s) => s.id === selectedShoeId) ?? defaultShoe
    : defaultShoe;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card">
      <Footprints className="w-4 h-4 text-muted-foreground shrink-0" />
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
