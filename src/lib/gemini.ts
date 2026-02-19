// Phase 2: Gemini AI integration placeholder
// Add VITE_GEMINI_API_KEY to your .env file to enable AI features

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

export interface GeminiResponse {
  text: string;
  error?: string;
}

export async function askGemini(prompt: string): Promise<GeminiResponse> {
  if (!GEMINI_API_KEY) {
    return {
      text: "",
      error: "Gemini API key not configured. Add VITE_GEMINI_API_KEY to .env",
    };
  }

  // Phase 2: Implement real Gemini API call
  // For now, return a placeholder
  console.log("[Gemini] Prompt:", prompt);
  return {
    text: "AI features coming soon! This is a placeholder response.",
  };
}

// Phase 2: Generate next week's training plan
export async function generateWeeklyPlan(
  athleteType: string,
  _currentStats: Record<string, number>
): Promise<GeminiResponse> {
  return askGemini(
    `Generate a weekly training plan for a ${athleteType} athlete.`
  );
}

// Phase 2: AI macro adjustments based on progress
export async function adjustMacros(
  _currentMacros: Record<string, number>,
  _progressData: Record<string, number>
): Promise<GeminiResponse> {
  return askGemini("Suggest macro adjustments based on current progress.");
}
