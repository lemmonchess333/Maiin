import { Link } from "react-router-dom";
import { Footprints, ChevronRight } from "lucide-react";
import { useShoes, type Shoe } from "@/hooks/useShoes";

function MileagePill({ shoe }: { shoe: Shoe }) {
  const pct = Math.min((shoe.totalKm / shoe.maxKm) * 100, 100);
  // Wear sentiment → AA-tuned status tokens (see MileageBar in ShoesManager):
  // fresh → success, mid-life → warning, overdue → destructive.
  const wearClass =
    pct < 60 ? "bg-success" : pct < 85 ? "bg-warning" : "bg-destructive";
  const remainingKm = Math.max(0, Math.round(shoe.maxKm - shoe.totalKm));

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground truncate">
          {shoe.name}
          {shoe.isDefault && (
            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Default
            </span>
          )}
        </p>
        <p className="text-xs font-mono tabular-nums text-muted-foreground shrink-0">
          {Math.round(shoe.totalKm)} / {shoe.maxKm} km
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${wearClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {pct >= 85 && (
        <p
          className={`text-xs ${pct >= 100 ? "text-destructive" : "text-warning"}`}
        >
          {pct >= 100
            ? "Time to replace"
            : `${remainingKm} km until replacement`}
        </p>
      )}
    </div>
  );
}

export default function ShoeMileageSection() {
  const { activeShoes, loading } = useShoes();

  if (loading) return null;
  if (activeShoes.length === 0) return null;

  return (
    <Link
      to="/settings"
      className="block rounded-2xl bg-card p-4 space-y-3 active:scale-[0.98] transition-transform"
      style={{ boxShadow: "var(--ds-shadow-card)" }}
    >
      <div className="flex items-center gap-2">
        <Footprints className="size-4 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">
          Shoe Mileage
        </p>
        <ChevronRight className="size-4 text-muted-foreground/60" />
      </div>
      <div className="space-y-3">
        {activeShoes.slice(0, 3).map((shoe) => (
          <MileagePill key={shoe.id} shoe={shoe} />
        ))}
      </div>
      {activeShoes.length > 3 && (
        <p className="text-xs text-muted-foreground text-center">
          +{activeShoes.length - 3} more in Settings
        </p>
      )}
    </Link>
  );
}
