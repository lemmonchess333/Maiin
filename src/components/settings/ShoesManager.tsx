import { useState } from "react";
import { useShoes, type Shoe } from "@/hooks/useShoes";
import { cn } from "@/lib/utils";
import { Plus, Star, Archive, Footprints } from "lucide-react";

function MileageBar({ shoe }: { shoe: Shoe }) {
  const pct = Math.min((shoe.totalKm / shoe.maxKm) * 100, 100);
  const color = pct < 60 ? "#22c55e" : pct < 85 ? "#f59e0b" : "#ef4444";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{Math.round(shoe.totalKm)} km</span>
        <span className="text-muted-foreground">{shoe.maxKm} km</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function ShoesManager() {
  const { shoes, activeShoes, addShoe, retireShoe, setDefault, loading } = useShoes();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newMax, setNewMax] = useState("600");

  if (loading) return <p className="text-xs text-muted-foreground animate-pulse">Loading shoes...</p>;

  const retired = shoes.filter((s) => s.retired);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addShoe(newName.trim(), newBrand.trim(), Number(newMax) || 600);
    setNewName("");
    setNewBrand("");
    setNewMax("600");
    setShowAdd(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Footprints className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">My Shoes</h3>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-xs text-primary font-medium"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {showAdd && (
        <div className="p-3 rounded-xl bg-card border border-border space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Shoe name (e.g., Pegasus 41)"
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm"
          />
          <input
            type="text"
            value={newBrand}
            onChange={(e) => setNewBrand(e.target.value)}
            placeholder="Brand (e.g., Nike)"
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm"
          />
          <div className="flex gap-2">
            <input
              type="number"
              value={newMax}
              onChange={(e) => setNewMax(e.target.value)}
              placeholder="Max km"
              className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm"
            />
            <button
              onClick={handleAdd}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {activeShoes.length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground py-2">No shoes added yet — track your mileage to know when to replace them.</p>
      )}

      {activeShoes.map((shoe) => (
        <div key={shoe.id} className="p-3 rounded-xl bg-card border border-border space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{shoe.name}</p>
              {shoe.brand && <p className="text-xs text-muted-foreground">{shoe.brand}</p>}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDefault(shoe.id)}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  shoe.isDefault ? "text-yellow-500" : "text-muted-foreground hover:text-yellow-500"
                )}
                title="Set as default"
              >
                <Star className="w-4 h-4" fill={shoe.isDefault ? "currentColor" : "none"} />
              </button>
              <button
                onClick={() => retireShoe(shoe.id)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 transition-colors"
                title="Retire shoe"
              >
                <Archive className="w-4 h-4" />
              </button>
            </div>
          </div>
          <MileageBar shoe={shoe} />
        </div>
      ))}

      {retired.length > 0 && (
        <div className="pt-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mb-2">Retired</p>
          {retired.map((shoe) => (
            <div key={shoe.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 mb-1 opacity-60">
              <div>
                <p className="text-xs text-foreground">{shoe.name}</p>
                <p className="text-xs text-muted-foreground">{Math.round(shoe.totalKm)} km logged</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
