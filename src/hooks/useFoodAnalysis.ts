import { useState } from "react";
import { auth } from "@/lib/firebase";

const FUNCTION_URL = "https://us-central1-adaptive-fitness-af8bb.cloudfunctions.net/analyzeFood";
const TEXT_FUNCTION_URL = "https://us-central1-adaptive-fitness-af8bb.cloudfunctions.net/analyzeFoodText";

export interface FoodItem {
  name: string;
  portionSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FoodAnalysis {
  foodName: string;
  items: FoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  confidence: string;
}

export function useFoodAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FoodAnalysis | null>(null);

  const analyzeFood = async (imageBase64: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in");

      const token = await user.getIdToken();

      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
        },
        body: JSON.stringify({ imageBase64 }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.message || errorBody?.error || "Analysis failed");
      }

      const data = await response.json();
      setResult(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const analyzeFoodText = async (text: string): Promise<FoodAnalysis | null> => {
    try {
      const user = auth.currentUser;
      if (!user) return null;

      const token = await user.getIdToken();
      const response = await fetch(TEXT_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { analyzeFood, analyzeFoodText, loading, error, result, reset };
}
