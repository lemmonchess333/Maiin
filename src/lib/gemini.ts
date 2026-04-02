// Gemini AI integration — proxied through Cloud Functions
// The API key never leaves the server. Client calls the askGeminiText
// callable function which handles auth, rate limiting, and the Vertex AI call.

import { functions } from "./firebase";
import { httpsCallable } from "firebase/functions";

export interface GeminiResponse {
  text: string;
  error?: string;
}

const askGeminiCallable = httpsCallable<{ prompt: string }, { text: string }>(
  functions,
  "askGeminiText",
);

export async function askGemini(prompt: string): Promise<GeminiResponse> {
  try {
    const result = await askGeminiCallable({ prompt });
    return { text: result.data.text };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "AI request failed";

    // Surface rate-limit errors clearly
    if (message.includes("resource-exhausted") || message.includes("Rate limit")) {
      return { text: "", error: "Rate limit reached. Please wait a moment before trying again." };
    }

    return { text: "", error: message };
  }
}

// Generate next week's training plan
export async function generateWeeklyPlan(
  athleteType: string,
  _currentStats: Record<string, number>,
): Promise<GeminiResponse> {
  return askGemini(
    `Generate a weekly training plan for a ${athleteType} athlete.`,
  );
}

// AI macro adjustments based on progress
export async function adjustMacros(
  _currentMacros: Record<string, number>,
  _progressData: Record<string, number>,
): Promise<GeminiResponse> {
  return askGemini("Suggest macro adjustments based on current progress.");
}
