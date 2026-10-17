import { distanceToMetres, type DistanceUnit } from "./distanceUnits";

/** An editable input, not measured run distance. Canonical saved runs use metres. */
export interface ManualDistanceDraft {
  readonly version: 1;
  readonly raw: string;
  readonly unit: DistanceUnit;
}

/** Malformed optional input must not invalidate timer, route or coaching recovery. */
export function parseManualDistanceDraft(
  value: unknown
): ManualDistanceDraft | undefined {
  if (!value || typeof value !== "object") return undefined;
  const draft = value as Record<string, unknown>;
  if (
    draft.version !== 1 ||
    typeof draft.raw !== "string" ||
    (draft.unit !== "km" && draft.unit !== "mi")
  ) {
    return undefined;
  }
  return { version: 1, raw: draft.raw, unit: draft.unit };
}

/** Complete decimal/scientific numbers only; partial typing stays editable. */
export function manualDistanceMetres(
  raw: string,
  unit: DistanceUnit
): number | null {
  const text = raw.trim();
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    return null;
  }
  const metres = distanceToMetres(Number(text), unit);
  return Number.isFinite(metres) && metres >= 50 && metres <= 100000
    ? metres
    : null;
}
