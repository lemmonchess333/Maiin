// PASTE THIS ENTIRE FILE — overwrite everything

import { useEffect, useMemo, useState } from "react";
import { useFoodAnalysis } from "@/hooks/useFoodAnalysis";
import { cn } from "@/lib/utils";
import { Loader2, RotateCcw, Save, Check } from "lucide-react";
import { doc, setDoc, Timestamp, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import FoodCameraModal from "./FoodCameraModal";

interface Props {
  date: string;
  onSaved?: () => void;
}

export default function FoodAnalyzer({ date, onSaved }: Props) {
  const { user } = useAuth();

  const {
    analyzeFood,
    loading,
    error,
    result,
    reset,
  } = useFoodAnalysis();

  const [cameraOpen, setCameraOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!user || !result) return;

    setSaving(true);

    const mealRef = doc(collection(db, "users", user.uid, "meals"));

    await setDoc(mealRef, {
      date,
      ...result,
      createdAt: Timestamp.now(),
    });

    setSaving(false);
    setSaved(true);

    setTimeout(() => {
      setSaved(false);
      reset();
      setCameraOpen(false);
      onSaved?.();
    }, 1200);
  };

  return (
    <div className="space-y-4">
      <button
        onClick={() => setCameraOpen(true)}
        className="w-full py-4 rounded-xl border-2 border-dashed border-primary/30 text-primary font-medium text-sm hover:bg-primary/5 transition-colors"
      >
        Scan Food
      </button>

      <FoodCameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptureBase64={async (base64) => {
          await analyzeFood(base64);
        }}
        loading={loading}
      />

      {loading && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Analyzing...
        </div>
      )}

      {error && !result && (
        <div className="bg-red-50 rounded-xl p-4 space-y-2">
          <p className="text-sm text-red-600">{String(error)}</p>
          <button
            onClick={reset}
            className="text-sm text-red-500 font-medium flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              {result.foodName}
            </h3>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-orange-50 rounded-lg p-2">
                <p className="text-lg font-bold text-orange-600">
                  {result.totalCalories}
                </p>
                <p className="text-xs text-orange-500">cal</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-2">
                <p className="text-lg font-bold text-blue-600">
                  {result.totalProtein}g
                </p>
                <p className="text-xs text-blue-500">protein</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-2">
                <p className="text-lg font-bold text-amber-600">
                  {result.totalCarbs}g
                </p>
                <p className="text-xs text-amber-500">carbs</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-2">
                <p className="text-lg font-bold text-purple-600">
                  {result.totalFat}g
                </p>
                <p className="text-xs text-purple-500">fat</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={reset}
              className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Reset
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className={cn(
                "flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2",
                saved
                  ? "bg-green-500 text-white"
                  : "bg-primary text-primary-foreground",
                saving && "opacity-50"
              )}
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" /> Saved!
                </>
              ) : saving ? (
                "Saving..."
              ) : (
                <>
                  <Save className="w-4 h-4" /> Log meal
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}