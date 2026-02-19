import { useState, useRef } from "react";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { cn } from "@/lib/utils";
import { Camera, Image, Loader2, RotateCcw, Save, Check, X } from "lucide-react";
import { doc, setDoc, Timestamp, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

interface Props {
  date: string;
  onSaved?: () => void;
}

export default function FoodAnalyzer({ date, onSaved }: Props) {
  const { user } = useAuth();
  const { analyzeFood, loading, error, result, reset } = useFoodAnalysis();
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      await analyzeFood(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleSave = async () => {
    if (!user || !result) return;
    setSaving(true);
    const mealRef = doc(collection(db, "users", user.uid, "meals"));
    await setDoc(mealRef, {
      date,
      foodName: result.foodName,
      items: result.items,
      totalCalories: result.totalCalories,
      totalProtein: result.totalProtein,
      totalCarbs: result.totalCarbs,
      totalFat: result.totalFat,
      confidence: result.confidence,
      createdAt: Timestamp.now(),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      handleReset();
      onSaved?.();
    }, 1500);
  };

  const handleReset = () => {
    setPreview(null);
    reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleInputChange} className="hidden" />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleInputChange} className="hidden" />

      {!preview && !result && (
        <div className="space-y-3">
          <button onClick={() => cameraInputRef.current?.click()} className="w-full py-4 rounded-xl border-2 border-dashed border-primary/30 text-primary font-medium text-sm hover:bg-primary/5 transition-colors flex items-center justify-center gap-2">
            <Camera className="w-5 h-5" /> Take Photo
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="w-full py-4 rounded-xl border-2 border-dashed border-border text-muted-foreground font-medium text-sm hover:bg-muted/50 transition-colors flex items-center justify-center gap-2">
            <Image className="w-5 h-5" /> Upload from Gallery
          </button>
        </div>
      )}

      {preview && (
        <div className="relative rounded-xl overflow-hidden">
          <img src={preview} alt="Food" className="w-full h-48 object-cover" />
          {!loading && !result && (
            <button onClick={handleReset} className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Analyzing your food...
        </div>
      )}

      {error && (
        <div className="bg-red-50 rounded-xl p-4 space-y-2">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={handleReset} className="text-sm text-red-500 font-medium flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{result.foodName}</h3>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", result.confidence === "high" ? "bg-green-100 text-green-700" : result.confidence === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700")}>{result.confidence}</span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-orange-50 rounded-lg p-2">
                <p className="text-lg font-bold text-orange-600">{result.totalCalories}</p>
                <p className="text-xs text-orange-500">cal</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-2">
                <p className="text-lg font-bold text-blue-600">{result.totalProtein}g</p>
                <p className="text-xs text-blue-500">protein</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-2">
                <p className="text-lg font-bold text-amber-600">{result.totalCarbs}g</p>
                <p className="text-xs text-amber-500">carbs</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-2">
                <p className="text-lg font-bold text-purple-600">{result.totalFat}g</p>
                <p className="text-xs text-purple-500">fat</p>
              </div>
            </div>

            {result.items.length > 1 && (
              <div className="space-y-1 pt-1">
                <p className="text-xs font-medium text-muted-foreground">Breakdown</p>
                {result.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.name} ({item.portionSize})</span>
                    <span>{item.calories} cal</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={handleReset} className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4" /> Retake
            </button>
            <button onClick={handleSave} disabled={saving} className={cn("flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2", saved ? "bg-green-500 text-white" : "bg-primary text-primary-foreground hover:opacity-90", saving && "opacity-50 cursor-not-allowed")}>
              {saved ? (<><Check className="w-4 h-4" /> Saved!</>) : saving ? "Saving..." : (<><Save className="w-4 h-4" /> Save Meal</>)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
