/**
 * The food analyses' model (lib/foodModel.js): one model for both, set in
 * one place, with the settings a Gemini 3 model needs, and an answer read
 * without the model's thinking.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  FOOD_MODEL,
  foodModelUrl,
  foodGenerationConfig,
  foodResponseText,
} = require("../lib/foodModel");

const index = readFileSync(
  fileURLToPath(new URL("../index.js", import.meta.url)),
  "utf8"
);

describe("the food model", () => {
  it("is named in one place: index.js calls no model by name", () => {
    // gemini-2.0-flash sat hard-coded at both call sites and went on
    // being called four months after Vertex retired it.
    expect(index).not.toMatch(/publishers\/google\/models\/gemini-/);
    expect(index.match(/foodModelUrl\(projectId\)/g)).toHaveLength(2);
  });

  it("is reached in us-central1, in the project given", () => {
    expect(foodModelUrl("adaptive-fitness-af8bb")).toBe(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/" +
        "adaptive-fitness-af8bb/locations/us-central1/publishers/google/" +
        `models/${FOOD_MODEL}:generateContent`
    );
  });

  it("thinks by level, leaves temperature alone and asks for JSON", () => {
    const config = foodGenerationConfig();
    expect(config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    // A thinking budget is deprecated on Gemini 3 and can fail the request.
    expect(config.thinkingConfig).not.toHaveProperty("thinkingBudget");
    expect(config).not.toHaveProperty("temperature");
    expect(config.responseMimeType).toBe("application/json");
    // The cap counts the thinking too.
    expect(config.maxOutputTokens).toBeGreaterThanOrEqual(8192);
  });

  it("hands each request its own settings to change", () => {
    const first = foodGenerationConfig();
    first.thinkingConfig.thinkingLevel = "HIGH";
    expect(foodGenerationConfig().thinkingConfig.thinkingLevel).toBe("LOW");
  });
});

describe("foodResponseText", () => {
  it("joins the answer's text parts and leaves the thinking out", () => {
    expect(
      foodResponseText({
        candidates: [
          {
            content: {
              parts: [
                { text: "Plate of rice…", thought: true },
                { text: '{"foodName": "Rice' },
                { text: ' bowl"}', thoughtSignature: "abc" },
              ],
            },
          },
        ],
      })
    ).toBe('{"foodName": "Rice bowl"}');
  });

  it("is empty when the answer has parts but no text", () => {
    expect(
      foodResponseText({ candidates: [{ content: { parts: [{}] } }] })
    ).toBe("");
  });

  it("is null for a response without parts", () => {
    expect(foodResponseText({})).toBeNull();
    expect(foodResponseText(null)).toBeNull();
    expect(
      foodResponseText({ candidates: [{ finishReason: "SAFETY" }] })
    ).toBeNull();
  });
});
