// Gemini AI integration
// Add VITE_GEMINI_API_KEY to your .env file to enable AI features
//
// SECURITY WARNING: The API key is bundled into the client JS and visible
// to anyone who inspects the page source. To limit exposure:
//   1. Restrict the key to the Gemini API only in Google Cloud Console
//   2. Add HTTP referrer restrictions (your domain + localhost)
//   3. Set a daily quota cap to limit abuse
// TODO (v1.2): Proxy Gemini calls through a Cloud Function so the key
// is never exposed to the client.

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

// Rate limiting: max 3 calls per 60 seconds per client
const MAX_CALLS_PER_MINUTE = 3;
const callTimestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  // Remove timestamps older than 60 seconds
  while (callTimestamps.length > 0 && now - callTimestamps[0] > 60_000) {
    callTimestamps.shift();
  }
  return callTimestamps.length >= MAX_CALLS_PER_MINUTE;
}

function recordCall(): void {
  callTimestamps.push(Date.now());
}

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

  if (isRateLimited()) {
    return {
      text: "",
      error: "Rate limit reached. Please wait a moment before trying again.",
    };
  }

  recordCall();

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { text };
  } catch (err) {
    return {
      text: "",
      error: err instanceof Error ? err.message : "AI request failed",
    };
  }
}

// Generate next week's training plan
export async function generateWeeklyPlan(
  athleteType: string,
  _currentStats: Record<string, number>
): Promise<GeminiResponse> {
  return askGemini(
    `Generate a weekly training plan for a ${athleteType} athlete.`
  );
}

// AI macro adjustments based on progress
export async function adjustMacros(
  _currentMacros: Record<string, number>,
  _progressData: Record<string, number>
): Promise<GeminiResponse> {
  return askGemini("Suggest macro adjustments based on current progress.");
}
