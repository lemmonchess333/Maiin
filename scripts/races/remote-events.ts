import { validDateKey } from "./date-parser";

export interface DateEvidence {
  dateKey: string;
  bundledDateKey: string;
  sourceUrl: string;
  checkedAt: string;
  sourceSha256: string;
}

/** A reviewed change to the bundled date supersedes automation. Unrelated
 * catalogue deployments preserve dates already refreshed by the daily job. */
export function preservedDate(
  bundledDate: string,
  remoteDate: unknown,
  evidence: Partial<DateEvidence> | undefined
): string {
  return validDateKey(remoteDate) &&
    evidence?.dateKey === remoteDate &&
    evidence?.bundledDateKey === bundledDate &&
    remoteDate > bundledDate
    ? remoteDate
    : bundledDate;
}
