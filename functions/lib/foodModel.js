"use strict";

/**
 * The Gemini model behind both food analyses (`analyzeFood`, a photo, and
 * `analyzeFoodText`, a typed meal), and the parts of a request and a
 * response that depend on which model it is.
 *
 * Both called `gemini-2.0-flash` until Vertex AI retired it, and
 * `gemini-2.5-flash` is retiring too, so the next step is the 3.x line:
 * `gemini-3.8-flash`, with no retirement date announced, the owner's choice
 * over 3.5 Flash and 3.1 Flash-Lite (Ship1 in the plan file has the dates).
 * It is served from us-central1, where the functions run.
 *
 * Gemini 3 and later models think before they answer, which changes three
 * settings:
 *   - Thinking is set by level; the old token budget is deprecated and can
 *     fail a request with 400. 3.8 Flash takes LOW, MEDIUM or HIGH and
 *     defaults to MEDIUM. LOW, because a person is waiting at the camera
 *     and reading a plate is a short task.
 *   - The output cap counts the thinking as well as the answer, so it has
 *     room for both: a cap the thinking used up would cut the JSON short.
 *   - Temperature stays at the model's default. Google advises against
 *     lowering it on Gemini 3, which the old 0.1 and 0.2 did.
 * The answer is asked for as JSON, which the parsers downstream still
 * defend against anyway.
 */
const FOOD_MODEL = "gemini-3.8-flash";
const FOOD_MODEL_LOCATION = "us-central1";

/** The generateContent endpoint for the food model in this project. */
function foodModelUrl(projectId) {
  return (
    `https://${FOOD_MODEL_LOCATION}-aiplatform.googleapis.com/v1/projects/` +
    `${projectId}/locations/${FOOD_MODEL_LOCATION}/publishers/google/models/` +
    `${FOOD_MODEL}:generateContent`
  );
}

/** Generation settings shared by both food requests. */
function foodGenerationConfig() {
  return {
    responseMimeType: "application/json",
    maxOutputTokens: 8192,
    thinkingConfig: { thinkingLevel: "LOW" },
  };
}

/**
 * The answer's text: every text part of the first candidate that is not
 * the model's own thinking, joined. Null when the response has no parts.
 */
function foodResponseText(data) {
  const parts =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts;
  if (!Array.isArray(parts)) return null;
  return parts
    .filter((part) => part && typeof part.text === "string" && !part.thought)
    .map((part) => part.text)
    .join("");
}

module.exports = {
  FOOD_MODEL,
  FOOD_MODEL_LOCATION,
  foodModelUrl,
  foodGenerationConfig,
  foodResponseText,
};
