import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

/**
 * Joining or leaving the weekly leagues (Soc15 call 3), through the
 * setLeagueSharing callable: it stores the answer with the membership, and
 * on leaving deletes the person's standing and takes them out of their
 * group at once. The answer is not a profile field the app writes, so the
 * two cannot disagree. Returns how many people have joined and trained
 * lately, the figure the locked card shows.
 */
export async function setLeagueSharing(
  join: boolean
): Promise<{ joined: number | null }> {
  const result = await httpsCallable<{ join: boolean }, { joined?: unknown }>(
    functions,
    "setLeagueSharing"
  )({ join });
  const joined = result?.data?.joined;
  return { joined: typeof joined === "number" ? joined : null };
}
