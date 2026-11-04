import { readJson, scopedKey, writeJson } from "@/lib/localStore";
import { MEDAL_TIER_RANK, type Medal, type RevealedMedals } from "./medals";

/**
 * Which medals this device has revealed (Soc15): for each challenge, the
 * highest tier its reveal has shown. Per account, as every per-account
 * key on the device is (`scopedKey`).
 *
 * On the device rather than on the medal, deliberately. The medal is
 * server-written and the rules let no client write it, which is what
 * keeps a forged gold off the trophy case; a field the client could set
 * on it would need a rule of its own, and buy only one thing: not seeing
 * a reveal twice on a second phone. The reveal window
 * (MEDAL_REVEAL_WINDOW_DAYS) bounds that case, so a reinstall or a new
 * phone replays at most two weeks of medals, once each.
 */
const keyFor = (uid: string) => scopedKey("medalReveals", uid);
/** Enough for years of medals; the oldest entries go first. */
const KEEP = 120;

export function revealedMedals(uid: string): RevealedMedals {
  const stored = readJson<unknown>(keyFor(uid), {});
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  const out: Record<string, number> = {};
  for (const [id, rank] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof rank === "number" && rank >= 1 && rank <= 3) out[id] = rank;
  }
  return out;
}

/** Record that this medal's reveal has shown, at its tier. */
export function markMedalRevealed(uid: string, medal: Medal): void {
  const current = revealedMedals(uid);
  const rank = Math.max(
    current[medal.challengeId] ?? 0,
    MEDAL_TIER_RANK[medal.tier]
  );
  // Re-inserted last, so the oldest entries are the ones dropped.
  const rest = Object.entries(current).filter(
    ([id]) => id !== medal.challengeId
  );
  const next = Object.fromEntries([
    ...rest.slice(Math.max(0, rest.length - (KEEP - 1))),
    [medal.challengeId, rank],
  ]);
  writeJson(keyFor(uid), next);
}
