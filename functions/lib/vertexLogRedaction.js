/**
 * 2026-05-26 audit PR 4 (finding #10) — redact Vertex AI responses
 * before logging. Pre-PR-4 the full response body was written to
 * Cloud Logging via `JSON.stringify(data)`, which carried personal
 * health-adjacent content (food names, nutrition descriptions,
 * coaching prompts derived from the user's body metrics). Not
 * exfiltrable from outside, but it widened the data-residency
 * footprint unnecessarily.
 *
 * Returns metadata only: HTTP-shaped fields + structural existence
 * flags. The diagnostic signal needed to debug a Vertex outage
 * (status code, error code, presence of candidates) stays; the
 * actual generated text + image inputs don't.
 *
 * `httpStatus` is taken from `opts.httpStatus` (the caller's fetch
 * response.status) — the redactor itself does no I/O.
 */
function redactVertexResponse(data, opts = {}) {
  if (!data || typeof data !== "object") {
    return { hasData: false, httpStatus: opts.httpStatus };
  }
  const errorEnvelope =
    data.error && typeof data.error === "object" ? data.error : null;
  return {
    httpStatus: opts.httpStatus,
    hasError: !!errorEnvelope,
    errorCode: errorEnvelope && errorEnvelope.code,
    errorStatus: errorEnvelope && errorEnvelope.status,
    hasCandidates: Array.isArray(data.candidates) && data.candidates.length > 0,
    hasPredictions:
      Array.isArray(data.predictions) && data.predictions.length > 0,
    finishReason:
      data.candidates && data.candidates[0] && data.candidates[0].finishReason,
    promptFeedbackBlockReason:
      data.promptFeedback && data.promptFeedback.blockReason,
  };
}

module.exports = { redactVertexResponse };
