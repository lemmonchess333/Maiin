import { useState } from "react";
import { auth } from "@/lib/firebase";
import { logger } from "@/lib/logger";

const FUNCTION_URL = "https://us-central1-adaptive-fitness-af8bb.cloudfunctions.net/analyzeFood";
const TEXT_FUNCTION_URL = "https://us-central1-adaptive-fitness-af8bb.cloudfunctions.net/analyzeFoodText";

/* Map the HTTP status returned by the analyzeFood callable into copy
   the user can act on. The server message is preferred when present
   (e.g. validation failures carry useful text); otherwise we fall
   back to status-based phrasing so the toast never shows "[object
   Object]" or a raw "Analysis failed". */
function friendlyFoodAnalysisError(status: number, serverMessage?: string): string {
  if (serverMessage) return serverMessage;
  if (status === 401 || status === 403) return "Please sign in again to log food.";
  if (status === 429) return "Too many photos analysed. Please wait a moment.";
  if (status >= 500) return "Food analysis is temporarily unavailable. Please try again.";
  return "Couldn't analyse this photo. Please try again.";
}

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
        throw new Error(
          friendlyFoodAnalysisError(response.status, errorBody?.message || errorBody?.error),
        );
      }

      const data = await response.json();
      setResult(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't analyse this photo. Please try again.";
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

      if (!response.ok) {
        logger.error('[analyzeFoodText] HTTP error', response.status);
        return null;
      }
      return await response.json();
    } catch (e) {
      logger.error('[analyzeFoodText] failed', e);
      return null;
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { analyzeFood, analyzeFoodText, loading, error, result, reset };
}
