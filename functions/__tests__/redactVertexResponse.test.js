/**
 * 2026-05-26 audit PR 4 (finding #10) — Vertex AI response
 * redaction. Pins the redactor's contract so a future "let's just
 * log the whole thing for debugging" never lands.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { redactVertexResponse } = require("../lib/vertexLogRedaction");

describe("redactVertexResponse", () => {
  it("returns hasData=false for null/undefined/non-object input", () => {
    expect(redactVertexResponse(null)).toEqual({
      hasData: false,
      httpStatus: undefined,
    });
    expect(redactVertexResponse(undefined)).toEqual({
      hasData: false,
      httpStatus: undefined,
    });
    expect(redactVertexResponse("a string")).toEqual({
      hasData: false,
      httpStatus: undefined,
    });
    expect(redactVertexResponse(42, { httpStatus: 503 })).toEqual({
      hasData: false,
      httpStatus: 503,
    });
  });

  it("does not include any field that could carry user content", () => {
    // The actual Vertex response — full of food-name / nutrition /
    // prompt-derived text — must NOT survive into the redacted shape.
    const fullResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'User-supplied food name: "Greek salad with feta, kalamata olives, 200g chicken breast" — nutrition: ...',
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
      promptFeedback: { blockReason: null },
    };
    const redacted = redactVertexResponse(fullResponse, { httpStatus: 200 });
    const stringified = JSON.stringify(redacted);
    expect(stringified).not.toContain("Greek salad");
    expect(stringified).not.toContain("chicken breast");
    expect(stringified).not.toContain("nutrition");
    expect(stringified).not.toContain("User-supplied");
  });

  it("captures Vertex-side error envelope (code + status)", () => {
    const errResponse = {
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        message: "Quota exceeded for query rate.",
      },
    };
    const r = redactVertexResponse(errResponse, { httpStatus: 429 });
    expect(r.hasError).toBe(true);
    expect(r.errorCode).toBe(429);
    expect(r.errorStatus).toBe("RESOURCE_EXHAUSTED");
    expect(r.httpStatus).toBe(429);
    // message stays out — it can carry user prompt fragments back
    expect(JSON.stringify(r)).not.toContain("Quota exceeded");
  });

  it("captures candidate presence + finishReason without text", () => {
    const r = redactVertexResponse(
      {
        candidates: [
          {
            content: { parts: [{ text: "some response text" }] },
            finishReason: "MAX_TOKENS",
          },
        ],
      },
      { httpStatus: 200 }
    );
    expect(r.hasCandidates).toBe(true);
    expect(r.finishReason).toBe("MAX_TOKENS");
    expect(JSON.stringify(r)).not.toContain("response text");
  });

  it("captures prediction presence (legacy Vertex envelope)", () => {
    const r = redactVertexResponse(
      { predictions: ["some legacy prediction text"] },
      { httpStatus: 200 }
    );
    expect(r.hasPredictions).toBe(true);
    expect(JSON.stringify(r)).not.toContain("legacy prediction");
  });

  it("captures promptFeedback block reason (safety filters)", () => {
    const r = redactVertexResponse(
      {
        promptFeedback: { blockReason: "SAFETY" },
      },
      { httpStatus: 200 }
    );
    expect(r.promptFeedbackBlockReason).toBe("SAFETY");
  });

  it("flags empty / missing candidates", () => {
    expect(redactVertexResponse({ candidates: [] }, {}).hasCandidates).toBe(
      false
    );
    expect(redactVertexResponse({}, {}).hasCandidates).toBe(false);
  });
});
