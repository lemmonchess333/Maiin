import { useState } from "react";
import { auth } from "@/lib/firebase";
import { logger } from "@/lib/logger";

const FUNCTION_URL =
  "https://us-central1-adaptive-fitness-af8bb.cloudfunctions.net/analyzeFood";
const TEXT_FUNCTION_URL =
  "https://us-central1-adaptive-fitness-af8bb.cloudfunctions.net/analyzeFoodText";

/* A stalled request (accepted, response never arrives) is different from
   offline: nothing rejects until the TCP stack gives up, which can be
   minutes of dead laser. The cap turns that into an honest, actionable
   failure while staying far above a slow-but-working Gemini round-trip
   (typically 5-15s). */
const ANALYZE_TIMEOUT_MS = 45_000;

/* Map the HTTP status returned by the analyzeFood callable into copy
   the user can act on. The server message is preferred when present
   (e.g. rate-limit and quota failures carry the useful text); otherwise
   we fall back to status-based phrasing so the failure beat never shows
   "[object Object]" or a raw "Analysis failed". These strings surface
   VERBATIM in the scan modal's failure beat via `errorMessage` — keep
   them user-facing. */
function friendlyFoodAnalysisError(
  status: number,
  serverMessage?: string
): string {
  if (serverMessage) return serverMessage;
  if (status === 401 || status === 403)
    return "Please sign in again to log food.";
  if (status === 429) return "Too many photos analysed. Please wait a moment.";
  if (status >= 500)
    return "Food analysis is temporarily unavailable. Please try again.";
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

/** What one analyzeFood round-trip resolves to. `errorMessage` is the
 *  user-facing reason when `data` is null — the scan failure beat shows
 *  it verbatim, so a rate-limited user reads "wait a moment" instead of
 *  a generic connection line telling them to retry a closed window. */
export interface FoodAnalysisOutcome {
  data: FoodAnalysis | null;
  errorMessage: string | null;
}

export function useFoodAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FoodAnalysis | null>(null);

  const analyzeFood = async (
    imageBase64: string
  ): Promise<FoodAnalysisOutcome> => {
    setLoading(true);
    setError(null);
    setResult(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in");

      const token = await user.getIdToken();

      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ imageBase64 }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          friendlyFoodAnalysisError(
            response.status,
            errorBody?.message || errorBody?.error
          )
        );
      }

      const data = await response.json();
      /* Boundary assertion (the d.data() rule, applied to our own API):
         the server forwards Gemini's JSON with no shape validation, so a
         200 body is NOT proof of the contract. A missing/non-array
         `items` used to ship straight into React state and crash the
         Food page inside a render memo (`filterIdentifiableAiItems` on
         undefined). Malformed now reads as an ordinary failure. */
      if (
        !data ||
        typeof data !== "object" ||
        !Array.isArray((data as FoodAnalysis).items)
      ) {
        logger.error("[analyzeFood] malformed 200 body", data);
        throw new Error("The scan came back garbled. Please try again.");
      }

      setResult(data);
      return { data, errorMessage: null };
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "This is taking too long. Check your signal and try again."
          : err instanceof TypeError
            ? "Couldn't reach the server. Check your connection and try again."
            : err instanceof Error
              ? err.message
              : "Couldn't analyse this photo. Please try again.";
      setError(message);
      return { data: null, errorMessage: message };
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const analyzeFoodText = async (
    text: string
  ): Promise<FoodAnalysis | null> => {
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
        logger.error("[analyzeFoodText] HTTP error", response.status);
        return null;
      }
      return await response.json();
    } catch (e) {
      logger.error("[analyzeFoodText] failed", e);
      return null;
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { analyzeFood, analyzeFoodText, loading, error, result, reset };
}
