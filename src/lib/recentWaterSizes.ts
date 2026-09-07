import { readJson, writeJson, scopedKey } from "@/lib/localStore";
import { MAX_SINGLE_LOG_ML } from "@/lib/waterUnits";
const keyFor = (uid: string) => scopedKey("tropos-water-recent-sizes", uid);
export function recentWaterSizes(uid: string | null): number[] {
  if (!uid) return [];
  const values = readJson<unknown>(keyFor(uid), []);
  return Array.isArray(values)
    ? [
        ...new Set(
          values.filter(
            (size): size is number =>
              Number.isInteger(size) && size > 0 && size <= MAX_SINGLE_LOG_ML
          )
        ),
      ].slice(0, 3)
    : [];
}
export function rememberWaterSize(uid: string, size: number) {
  if (!Number.isInteger(size) || size <= 0 || size > MAX_SINGLE_LOG_ML) return;
  writeJson(
    keyFor(uid),
    [
      size,
      ...recentWaterSizes(uid).filter((previous) => previous !== size),
    ].slice(0, 3)
  );
}
