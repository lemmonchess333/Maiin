/**
 * The share sheet's calls to `sharedCard` (functions/index.js, Soc17
 * call 1), and the sheet's card links built on them. Its own module,
 * loaded by ShareCardSheet when it opens, so the sheet carries none of it
 * until then. Each call answers what the sheet needs and never throws: a
 * card that cannot be kept is shared with the invite link instead
 * (`sharedCardShare.ts`).
 */
import { httpsCallable } from "firebase/functions";
import type { ShareCardRenderData } from "@/components/share/ShareCardRenderer";
import { functions } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { normaliseInviteCode } from "@/lib/inviteCode";
import {
  cardLinkSession,
  sharedCardCopy,
  type CardShare,
  type SharedCardCopy,
  type SharedCardSources,
} from "@/lib/sharedCardShare";

const sharedCard = () =>
  httpsCallable<Record<string, unknown>, Record<string, unknown>>(
    functions,
    "sharedCard"
  );

/** The sharer's invite code, made the first time, or null. Asked when the
 *  sheet opens, which also starts the function the Share tap will use. */
export async function prepareSharedCards(): Promise<string | null> {
  try {
    const res = await sharedCard()({ action: "prepare" });
    return normaliseInviteCode(res.data?.code);
  } catch {
    return null;
  }
}

/** Keep the card's copy under `token`; true once kept. */
export async function storeSharedCard(
  token: string,
  card: SharedCardCopy,
  sources: SharedCardSources
): Promise<boolean> {
  try {
    const res = await sharedCard()({ action: "store", token, card, sources });
    return res.data?.stored === true;
  } catch (err) {
    logger.warn("[shared-card] not kept", err);
    return false;
  }
}

/** Take the copy under `token` back. */
export async function removeSharedCard(token: string): Promise<void> {
  try {
    await sharedCard()({ action: "remove", token });
  } catch (err) {
    logger.warn("[shared-card] not taken back", err);
  }
}

/** One open sheet's card links: `begin` at each Share tap with the card
 *  as drawn, `close` when the sheet closes. */
export interface SheetCardLinks {
  begin: (data: ShareCardRenderData, sources: SharedCardSources) => CardShare;
  close: () => void;
}

export function startCardLinks(): SheetCardLinks {
  const session = cardLinkSession({
    store: storeSharedCard,
    remove: removeSharedCard,
  });
  return {
    begin: (data, sources) => session.begin(sharedCardCopy(data), sources),
    close: session.close,
  };
}
